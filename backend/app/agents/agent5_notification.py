"""
Agent 5 — Drug / Treatment Notification Agent.
"""
from typing import Dict, Any, Optional
from langchain_groq import ChatGroq
from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import HumanMessage, AIMessage

from app.core.config import settings
from app.tools.notification_tools import (
    find_relevant_patients,
    generate_treatment_email,
    preview_notification_campaign,
    mark_notifications_sent,
)

NOTIFICATION_SYSTEM_PROMPT = """You are a medical notification specialist responsible for
communicating new treatment updates to relevant patients.

YOUR RESPONSIBILITIES:
1. Accept treatment update information from doctors/admin.
2. Identify patients with relevant disease/symptom history.
3. Generate personalised email notifications using AI.
4. Present a campaign preview for manual approval.
5. Send notifications ONLY after explicit owner/admin approval.
6. Log all sent notifications.

WORKFLOW:
Step 1: Receive disease name + treatment details.
Step 2: Find relevant patients in the database.
Step 3: Generate personalised email template.
Step 4: Show preview to owner for approval.
Step 5: Wait for explicit "approve" or "send" confirmation.
Step 6: Execute send and log results.

CRITICAL SAFETY RULE:
NEVER send emails without explicit human approval.
Always show the preview and ask: "Do you approve sending this to [N] patients?"
"""


_executor = None


def _get_executor() -> AgentExecutor:
    global _executor
    if _executor is None:
        llm = ChatGroq(
            groq_api_key=settings.GROQ_API_KEY,
            model=settings.GROQ_MODEL,
            temperature=0.3,
            max_tokens=1024,
        )
        tools = [find_relevant_patients, generate_treatment_email,
                 preview_notification_campaign, mark_notifications_sent]
        prompt = ChatPromptTemplate.from_messages([
            ("system", NOTIFICATION_SYSTEM_PROMPT),
            MessagesPlaceholder("chat_history", optional=True),
            ("human", "{input}"),
            MessagesPlaceholder("agent_scratchpad"),
        ])
        agent = create_tool_calling_agent(llm, tools, prompt)
        _executor = AgentExecutor(
            agent=agent, tools=tools, verbose=True,
            max_iterations=8, handle_parsing_errors=True,
            return_intermediate_steps=True,
        )
    return _executor


def _extract_campaign_data(intermediate_steps: list) -> Optional[Dict]:
    """Pull campaign details from the generate_treatment_email tool result."""
    for action, observation in intermediate_steps:
        if getattr(action, "tool", "") == "generate_treatment_email" and isinstance(observation, dict):
            tool_input = getattr(action, "tool_input", {}) or {}
            return {
                "disease_name":      observation.get("disease_name", ""),
                "treatment_title":   observation.get("treatment_title", ""),
                "treatment_details": tool_input.get("treatment_details", ""),
                "email_template":    observation.get("email_template", ""),
            }
    return None


async def run_notification_agent(
    user_message: str, chat_history: list
) -> Dict[str, Any]:
    executor = _get_executor()
    lc_history = [
        HumanMessage(content=m["content"]) if m["role"] == "user"
        else AIMessage(content=m["content"])
        for m in chat_history[-8:]
    ]
    result = await executor.ainvoke(
        {"input": user_message, "chat_history": lc_history}
    )
    output = result.get("output", "")
    if isinstance(output, list):
        output = " ".join(
            block.get("text", "") for block in output
            if isinstance(block, dict) and block.get("type") == "text"
        )
    campaign_data = _extract_campaign_data(result.get("intermediate_steps", []))
    return {
        "agent":            "agent5_notification",
        "output":           output,
        "awaiting_approval": "approve" in output.lower() or "confirm" in output.lower(),
        "campaign_data":    campaign_data,
    }
