"""
Appointments Router — patient and doctor appointment management.
"""
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from app.db.database import get_db
from app.db import crud
from app.core.security import get_current_user, TokenData, require_doctor
from app.core.config import settings
from app.services.email_service import (
    send_appointment_confirmation, send_no_show_notification
)
from app.services import payment_service

router = APIRouter(prefix="/api/appointments", tags=["Appointments"])


@router.get("/available-slots")
async def available_slots(
    department: str,
    date: str,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return 30-min slots (09:00–17:30) for a department/date, excluding booked times."""
    from sqlalchemy import and_
    from app.db.models import Appointment, AppointmentStatus

    try:
        target = datetime.strptime(date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(400, "date must be YYYY-MM-DD")

    result = await db.execute(
        select(Appointment.appointment_time).where(
            and_(
                Appointment.department == department,
                Appointment.status.notin_([AppointmentStatus.cancelled]),
            )
        )
    )
    booked = {
        row.strftime("%H:%M")
        for row in result.scalars().all()
        if row and row.date() == target
    }

    all_slots = [
        f"{h:02d}:{m:02d}"
        for h in range(9, 18)
        for m in (0, 30)
        if not (h == 17 and m == 30)
    ]
    available = [s for s in all_slots if s not in booked]

    return {
        "department": department,
        "date": date,
        "available_slots": available,
        "booked_slots": sorted(booked),
    }


class BookingRequest(BaseModel):
    department: str
    appointment_time: datetime
    symptoms_summary: Optional[str] = None


class RazorpayOrderRequest(BaseModel):
    appointment_id: int


class RazorpayVerifyRequest(BaseModel):
    appointment_id: int
    order_id: str
    payment_id: str
    signature: str


class FeedbackRequest(BaseModel):
    feedback: str
    rating: int


class RescheduleRequestBody(BaseModel):
    requested_department: Optional[str] = None
    requested_time: Optional[datetime] = None
    requested_symptoms_summary: Optional[str] = None
    reason: Optional[str] = None


class StatusUpdateRequest(BaseModel):
    status: str   # showed_up | no_show | cancelled


@router.post("/book")
async def book_appointment(
    body: BookingRequest,
    background_tasks: BackgroundTasks,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import and_
    from app.db.models import Appointment, AppointmentStatus

    # Reject if the exact slot is already taken for this department
    conflict = await db.execute(
        select(Appointment.id).where(
            and_(
                Appointment.department == body.department,
                Appointment.appointment_time == body.appointment_time,
                Appointment.status.notin_([AppointmentStatus.cancelled]),
            )
        )
    )
    if conflict.scalar_one_or_none():
        raise HTTPException(409, "This slot is already booked. Please choose a different time.")

    user = await crud.get_user_by_id(db, current_user.user_id)
    appt = await crud.create_appointment(
        db, patient_id=current_user.user_id,
        department=body.department,
        appointment_time=body.appointment_time,
        symptoms_summary=body.symptoms_summary,
    )
    await crud.log_audit(db, current_user.user_id, "book_appointment",
                          "appointments", appt.id)
    return {
        "appointment_id": appt.id,
        "department": appt.department,
        "time": appt.appointment_time.isoformat(),
        "status": appt.status.value,
        "payment_required": True,
        "amount": 50.0,
        "currency": "USD",
    }


@router.post("/razorpay/create-order")
async def razorpay_create_order(
    body: RazorpayOrderRequest,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    appt = await crud.get_appointment(db, body.appointment_id)
    if not appt or appt.patient_id != current_user.user_id:
        raise HTTPException(404, "Appointment not found")
    if appt.payment_status.value == "paid":
        raise HTTPException(400, "Appointment already paid")

    order = payment_service.create_razorpay_order(
        amount_paise=payment_service.CONSULTATION_FEE_PAISE,
        receipt=f"appt_{body.appointment_id}",
    )
    return {
        "order_id": order["id"],
        "amount": order["amount"],
        "currency": order["currency"],
        "key_id": settings.RAZORPAY_KEY_ID,
        "mock": order.get("_mock", False),
    }


@router.post("/razorpay/verify")
async def razorpay_verify_payment(
    body: RazorpayVerifyRequest,
    background_tasks: BackgroundTasks,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not payment_service.verify_razorpay_signature(
        body.order_id, body.payment_id, body.signature
    ):
        raise HTTPException(400, "Payment signature verification failed")

    confirmation_link = (
        f"https://dashboard.razorpay.com/app/payments/{body.payment_id}"
        if not body.payment_id.startswith("pay_MOCK")
        else f"https://healthcareai.example.com/appointments/{body.appointment_id}"
    )
    await crud.update_appointment_payment(
        db, body.appointment_id,
        payment_status="paid",
        payment_reference=body.payment_id,
        confirmation_link=confirmation_link,
    )

    user = await crud.get_user_by_id(db, current_user.user_id)
    appt = await crud.get_appointment(db, body.appointment_id)
    if user and appt:
        background_tasks.add_task(
            send_appointment_confirmation,
            user.email, user.full_name or user.username,
            appt.department,
            appt.appointment_time.strftime("%Y-%m-%d %H:%M"),
            confirmation_link,
        )
    await crud.log_audit(db, current_user.user_id, "payment_verified",
                          "appointments", body.appointment_id,
                          details={"payment_id": body.payment_id})
    return {"message": "Payment verified. Appointment confirmed!"}


@router.get("/my")
async def my_appointments(
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    appts = await crud.get_patient_appointments(db, current_user.user_id)
    return {
        "appointments": [
            {
                "id": a.id,
                "department": a.department,
                "time": a.appointment_time.isoformat() if a.appointment_time else None,
                "status": a.status.value,
                "payment_status": a.payment_status.value,
                "feedback_given": bool(a.feedback),
            }
            for a in appts
        ]
    }


@router.get("/{appointment_id}")
async def get_appointment(
    appointment_id: int,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single appointment. Patients can only see their own."""
    appt = await crud.get_appointment(db, appointment_id)
    if not appt:
        raise HTTPException(404, "Appointment not found")
    if current_user.role == "patient" and appt.patient_id != current_user.user_id:
        raise HTTPException(403, "Not your appointment")
    return {
        "id": appt.id,
        "department": appt.department,
        "time": appt.appointment_time.isoformat() if appt.appointment_time else None,
        "status": appt.status.value,
        "payment_status": appt.payment_status.value,
        "symptoms_summary": appt.symptoms_summary,
        "feedback": appt.feedback,
        "feedback_rating": appt.feedback_rating,
        "payment_reference": appt.payment_reference,
        "confirmation_link": appt.confirmation_link,
    }


@router.post("/{appointment_id}/reschedule")
async def request_reschedule(
    appointment_id: int,
    body: RescheduleRequestBody,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Patient submits a reschedule request. Requires admin approval before
    the appointment is actually changed."""
    appt = await crud.get_appointment(db, appointment_id)
    if not appt:
        raise HTTPException(404, "Appointment not found")
    if appt.patient_id != current_user.user_id:
        raise HTTPException(403, "Not your appointment")
    if appt.status.value not in ("pending", "confirmed"):
        raise HTTPException(400, f"Cannot reschedule an appointment with status '{appt.status.value}'")
    if not body.requested_department and not body.requested_time and body.requested_symptoms_summary is None:
        raise HTTPException(400, "Provide at least one field to change")

    req = await crud.create_reschedule_request(
        db,
        appointment_id=appointment_id,
        patient_id=current_user.user_id,
        reason=body.reason,
        requested_department=body.requested_department,
        requested_time=body.requested_time,
        requested_symptoms_summary=body.requested_symptoms_summary,
    )
    await crud.log_audit(db, current_user.user_id, "reschedule_requested",
                          "appointments", appointment_id,
                          details={"reschedule_request_id": req.id})
    return {
        "message": "Reschedule request submitted. Awaiting admin approval.",
        "reschedule_request_id": req.id,
        "status": req.status.value,
        "requested_department": req.requested_department,
        "requested_time": req.requested_time.isoformat() if req.requested_time else None,
    }


@router.get("/my-reschedule-requests")
async def my_reschedule_requests(
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Patient views all their reschedule requests and their current status."""
    requests = await crud.list_reschedule_requests(db, patient_id=current_user.user_id)
    return {
        "requests": [
            {
                "id": r.id,
                "appointment_id": r.appointment_id,
                "requested_department": r.requested_department,
                "requested_time": r.requested_time.isoformat() if r.requested_time else None,
                "reason": r.reason,
                "status": r.status.value,
                "admin_notes": r.admin_notes,
                "created_at": r.created_at.isoformat(),
                "resolved_at": r.resolved_at.isoformat() if r.resolved_at else None,
            }
            for r in requests
        ]
    }


@router.post("/{appointment_id}/cancel")
async def cancel_appointment(
    appointment_id: int,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Cancel an appointment.
    Patients can cancel their own pending/confirmed appointments.
    Admins can cancel any appointment.
    """
    appt = await crud.get_appointment(db, appointment_id)
    if not appt:
        raise HTTPException(404, "Appointment not found")

    if current_user.role == "patient":
        if appt.patient_id != current_user.user_id:
            raise HTTPException(403, "Not your appointment")
        if appt.status.value not in ("pending", "confirmed"):
            raise HTTPException(400, f"Cannot cancel an appointment with status '{appt.status.value}'")

    await crud.update_appointment_status(db, appointment_id, "cancelled")
    await crud.log_audit(db, current_user.user_id, "cancel_appointment",
                          "appointments", appointment_id)
    return {"message": "Appointment cancelled", "appointment_id": appointment_id}


@router.post("/{appointment_id}/feedback")
async def submit_feedback(
    appointment_id: int,
    body: FeedbackRequest,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    appt = await crud.get_appointment(db, appointment_id)
    if not appt or appt.patient_id != current_user.user_id:
        raise HTTPException(404, "Appointment not found")
    if not 1 <= body.rating <= 5:
        raise HTTPException(400, "Rating must be between 1 and 5")

    await crud.add_appointment_feedback(db, appointment_id, body.feedback, body.rating)
    return {"message": "Feedback submitted. Thank you!", "rating": body.rating}


@router.put("/{appointment_id}/status")
async def update_status(
    appointment_id: int,
    body: StatusUpdateRequest,
    background_tasks: BackgroundTasks,
    current_user: TokenData = Depends(require_doctor),
    db: AsyncSession = Depends(get_db),
):
    """Doctor/admin updates appointment outcome."""
    status_map = {
        "showed_up": "completed",
        "no_show": "no_show",
        "cancelled": "cancelled",
    }
    mapped = status_map.get(body.status)
    if not mapped:
        raise HTTPException(400, f"Invalid status. Use: {list(status_map.keys())}")

    appt = await crud.get_appointment(db, appointment_id)
    if not appt:
        raise HTTPException(404, "Appointment not found")

    await crud.update_appointment_status(db, appointment_id, mapped)

    if mapped == "no_show":
        patient = await crud.get_user_by_id(db, appt.patient_id)
        if patient:
            background_tasks.add_task(
                send_no_show_notification,
                patient.email, patient.full_name or patient.username,
                appt.appointment_time.strftime("%Y-%m-%d %H:%M"),
            )

    await crud.log_audit(db, current_user.user_id, f"appointment_{mapped}",
                          "appointments", appointment_id)
    return {"message": f"Appointment status updated to '{mapped}'"}
