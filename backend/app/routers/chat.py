"""
Chat Router — the primary interface between frontend and the MasterAgent.
All user messages enter here and are routed to the appropriate sub-agent.

Chat sessions and messages are persisted to DynamoDB (free-tier friendly).
PostgreSQL is still used for rolling summaries, audit logs, and user data.
"""
import asyncio
import uuid
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Request
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.db.database import get_db
from app.db import crud
from app.db.dynamo_chat import dynamo_chat
from app.core.security import get_current_user, TokenData
from app.memory.session_memory import (
    init_session, add_message, get_messages,
    get_session_context, get_agents_used, get_message_count,
)
from app.memory.rolling_summary import (
    load_rolling_summaries, build_memory_context_string,
    generate_daily_summary, store_summary_in_db,
)
from app.agents.master_agent import master_agent

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/chat", tags=["Chat"])

_SYMPTOM_KEYWORDS = {
    "fever", "cough", "headache", "chest pain", "fatigue", "nausea",
    "vomiting", "diarrhea", "shortness of breath", "dizziness", "rash",
    "sore throat", "runny nose", "back pain", "joint pain", "diabetes",
    "hypertension", "asthma", "arthritis", "depression", "anxiety",
    "cancer", "infection", "allergy", "flu", "cold", "migraine",
    "seizure", "stroke", "heart attack", "anemia", "insomnia",
    "constipation", "bloating", "kidney", "liver", "pain",
}


# ─── Schemas ─────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    force_intent: Optional[str] = None
    route_context: Optional[dict] = None


class RagChunk(BaseModel):
    text: str
    citation: str
    score: float
    cross_score: float


class ChatResponse(BaseModel):
    session_id: str
    response: str
    agent_used: str
    intent_detected: str
    is_emergency: bool = False
    suggest_booking: bool = False
    rag_sources: Optional[List[RagChunk]] = None


class SessionSummary(BaseModel):
    session_id: str
    title: str
    last_active: str
    message_count: int
    created_at: str


# ─── Background: persist messages to DynamoDB ────────────────────────────────

