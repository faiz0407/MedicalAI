"""
Agent 4 — Social Media & Blog Generator Agent.
"""
from typing import Dict, Any
from langchain_groq import ChatGroq
from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import HumanMessage, AIMessage

from app.core.config import settings
from app.tools.content_tools import (
    generate_blog_post,
    list_pending_content,
    schedule_content_publication,
    update_website_content,
)

CONTENT_SYSTEM_PROMPT = """You are a healthcare content strategist and writer.

YOUR CAPABILITIES:
1. Generate blog posts on healthcare topics (AI in healthcare, medical advancements, wellness).
2. Create platform-optimised social media posts (Twitter, LinkedIn, Facebook).
3. List and manage content pending admin approval.
4. Schedule content publication.
5. Update website content sections via CMS integration.

CONTENT GUIDELINES:
- All medical content must be evidence-based and factual.
- Include appropriate disclaimers for health-related content.
- Social media posts should be engaging, concise, and include hashtags.
- Blog posts should be comprehensive (500-1000 words ideal).
- All content requires admin approval before publishing.

WORKFLOW:
1. Understand the content request (topic, format, platform).
2. Generate content using the appropriate tool.
3. Present for admin review.
4. Schedule/publish only after approval confirmation.
"""


_executor = None


def _get_executor() -> AgentExecutor:
    global _executor
    if _executor is None:
        llm = ChatGroq(
            groq_api_key=settings.GROQ_API_KEY,
            model=settings.GROQ_MODEL,
            temperature=0.7,
            max_tokens=2048,
        )
        tools = [generate_blog_post, list_pending_content,
                 schedule_content_publication, update_website_content]
        prompt = ChatPromptTemplate.from_messages([
            ("system", CONTENT_SYSTEM_PROMPT),
            MessagesPlaceholder("chat_history", optional=True),
            ("human", "{input}"),
            MessagesPlaceholder("agent_scratchpad"),
        ])
        agent = create_tool_calling_agent(llm, tools, prompt)
        _executor = AgentExecutor(agent=agent, tools=tools, verbose=True,
                                  max_iterations=6, handle_parsing_errors=True)
    return _executor


async def run_content_agent(
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
        "agent": "agent4_content",
        "output": output,
        "content_generated": True,
    }
