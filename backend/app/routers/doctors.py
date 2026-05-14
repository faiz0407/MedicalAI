"""
Doctors Router — list available doctors, manage doctor profiles.
"""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel

from app.db.database import get_db
from app.db import crud
from app.db.models import User, Appointment, UserRole, AppointmentStatus
from app.core.security import get_current_user, TokenData, require_admin

router = APIRouter(prefix="/api/doctors", tags=["Doctors"])

# Known departments (could be moved to DB table in v2)
DEPARTMENTS = [
    "General Practice",
    "Cardiology",
    "Neurology",
    "Orthopedics",
    "Dermatology",
    "Pediatrics",
    "Gynecology",
    "Psychiatry",
    "Oncology",
    "Endocrinology",
    "Gastroenterology",
    "Pulmonology",
    "Ophthalmology",
    "ENT",
    "Urology",
]

class DoctorProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    specialization: Optional[str] = None  # stored in gender field for MVP

# ─── Public / Patient Endpoints ───────────────────────────────────────────────

@router.get("/list")
async def list_doctors(
    department: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """List all active doctors, optionally filtered by department."""
    query = select(User).where(
        User.role == UserRole.doctor,
        User.is_active == True,
    )
    result = await db.execute(query)
    doctors = result.scalars().all()

    doctor_list = []
    for d in doctors:
        # Use gender field as specialization (MVP shortcut)
        specialization = d.gender or "General Practice"
        if department and department.lower() not in specialization.lower():
            continue
        doctor_list.append({
            "id": d.id,
            "name": d.full_name or d.username,
            "username": d.username,
            "specialization": specialization,
            "available": True,
        })

    # If no doctors in DB yet, return mock doctors per department
    if not doctor_list:
        doctor_list = _mock_doctors(department)

    return {"doctors": doctor_list, "total": len(doctor_list)}


@router.get("/departments")
async def list_departments():
    """Return available departments."""
    return {"departments": DEPARTMENTS}


@router.get("/{doctor_id}")
async def get_doctor(
    doctor_id: int,
    db: AsyncSession = Depends(get_db),
    _: TokenData = Depends(get_current_user),
):
    """Get a single doctor's profile."""
    doctor = await crud.get_user_by_id(db, doctor_id)
    if not doctor or doctor.role != UserRole.doctor:
        raise HTTPException(404, "Doctor not found")
    return {
        "id": doctor.id,
        "name": doctor.full_name or doctor.username,
        "username": doctor.username,
        "specialization": doctor.gender or "General Practice",
        "phone": doctor.phone,
    }


@router.get("/{doctor_id}/slots")
async def get_available_slots(
    doctor_id: int,
    date: str = Query(..., description="Date in YYYY-MM-DD format"),
    db: AsyncSession = Depends(get_db),
    _: TokenData = Depends(get_current_user),
):
    """Return available time slots for a doctor on a given date."""
    from datetime import datetime, timedelta
    try:
        target_date = datetime.strptime(date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(400, "Invalid date format. Use YYYY-MM-DD")

    # Fetch existing bookings for this doctor on that date
    result = await db.execute(
        select(Appointment.appointment_time).where(
            Appointment.doctor_id == doctor_id,
            func.date(Appointment.appointment_time) == target_date,
            Appointment.status.notin_([AppointmentStatus.cancelled]),
        )
    )
    booked_times = {r.strftime("%H:%M") for r in result.scalars().all()}

    # Generate 30-min slots from 09:00 to 17:30
    slots = []
    base = datetime.combine(target_date, datetime.min.time()).replace(hour=9)
    end  = datetime.combine(target_date, datetime.min.time()).replace(hour=17, minute=30)
    current = base
    while current <= end:
        time_str = current.strftime("%H:%M")
        slots.append({
            "time": time_str,
            "datetime": f"{date}T{time_str}:00",
            "available": time_str not in booked_times,
        })
        current += timedelta(minutes=30)

    return {"date": date, "doctor_id": doctor_id, "slots": slots}


# ─── Doctor Self-Endpoints ─────────────────────────────────────────────────────

@router.get("/me/appointments")
async def my_appointments(
    status: Optional[str] = None,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Doctor sees their own upcoming appointments."""
    if current_user.role not in ("doctor", "admin"):
        raise HTTPException(403, "Doctor access required")

    query = select(Appointment).where(Appointment.doctor_id == current_user.user_id)
    if status:
        query = query.where(Appointment.status == status)
    query = query.order_by(Appointment.appointment_time.asc()).limit(limit)

    result = await db.execute(query)
    appts = result.scalars().all()

    appointments = []
    for a in appts:
        patient = await crud.get_user_by_id(db, a.patient_id)
        appointments.append({
            "id": a.id,
            "patient_name": patient.full_name or patient.username if patient else "Unknown",
            "patient_email": patient.email if patient else "",
            "department": a.department,
            "time": a.appointment_time.isoformat() if a.appointment_time else None,
            "status": a.status.value,
            "symptoms_summary": a.symptoms_summary,
            "payment_status": a.payment_status.value,
        })

    return {"appointments": appointments}


@router.patch("/me/appointments/{appt_id}/status")
async def update_appointment_status(
    appt_id: int,
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Doctor updates appointment status (completed / no_show)."""
    if current_user.role not in ("doctor", "admin"):
        raise HTTPException(403, "Doctor access required")

    result = await db.execute(
        select(Appointment).where(
            Appointment.id == appt_id,
            Appointment.doctor_id == current_user.user_id,
        )
    )
    appt = result.scalar_one_or_none()
    if not appt:
        raise HTTPException(404, "Appointment not found")

    new_status = body.get("status")
    valid_statuses = [s.value for s in AppointmentStatus]
    if new_status not in valid_statuses:
        raise HTTPException(400, f"Invalid status. Choose from: {valid_statuses}")

    appt.status = AppointmentStatus(new_status)
    if body.get("notes"):
        appt.feedback = body["notes"]
    await db.flush()

    await crud.log_audit(
        db, current_user.user_id, "update_appt_status",
        "appointments", appt_id, {"status": new_status}
    )
    return {"message": "Status updated", "new_status": new_status}


# ─── Admin Endpoints ──────────────────────────────────────────────────────────

@router.post("/admin/create", status_code=201)
async def admin_create_doctor(
    body: dict,
    _: TokenData = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin — register a new doctor account."""
    if await crud.get_user_by_username(db, body.get("username", "")):
        raise HTTPException(400, "Username already taken")
    if await crud.get_user_by_email(db, body.get("email", "")):
        raise HTTPException(400, "Email already registered")

    doctor = await crud.create_user(
        db,
        username=body["username"],
        email=body["email"],
        password=body.get("password", "Doctor@123"),
        full_name=body.get("full_name"),
        gender=body.get("specialization", "General Practice"),
        phone=body.get("phone"),
        role="doctor",
    )
    return {"message": "Doctor created", "doctor_id": doctor.id}


@router.delete("/admin/{doctor_id}")
async def admin_deactivate_doctor(
    doctor_id: int,
    _: TokenData = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin — deactivate a doctor account."""
    doctor = await crud.get_user_by_id(db, doctor_id)
    if not doctor or doctor.role != UserRole.doctor:
        raise HTTPException(404, "Doctor not found")
    doctor.is_active = False
    await db.flush()
    return {"message": "Doctor deactivated"}


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _mock_doctors(department: Optional[str]) -> List[dict]:
    """Return mock doctors for demo when no real doctors are seeded."""
    all_doctors = [
        {"id": 101, "name": "Dr. Sarah Johnson",   "username": "dr_sarah",   "specialization": "General Practice",  "available": True},
        {"id": 102, "name": "Dr. Michael Chen",    "username": "dr_chen",    "specialization": "Cardiology",         "available": True},
        {"id": 103, "name": "Dr. Priya Sharma",    "username": "dr_priya",   "specialization": "Neurology",          "available": True},
        {"id": 104, "name": "Dr. Robert Williams", "username": "dr_robert",  "specialization": "Orthopedics",        "available": False},
        {"id": 105, "name": "Dr. Emily Watson",    "username": "dr_emily",   "specialization": "Pediatrics",         "available": True},
        {"id": 106, "name": "Dr. Amir Hassan",     "username": "dr_amir",    "specialization": "Dermatology",        "available": True},
        {"id": 107, "name": "Dr. Lisa Park",       "username": "dr_lisa",    "specialization": "Psychiatry",         "available": True},
        {"id": 108, "name": "Dr. James Okafor",    "username": "dr_james",   "specialization": "Oncology",           "available": False},
    ]
    if department:
        return [d for d in all_doctors if department.lower() in d["specialization"].lower()]
    return all_doctors
