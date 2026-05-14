"""
MasterAgent — Central Orchestrator.

Architecture:
  User Message
       ↓
  Intent Detection  (Groq llama-3.1-8b-instant — fast, cheap, 20 tokens)
       ↓
  Tool Router (maps intent → agent)
       ↓
  Sub-Agent Execution
       ↓
  Response + Memory Update

The user sees ONE unified chatbot; internally we route to the
appropriate specialist agent based on detected intent.
"""
from typing import Dict, Any, List, Optional
from enum import Enum
import logging

from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage, SystemMessage

from app.core.config import settings

logger = logging.getLogger(__name__)


class AgentIntent(str, Enum):
    MEDICAL_GUIDANCE   = "medical_guidance"
    APPOINTMENT        = "appointment"
    REPUTATION         = "reputation"
    CONTENT_GENERATION = "content_generation"
    NOTIFICATION       = "notification"
    GENERAL            = "general"


INTENT_CLASSIFIER_PROMPT = """You are an intent classifier for a healthcare AI system.
Classify the user's message into EXACTLY ONE of these categories:

1. medical_guidance — User reports symptoms, asks about conditions, home remedies,
   health advice, or medical questions. Example: "I have a headache and fever"

2. appointment — User wants to book, reschedule, cancel, or inquire about appointments,
   or asks for feedback on a past visit. Example: "Book me an appointment tomorrow"

3. reputation — Admin/doctor asking about reviews, ratings, hospital reputation,
   or requesting reply management. Example: "Show me today's negative reviews"

4. content_generation — Admin requesting blog posts, social media content, or
   website content updates. Example: "Write a blog post about AI in healthcare"

5. notification — Doctor/admin wants to notify patients about new treatments or drugs.
   Example: "Notify all diabetes patients about the new insulin treatment"

6. general — Greetings, general questions about the system, or unclear intent.
   Example: "Hello", "What can you do?"

CRITICAL BOOKING RULE: If the conversation context shows the assistant just offered
to book an appointment AND the user's message is a short affirmative or booking phrase
such as "yes", "ok", "sure", "book", "now book", "book it", "yes book", "proceed",
"go ahead", "confirm", "i want to book", "book appointment", or similar — classify
as "appointment" regardless of any prior medical topic.

Respond with ONLY the category name (lowercase, underscored). Nothing else.
"""


GENERAL_RESPONSE_PROMPT = """You are HealthAI, a unified AI healthcare assistant.
You help patients with medical guidance, appointment booking, and general health information.
You also help hospital administrators with reputation management, content generation,
and patient notifications.

Be warm, professional, and concise. For medical queries, always add appropriate disclaimers.

If the user greets you, introduce yourself and ask how you can help today.
If the user asks what you can do, list your capabilities clearly.
"""


class MasterAgent:
    """
    Singleton orchestrator that routes user messages to the correct sub-agent.
    Intent classification uses llama-3.1-8b-instant (fast/cheap).
    General responses use llama-3.3-70b-versatile (quality).
    """

    def __init__(self):
        # Fast model: intent classification only — returns a single label word
        self._intent_llm = ChatGroq(
            groq_api_key=settings.GROQ_API_KEY,
            model=settings.GROQ_MODEL_FAST,
            temperature=0.0,   # deterministic — classification should not be random
            max_tokens=20,
        )
        # Full model: general greeting / help responses
        self._general_llm = ChatGroq(
            groq_api_key=settings.GROQ_API_KEY,
            model=settings.GROQ_MODEL,
            temperature=0.7,
            max_tokens=1024,
        )

    async def classify_intent(self, message: str,
                               chat_history: List[Dict]) -> AgentIntent:
        """Classify message intent using Haiku."""
        context_snippet = ""
        for msg in chat_history[-4:]:
            context_snippet += f"{msg['role'].upper()}: {msg['content'][:100]}\n"

        try:
            response = await self._intent_llm.ainvoke([
                SystemMessage(content=INTENT_CLASSIFIER_PROMPT),
                HumanMessage(content=f"Context:\n{context_snippet}\nMessage: {message}"),
            ])
            intent_str = response.content.strip().lower()
            return AgentIntent(intent_str)
        except (ValueError, Exception) as e:
            logger.warning("Intent classification fallback: %s", e)
            return AgentIntent.GENERAL

    async def _route_to_agent(
        self,
        intent: AgentIntent,
        message: str,
        user_id: int,
        session_id: str,
        chat_history: List[Dict],
        user_context: Dict,
        memory_context: str,
        route_context: Optional[Dict] = None,
    ) -> Dict[str, Any]:
        if intent == AgentIntent.MEDICAL_GUIDANCE:
            from app.agents.agent1_medical import run_medical_agent
            return await run_medical_agent(
                user_message=message,
                user_id=user_id,
                session_id=session_id,
                chat_history=chat_history,
                memory_context=memory_context,
            )

        elif intent == AgentIntent.APPOINTMENT:
            from app.agents.agent2_appointment import run_appointment_agent
            return await run_appointment_agent(
                user_message=message,
                user_id=user_id,
                session_id=session_id,
                chat_history=chat_history,
                context=route_context,
            )

        elif intent == AgentIntent.REPUTATION:
            from app.agents.agent3_reputation import run_reputation_agent
            return await run_reputation_agent(
                user_message=message,
                chat_history=chat_history,
            )

        elif intent == AgentIntent.CONTENT_GENERATION:
            from app.agents.agent4_content import run_content_agent
            return await run_content_agent(
                user_message=message,
                chat_history=chat_history,
            )

        elif intent == AgentIntent.NOTIFICATION:
            from app.agents.agent5_notification import run_notification_agent
            return await run_notification_agent(
                user_message=message,
                chat_history=chat_history,
            )

        else:  # GENERAL
            response = await self._general_llm.ainvoke([
                SystemMessage(content=GENERAL_RESPONSE_PROMPT),
                HumanMessage(content=message),
            ])
            return {
                "agent": "master_general",
                "output": response.content,
                "is_emergency": False,
                "route_to_agent2": False,
            }

    async def process(
        self,
        message: str,
        user_id: int,
        session_id: str,
        chat_history: List[Dict],
        user_context: Dict,
        memory_context: str = "",
        force_intent: Optional[str] = None,
        route_context: Optional[Dict] = None,
    ) -> Dict[str, Any]:
        if force_intent:
            try:
                intent = AgentIntent(force_intent)
            except ValueError:
                intent = await self.classify_intent(message, chat_history)
        else:
            intent = await self.classify_intent(message, chat_history)

        logger.info("Session %s | Intent: %s | User: %d", session_id, intent, user_id)

        result = await self._route_to_agent(
            intent=intent,
            message=message,
            user_id=user_id,
            session_id=session_id,
            chat_history=chat_history,
            user_context=user_context,
            memory_context=memory_context,
            route_context=route_context,
        )

        result["intent_detected"] = intent.value

        if result.get("route_to_agent2") and intent != AgentIntent.APPOINTMENT:
            logger.info("Cross-agent transition: medical → appointment | session %s",
                        session_id)
            result["next_suggested_agent"] = "appointment"
            result["suggest_booking"] = True

        return result


# Module-level singleton
master_agent = MasterAgent()
