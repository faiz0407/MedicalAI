"""
Agent 2 — Appointment & Follow-Up Agent.

Handles:
- Department selection
- Slot checking
- Booking creation
- Mock payment
- Post-appointment feedback
- No-show handling and rescheduling
"""
from typing import Dict, Any, List, Optional
from datetime import date
from langchain_groq import ChatGroq
from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import HumanMessage, AIMessage

from app.core.config import settings
from app.tools.appointment_tools import (
    list_available_departments,
    check_slot_availability,
    create_appointment_booking,
    process_mock_payment,
    request_feedback,
    offer_reschedule,
)

APPOINTMENT_SYSTEM_PROMPT = """You are a friendly and efficient appointment scheduling assistant
for a healthcare system.

YOUR RESPONSIBILITIES:
1. Help patients book medical appointments step by step.
2. Collect: department, preferred date (YYYY-MM-DD), preferred time (HH:MM 24-hour format).
3. Check slot availability before confirming.
4. Create the booking and IMMEDIATELY process payment automatically.
5. Confirm appointment after payment is processed.
6. Collect post-appointment feedback when requested.
7. Handle no-shows by offering reschedule options.

BOOKING FLOW:
Step 1: Ask for preferred department (call list_available_departments if unsure).
Step 2: Ask for preferred date and time.
Step 3: Call check_slot_availability — verify the requested time is in available_slots.
Step 4: Call create_appointment_booking with department, date, time, symptoms_summary.
Step 5: IMMEDIATELY call process_mock_payment with the appointment_id from step 4.
        DO NOT ask the user for payment — it is processed automatically in the system.
Step 6: Share the confirmation details and payment reference from step 5.

CRITICAL PAYMENT RULE:
- After create_appointment_booking succeeds, you MUST call process_mock_payment in the
  SAME response without asking the user anything first.
- Payment is handled automatically — never say "please pay" or wait for user input.
- The appointment is only confirmed once process_mock_payment has been called.

TIME FORMAT:
- Always use HH:MM 24-hour format (e.g., 09:00, 14:30, 17:00) for preferred_time.
- Never use AM/PM format in tool calls.

FEEDBACK FLOW (post-visit):
- Ask for experience rating (1-5).
- Ask for any comments.
- Thank the patient.

NO-SHOW FLOW:
- Acknowledge the missed appointment.
- Ask if they want to reschedule.
- Collect new date/time preferences.

Always be warm, professional, and efficient.
"""


_executor: Optional[AgentExecutor] = None
_EXECUTOR_VERSION = 3  # bump this to force rebuild after config changes


def _get_executor() -> AgentExecutor:
    global _executor
    if _executor is None:
        llm = ChatGroq(
            groq_api_key=settings.GROQ_API_KEY,
            model=settings.GROQ_MODEL,
            temperature=0.2,
            max_tokens=2048,
        )
        tools = [
            list_available_departments,
            check_slot_availability,
            create_appointment_booking,
            process_mock_payment,
            request_feedback,
            offer_reschedule,
        ]
        prompt = ChatPromptTemplate.from_messages([
            ("system", APPOINTMENT_SYSTEM_PROMPT),
            MessagesPlaceholder("chat_history", optional=True),
            ("human", "{input}"),
            MessagesPlaceholder("agent_scratchpad"),
        ])
        agent = create_tool_calling_agent(llm, tools, prompt)
        _executor = AgentExecutor(
            agent=agent,
            tools=tools,
            verbose=True,
            max_iterations=10,
            handle_parsing_errors=True,
            return_intermediate_steps=True,
            early_stopping_method="generate",
        )
    return _executor


def _extract_booking_data(intermediate_steps: list) -> Optional[Dict]:
    """Pull booking + payment details out of tool call results."""
    booking = None
    payment = None
    for action, observation in intermediate_steps:
        tool_name = getattr(action, "tool", "")
        if tool_name == "create_appointment_booking" and isinstance(observation, dict):
            booking = observation
        elif tool_name == "process_mock_payment" and isinstance(observation, dict):
            payment = observation
    if not booking:
        return None
    return {**booking, **(payment or {})}


async def run_appointment_agent(
    user_message: str,
    user_id: int,
    session_id: str,
    chat_history: list,
    context: Dict = None,
) -> Dict[str, Any]:
    """Entry point for Agent 2."""
    executor = _get_executor()

    lc_history = []
    for msg in chat_history[-10:]:
        if msg["role"] == "user":
            lc_history.append(HumanMessage(content=msg["content"]))
        elif msg["role"] == "assistant":
            lc_history.append(AIMessage(content=msg["content"]))

    enriched = (
        f"[Patient ID: {user_id} | Session: {session_id} | Today's date: {date.today().isoformat()}]\n{user_message}"
    )
    if context:
        enriched += f"\n[Context: symptoms_summary={context.get('symptoms_summary', 'N/A')}]"

    result = await executor.ainvoke({
        "input": enriched,
        "chat_history": lc_history,
    })

    output = result.get("output", "")
    if isinstance(output, list):
        output = " ".join(
            block.get("text", "") for block in output
            if isinstance(block, dict) and block.get("type") == "text"
        )
    booking_data = _extract_booking_data(result.get("intermediate_steps", []))
    return {
        "agent":             "agent2_appointment",
        "output":            output,
        "booking_completed": "confirmed" in output.lower(),
        "booking_data":      booking_data,
        "patient_id":        user_id,
    }
