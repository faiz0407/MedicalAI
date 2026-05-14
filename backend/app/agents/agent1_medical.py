"""
Agent 1 — Medical Guidance Agent.

RAG pipeline:
  User query
      ↓
  Emergency check (keyword-based, instant)
      ↓
  BioBERT embed → Pinecone 'medical-rag' (rag_docs namespace, 483k vectors)
      ↓
  Retrieve top-20 candidates
      ↓
  Cross-encoder rerank → keep chunks with similarity ≥ 90%
      ↓
  If ≥ 1 chunk passes threshold → Claude citation-grounded response
  If 0 chunks pass threshold   → Claude answers from own medical knowledge
      ↓
  Appointment booking offer

LLM: Anthropic claude-sonnet-4-6 (replaced Groq LLaMA)
return_intermediate_steps=True so callers can inspect the RAG chunks.
"""
import json
import logging
from typing import Dict, Any, List, Optional

from langchain_groq import ChatGroq
from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import HumanMessage, AIMessage

logger = logging.getLogger(__name__)

from app.core.config import settings
from app.tools.medical_tools import (
    check_emergency,
    generate_home_remedies,
    suggest_videos,
    get_doctor_consultation_triggers,
)


MEDICAL_SYSTEM_PROMPT = """You are a professional biomedical assistant for a healthcare platform.
Your knowledge source is your own extensive medical training.
Use chat_history to maintain context — do not repeat information already given.

MANDATORY OPENING: Every medical response MUST begin with:
"⚠️ I am not a medical expert or licensed healthcare professional. The following information is for general educational purposes only and must not replace advice from a qualified doctor or healthcare provider."

CORE RULES:
1. Always call check_emergency first. If emergency detected: show advisory and stop.
2. Never diagnose or prescribe. Use hedged language: "research suggests…", "evidence shows…"
3. Call generate_home_remedies for supportive care suggestions.
4. Call get_doctor_consultation_triggers to identify red flags.
5. End every response with: "Would you like to book an appointment with one of our doctors?"
   If user says yes: "Routing you to our Appointment Agent now."

RESPONSE FORMAT:
⚠️ [Disclaimer]
## What We Know About This
## Supportive Care Suggestions
## When to Seek Medical Attention
## Medical Disclaimer
## Next Steps
"""

# Module-level singleton — built once, reused for every request
_executor: Optional[AgentExecutor] = None


def _build_executor() -> AgentExecutor:
    llm = ChatGroq(
        groq_api_key=settings.GROQ_API_KEY,
        model=settings.GROQ_MODEL,
        temperature=0.1,
        max_tokens=1024,
    )
    tools = [
        check_emergency,
        generate_home_remedies,
        suggest_videos,
        get_doctor_consultation_triggers,
    ]
    prompt = ChatPromptTemplate.from_messages([
        ("system", MEDICAL_SYSTEM_PROMPT),
        MessagesPlaceholder("chat_history", optional=True),
        ("human", "{input}"),
        MessagesPlaceholder("agent_scratchpad"),
    ])
    agent = create_tool_calling_agent(llm, tools, prompt)
    return AgentExecutor(
        agent=agent,
        tools=tools,
        verbose=True,
        max_iterations=6,
        handle_parsing_errors=True,
        return_intermediate_steps=True,
    )


def _get_executor() -> AgentExecutor:
    global _executor
    if _executor is None:
        _executor = _build_executor()
    return _executor


def _extract_rag_chunks(intermediate_steps: list) -> List[Dict]:
    """Pull knowledge_chunks out of the query_medical_knowledge tool result."""
    for action, observation in intermediate_steps:
        if getattr(action, "tool", "") != "query_medical_knowledge":
            continue
        if isinstance(observation, dict):
            chunks = observation.get("knowledge_chunks", [])
        else:
            try:
                chunks = json.loads(str(observation)).get("knowledge_chunks", [])
            except (ValueError, AttributeError):
                chunks = []
        return [
            {**c, "text": c["text"][:400] if len(c.get("text", "")) > 400 else c.get("text", "")}
            for c in chunks
        ]
    return []


async def run_medical_agent(
    user_message: str,
    user_id: int,
    session_id: str,
    chat_history: list,
    memory_context: str = "",
) -> Dict[str, Any]:
    """
    Entry point for Agent 1.
    Returns response dict with output, emergency flag, booking suggestion,
    and rag_sources (Pinecone chunks that passed the 90% threshold).
    """
    executor = _get_executor()

    lc_history = []
    for msg in chat_history[-10:]:
        if msg["role"] == "user":
            lc_history.append(HumanMessage(content=msg["content"]))
        elif msg["role"] == "assistant":
            lc_history.append(AIMessage(content=msg["content"]))

    context_prefix = f"[Prior context: {memory_context}]\n" if memory_context else ""
    enriched_input = f"{context_prefix}[User ID: {user_id} | Session: {session_id}]\n{user_message}"

    result = await executor.ainvoke({
        "input":        enriched_input,
        "chat_history": lc_history,
    })

    output = result.get("output", "")
    if isinstance(output, list):
        output = " ".join(
            block.get("text", "") for block in output
            if isinstance(block, dict) and block.get("type") == "text"
        )
    intermediate_steps = result.get("intermediate_steps", [])
    rag_chunks = _extract_rag_chunks(intermediate_steps)

    if rag_chunks:
        logger.info(
            "RAG | session=%s | %d chunks passed 90%% threshold | top cross=%.3f",
            session_id, len(rag_chunks),
            rag_chunks[0].get("cross_score", 0),
        )
        for i, c in enumerate(rag_chunks, 1):
            logger.debug(
                "RAG chunk %d | citation=%s | score=%.3f | cross=%.3f\n%s",
                i, c.get("citation", "n/a"),
                c.get("score", 0), c.get("cross_score", 0),
                c.get("text", "")[:300],
            )
    else:
        logger.info(
            "RAG | session=%s | 0 chunks passed 90%% threshold — LLM using own knowledge",
            session_id,
        )

    should_book = any(phrase in output.lower() for phrase in [
        "routing you to our appointment agent",
        "book an appointment",
        "would you like to book",
    ])

    is_emergency = any(kw in user_message.lower() for kw in [
        "chest pain", "difficulty breathing", "cannot breathe",
        "seizure", "unconscious", "heart attack", "stroke",
        "severe bleeding", "anaphylaxis", "choking",
    ])

    return {
        "agent":           "agent1_medical",
        "output":          output,
        "is_emergency":    is_emergency,
        "suggest_booking": should_book,
        "route_to_agent2": should_book,
        "rag_sources":     rag_chunks,
    }
