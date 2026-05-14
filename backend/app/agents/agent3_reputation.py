"""
Agent 3 — Reputation Management Agent.
"""
from typing import Dict, Any
from langchain_groq import ChatGroq
from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import HumanMessage, AIMessage

from app.core.config import settings
from app.tools.reputation_tools import (
    fetch_and_categorise_reviews,
    generate_ai_reply,
    get_top_reviews,
)

REPUTATION_SYSTEM_PROMPT = """You are a reputation management specialist for a healthcare facility.

YOUR RESPONSIBILITIES:
1. Fetch and analyse hospital reviews from Google (and other platforms).
2. Categorise reviews: GOOD / MODERATE / HIGH RISK.
3. For HIGH RISK reviews: generate empathetic AI reply, send email alert to owner.
4. For all reviews requiring reply: generate professional responses (admin approval needed).
5. Answer admin queries like: "Show top 10 good reviews from yesterday."
6. Never post replies without explicit admin approval.

CATEGORISATION RULES:
- HIGH RISK: Contains keywords like "unhygienic", "negligence", "malpractice", "rude staff"
- MODERATE: Contains "long wait", "slow service", "average"
- GOOD: Positive or neutral reviews

RESPONSE FORMAT:
Always provide a structured summary including counts by category,
list of reviews, and any generated replies with approval status.
"""


_executor = None


def _get_executor() -> AgentExecutor:
    global _executor
    if _executor is None:
        llm = ChatGroq(
            groq_api_key=settings.GROQ_API_KEY,
            model=settings.GROQ_MODEL,
            temperature=0.2,
            max_tokens=1024,
        )
        tools = [fetch_and_categorise_reviews, generate_ai_reply, get_top_reviews]
        prompt = ChatPromptTemplate.from_messages([
            ("system", REPUTATION_SYSTEM_PROMPT),
            MessagesPlaceholder("chat_history", optional=True),
            ("human", "{input}"),
            MessagesPlaceholder("agent_scratchpad"),
        ])
        agent = create_tool_calling_agent(llm, tools, prompt)
        _executor = AgentExecutor(agent=agent, tools=tools, verbose=True,
                                  max_iterations=6, handle_parsing_errors=True)
    return _executor


async def run_reputation_agent(
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
    return {
        "agent": "agent3_reputation",
        "output": output,
        "high_risk_detected": "high risk" in output.lower() or "alert" in output.lower(),
    }