async def _persist_messages(
    session_id: str, user_id: int,
    user_msg: str, ai_response: str,
    agent_used: str, rag_sources: Optional[List[dict]],
):
    try:
        # Get or create session (first call creates it with title="New Chat")
        session = await dynamo_chat.get_or_create_session(user_id, session_id)
        is_new = int(session.get("message_count", 0)) == 0

        # Save user and assistant messages concurrently
        ai_metadata = {"rag_sources": rag_sources} if rag_sources else {}
        await asyncio.gather(
            dynamo_chat.save_message(session_id, "user", user_msg),
            dynamo_chat.save_message(
                session_id, "assistant", ai_response,
                agent_used=agent_used, metadata=ai_metadata,
            ),
        )

        # Update session: set title from first user message, increment count by 2
        title = user_msg[:60].strip() if is_new else None
        await dynamo_chat.update_session(user_id, session_id, title=title, delta=2)

    except Exception as exc:
        logger.error("DynamoDB persist error: %s", exc)


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.post("/message", response_model=ChatResponse)
async def send_message(
    body: ChatRequest,
    background_tasks: BackgroundTasks,
    request: Request,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Main chat endpoint — routes to appropriate agent via MasterAgent."""

    # 1. Session management
    session_id = body.session_id or str(uuid.uuid4())
    user = await crud.get_user_by_id(db, current_user.user_id)
    if not user:
        raise HTTPException(404, "User not found")

    user_context = {
        "name":   user.full_name or user.username,
        "age":    user.age,
        "gender": user.gender,
        "role":   user.role.value,
    }

    await init_session(session_id, current_user.user_id, user_context)

    # 2. Load rolling memory context
    await load_rolling_summaries(db, current_user.user_id)
    memory_context = build_memory_context_string(current_user.user_id)

    # 3. Get chat history — hydrate from DynamoDB when session is resumed
    #    (in-memory store is empty after a server restart or on first request
    #     for a session that previously existed only in DynamoDB)
    chat_history = await get_messages(session_id, last_n=20)
    if not chat_history and body.session_id:
        try:
            dynamo_messages = await dynamo_chat.get_messages(body.session_id, limit=50)
            for m in dynamo_messages:
                await add_message(session_id, m["role"], m["content"],
                                  agent=m.get("agent_used"))
            chat_history = await get_messages(session_id, last_n=20)
            if chat_history:
                logger.info(
                    "Hydrated session %s from DynamoDB (%d messages)",
                    session_id, len(chat_history),
                )
        except Exception as exc:
            logger.warning("DynamoDB session hydration failed: %s", exc)

    # 4. Add user message to in-memory store
    await add_message(session_id, "user", body.message)

    # 5. Basic prompt injection guard
    sanitised_message = _sanitise_input(body.message)

    # 6. Run through MasterAgent
    try:
        result = await master_agent.process(
            message=sanitised_message,
            user_id=current_user.user_id,
            session_id=session_id,
            chat_history=chat_history,
            user_context=user_context,
            memory_context=memory_context,
            force_intent=body.force_intent,
            route_context=body.route_context,
        )
    except Exception as exc:
        logger.error("Agent error: %s", exc, exc_info=True)
        raise HTTPException(500, f"Agent processing error: {str(exc)}")

    ai_response  = result.get("output", "I encountered an error. Please try again.")
    agent_used   = result.get("agent", "unknown")
    rag_sources  = result.get("rag_sources") or []

    # 7. Store AI response in in-memory store
    await add_message(session_id, "assistant", ai_response, agent=agent_used)

    # 7a. Persist appointment to PostgreSQL when agent2 completes a booking
    booking_data = result.get("booking_data")
    if booking_data and booking_data.get("scheduled_time"):
        try:
            from datetime import datetime as dt
            appt_time = dt.strptime(booking_data["scheduled_time"], "%Y-%m-%d %H:%M")
            appt = await crud.create_appointment(
                db,
                patient_id=result.get("patient_id", current_user.user_id),
                department=booking_data.get("department", ""),
                appointment_time=appt_time,
                symptoms_summary=booking_data.get("symptoms_summary", ""),
            )
            if booking_data.get("payment_reference"):
                await crud.update_appointment_payment(
                    db, appt.id,
                    payment_status="paid",
                    payment_reference=booking_data["payment_reference"],
                    confirmation_link=booking_data.get("confirmation_link", ""),
                )
            logger.info(
                "Appointment #%d persisted to PostgreSQL | patient=%d | dept=%s | time=%s",
                appt.id, current_user.user_id,
                booking_data.get("department"), booking_data["scheduled_time"],
            )
        except Exception as exc:
            logger.warning("Failed to persist appointment to PostgreSQL: %s", exc)

    # 7b. Persist symptoms to PostgreSQL for every Agent 1 (medical) interaction
    if agent_used == "agent1_medical":
        background_tasks.add_task(
            _save_symptoms, db, current_user.user_id, session_id,
            sanitised_message, result.get("is_emergency", False),
        )

    # 7c. Persist notification campaign when Agent 5 generates one
    campaign_data = result.get("campaign_data")
    if campaign_data and agent_used == "agent5_notification":
        try:
            await crud.create_notification_campaign(
                db,
                disease_name=campaign_data.get("disease_name", ""),
                treatment_title=campaign_data.get("treatment_title", ""),
                treatment_details=campaign_data.get("treatment_details", ""),
                email_template=campaign_data.get("email_template", ""),
            )
            logger.info(
                "Notification campaign saved | disease=%s | session=%s",
                campaign_data.get("disease_name"), session_id,
            )
        except Exception as exc:
            logger.warning("Failed to save notification campaign: %s", exc)

    # 8. Handle emergency flag
    if result.get("is_emergency"):
        background_tasks.add_task(
            _flag_emergency, db, current_user.user_id, session_id, sanitised_message
        )

    # 9. Persist to DynamoDB asynchronously
    background_tasks.add_task(
        _persist_messages, session_id, current_user.user_id,
        sanitised_message, ai_response, agent_used, rag_sources,
    )

    await crud.log_audit(
        db, current_user.user_id, "chat_message", "chat",
        details={"agent": agent_used, "intent": result.get("intent_detected")},
        ip_address=request.client.host,
    )

    return ChatResponse(
        session_id=session_id,
        response=ai_response,
        agent_used=agent_used,
        intent_detected=result.get("intent_detected", "unknown"),
        is_emergency=result.get("is_emergency", False),
        suggest_booking=result.get("suggest_booking", False),
        rag_sources=[RagChunk(**c) for c in rag_sources] if rag_sources else None,
    )


@router.get("/sessions")
async def list_sessions(
    current_user: TokenData = Depends(get_current_user),
):
    """List all chat sessions for the current user, newest first."""
    sessions = await dynamo_chat.list_sessions(current_user.user_id)
    return {
        "sessions": [
            {
                "session_id":    s["session_id"],
                "title":         s.get("title", "New Chat"),
                "last_active":   s.get("last_active", ""),
                "message_count": int(s.get("message_count", 0)),
                "created_at":    s.get("created_at", ""),
            }
            for s in sessions
        ]
    }


@router.delete("/sessions/{session_id}")
async def delete_session(
    session_id: str,
    current_user: TokenData = Depends(get_current_user),
):
    """Delete a session and all its messages."""
    await dynamo_chat.delete_session(current_user.user_id, session_id)
    return {"deleted": True, "session_id": session_id}


@router.get("/history/{session_id}")
async def get_chat_history(
    session_id: str,
    current_user: TokenData = Depends(get_current_user),
):
    """Get conversation history for a session from DynamoDB."""
    messages = await dynamo_chat.get_messages(session_id, limit=100)
    return {
        "session_id": session_id,
        "messages": [
            {
                "role":       m["role"],
                "content":    m["content"],
                "agent":      m.get("agent_used"),
                "timestamp":  m["created_at"],
                "rag_sources": (m.get("metadata") or {}).get("rag_sources"),
            }
            for m in messages
        ],
    }


@router.post("/session/{session_id}/summarise")
async def summarise_session(
    session_id: str,
    background_tasks: BackgroundTasks,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Manually trigger a daily summary for a session."""
    messages    = await get_messages(session_id)
    agents_used = await get_agents_used(session_id)
    count       = await get_message_count(session_id)

    summary_text = await generate_daily_summary(
        current_user.user_id, messages, agents_used
    )
    from datetime import datetime
    await store_summary_in_db(
        db, current_user.user_id,
        datetime.utcnow(), summary_text,
        count // 2, agents_used,
    )
    return {"summary": summary_text, "session_id": session_id}


# ─── Helpers ─────────────────────────────────────────────────────────────────

async def _save_symptoms(
    db: AsyncSession, user_id: int, session_id: str,
    raw_text: str, is_emergency: bool,
):
    try:
        text_lower = raw_text.lower()
        matched = [kw for kw in _SYMPTOM_KEYWORDS if kw in text_lower]
        severity = "high" if is_emergency else ("medium" if matched else "low")
        await crud.save_symptoms(
            db,
            user_id=user_id,
            session_id=session_id,
            symptoms_list=matched,
            raw_text=raw_text,
            severity=severity,
            is_emergency=is_emergency,
            ai_response="",
        )
    except Exception as exc:
        logger.warning("Failed to save symptoms: %s", exc)


def _sanitise_input(text: str) -> str:
    blocked = [
        "ignore previous instructions",
        "disregard your instructions",
        "forget your system prompt",
        "you are now",
        "act as if you are",
        "pretend you are",
    ]
    text_lower = text.lower()
    for pattern in blocked:
        if pattern in text_lower:
            return "[Input contained policy-violating content and was sanitised]"
    return text[:2000]


async def _flag_emergency(
    db: AsyncSession, user_id: int, session_id: str, message: str
):
    await crud.log_audit(
        db, user_id, "EMERGENCY_DETECTED", "symptoms",
        details={"session_id": session_id, "message_snippet": message[:200]},
    )
