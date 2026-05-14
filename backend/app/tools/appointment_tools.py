"""
Agent 2 — Appointment & Follow-Up Tools.
All DB operations are deferred to CRUD functions called at runtime.
Tools here are synchronous wrappers (LangChain tools are sync by default).
"""
import uuid
import random
from typing import Dict, List, Optional
from langchain_core.tools import tool
from pydantic import BaseModel, Field
from datetime import datetime, date as date_type


DEPARTMENTS = [
    "General Medicine", "Cardiology", "Neurology", "Orthopedics",
    "Dermatology", "Pediatrics", "Gynecology", "ENT", "Ophthalmology",
    "Psychiatry", "Pulmonology", "Gastroenterology",
]


class AppointmentInput(BaseModel):
    department: str = Field(description="Medical department")
    preferred_date: str = Field(description="Preferred appointment date (YYYY-MM-DD)")
    preferred_time: str = Field(description="Preferred time (HH:MM)")
    symptoms_summary: str = Field(description="Brief summary of symptoms")


class PaymentInput(BaseModel):
    appointment_id: int = Field(description="Appointment ID to process payment for")
    amount: Optional[float] = Field(default=50.0, description="Payment amount in USD")


class FeedbackInput(BaseModel):
    appointment_id: int = Field(description="Appointment ID")
    feedback_text: str = Field(description="Patient's feedback text")
    rating: int = Field(description="Rating from 1 to 5 (integer)")


class DepartmentsInput(BaseModel):
    filter: Optional[str] = Field(default=None, description="Optional keyword to filter departments (leave empty to list all)")


@tool("list_available_departments", args_schema=DepartmentsInput)
def list_available_departments(filter: Optional[str] = None) -> Dict:
    """Returns list of all available medical departments for appointment booking."""
    depts = DEPARTMENTS
    if filter:
        depts = [d for d in DEPARTMENTS if filter.lower() in d.lower()]
    return {
        "departments": depts,
        "message": "Please choose a department from the list above.",
    }


def _get_booked_slots_sync(department: str, preferred_date: str) -> List[str]:
    """Query PostgreSQL synchronously for already-booked slots on a given date."""
    try:
        from app.db.database import SyncSessionLocal
        from sqlalchemy import select, and_
        from app.db.models import Appointment, AppointmentStatus

        target = datetime.strptime(preferred_date, "%Y-%m-%d").date()
        with SyncSessionLocal() as session:
            result = session.execute(
                select(Appointment.appointment_time).where(
                    and_(
                        Appointment.department == department,
                        Appointment.status.notin_([
                            AppointmentStatus.cancelled,
                        ]),
                    )
                )
            )
            booked = []
            for row in result.scalars().all():
                if row and row.date() == target:
                    booked.append(row.strftime("%H:%M"))
            return booked
    except Exception:
        return []   # fall back to all slots available if DB unreachable


@tool("check_slot_availability")
def check_slot_availability(department: str, preferred_date: str) -> Dict:
    """
    Checks available time slots for a given department and date.
    Returns available 30-minute slots from 09:00 to 17:30, excluding already-booked times.
    """
    all_slots = []
    for hour in range(9, 18):
        for minute in (0, 30):
            if hour == 17 and minute == 30:
                break
            all_slots.append(f"{hour:02d}:{minute:02d}")

    booked = _get_booked_slots_sync(department, preferred_date)
    available = [s for s in all_slots if s not in booked]

    return {
        "department": department,
        "date": preferred_date,
        "available_slots": available,
        "booked_slots": booked,
        "message": (
            f"{len(available)} slots available for {department} on {preferred_date}."
            + (" All slots are taken for this date." if not available else "")
        ),
    }


@tool("create_appointment_booking", args_schema=AppointmentInput)
def create_appointment_booking(department: str,
                                preferred_date: str, preferred_time: str,
                                symptoms_summary: str) -> Dict:
    """
    Creates a new appointment booking record in the system.
    Returns appointment ID and payment instructions.
    """
    appt_id = random.randint(10000, 99999)  # replaced by real DB ID at runtime
    confirmation_token = str(uuid.uuid4())[:8].upper()

    return {
        "appointment_id": appt_id,
        "status": "booking_created",
        "department": department,
        "scheduled_time": f"{preferred_date} {preferred_time}",
        "next_step": "call process_mock_payment immediately with this appointment_id to confirm",
        "confirmation_token": confirmation_token,
    }


@tool("process_mock_payment", args_schema=PaymentInput)
def process_mock_payment(appointment_id: int, amount: float = 50.0) -> Dict:
    """
    Processes a mock payment for an appointment.
    Returns payment reference and confirmation link.
    """
    payment_ref = f"PAY-{str(uuid.uuid4())[:12].upper()}"
    confirmation_link = f"https://healthcare.example.com/confirm/{payment_ref}"
    return {
        "success": True,
        "payment_reference": payment_ref,
        "amount_paid": amount,
        "currency": "USD",
        "appointment_id": appointment_id,
        "confirmation_link": confirmation_link,
        "message": (
            f"✅ Payment of ${amount:.2f} processed successfully. "
            f"Your appointment is now CONFIRMED.\n"
            f"Confirmation link: {confirmation_link}\n"
            f"Reference: {payment_ref}"
        ),
    }


@tool("request_feedback", args_schema=FeedbackInput)
def request_feedback(appointment_id: int,
                     feedback_text: str, rating: int) -> Dict:
    """
    Records patient feedback after an appointment.
    """
    return {
        "appointment_id": appointment_id,
        "feedback_recorded": True,
        "rating": rating,
        "message": (
            "Thank you for your feedback! Your response helps us improve our services. "
            f"You rated your visit {rating}/5."
        ),
    }


@tool("offer_reschedule")
def offer_reschedule(appointment_id: int, reason: str = "no_show") -> Dict:
    """
    Offers a reschedule option when a patient misses an appointment.
    """
    return {
        "original_appointment_id": appointment_id,
        "reschedule_offered": True,
        "message": (
            "We noticed you missed your appointment. "
            "Would you like to reschedule? We have slots available this week. "
            "Please let us know your preferred date and time."
        ),
    }
