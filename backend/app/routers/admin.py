"""
Admin Router — reviews, content, notifications, audit logs.
All endpoints require admin or doctor role.
"""
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

from app.db.database import get_db
from app.db import crud
from app.core.security import get_current_user, TokenData, require_admin, require_doctor
from app.services.email_service import send_high_risk_alert, send_patient_notification

router = APIRouter(prefix="/api/admin", tags=["Admin"])


# ─── Users ───────────────────────────────────────────────────────────────────
@router.get("/users")
async def list_users(
    role: Optional[str] = None,
    _: TokenData = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """List all users, optionally filtered by role (patient / doctor / admin)."""
    from sqlalchemy import select
    from app.db.models import User, UserRole

    stmt = select(User).order_by(User.created_at.desc())
    if role:
        try:
            stmt = stmt.where(User.role == UserRole(role))
        except ValueError:
            pass  # ignore unknown role values
    result = await db.execute(stmt)
    users = result.scalars().all()
    return {
        "users": [
            {
                "id":         u.id,
                "username":   u.username,
                "email":      u.email,
                "full_name":  u.full_name,
                "age":        u.age,
                "gender":     u.gender,
                "role":       u.role.value,
                "is_active":  u.is_active,
                "created_at": u.created_at.isoformat() if u.created_at else None,
            }
            for u in users
        ]
    }


# ─── Appointments ────────────────────────────────────────────────────────────

class AppointmentEditRequest(BaseModel):
    department: Optional[str] = None
    appointment_time: Optional[datetime] = None
    symptoms_summary: Optional[str] = None
    status: Optional[str] = None


@router.get("/appointments")
async def list_all_appointments(
    status: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    _: TokenData = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: list all appointments across all patients."""
    appts = await crud.get_all_appointments(db, status=status, limit=limit, offset=offset)
    return {
        "total": len(appts),
        "appointments": [
            {
                "id": a.id,
                "patient_id": a.patient_id,
                "department": a.department,
                "time": a.appointment_time.isoformat() if a.appointment_time else None,
                "status": a.status.value,
                "payment_status": a.payment_status.value,
                "symptoms_summary": a.symptoms_summary,
                "feedback_rating": a.feedback_rating,
                "payment_reference": a.payment_reference,
            }
            for a in appts
        ],
    }


@router.patch("/appointments/{appointment_id}")
async def admin_edit_appointment(
    appointment_id: int,
    body: AppointmentEditRequest,
    current_user: TokenData = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: edit any field on any appointment."""
    appt = await crud.get_appointment(db, appointment_id)
    if not appt:
        raise HTTPException(404, "Appointment not found")

    if body.status:
        valid = ("pending", "confirmed", "cancelled", "completed", "no_show")
        if body.status not in valid:
            raise HTTPException(400, f"Invalid status. Valid values: {valid}")
        await crud.update_appointment_status(db, appointment_id, body.status)

    if body.department or body.appointment_time or body.symptoms_summary is not None:
        await crud.update_appointment_details(
            db, appointment_id,
            department=body.department,
            appointment_time=body.appointment_time,
            symptoms_summary=body.symptoms_summary,
        )

    updated = await crud.get_appointment(db, appointment_id)
    await crud.log_audit(db, current_user.user_id, "admin_edit_appointment",
                          "appointments", appointment_id)
    return {
        "message": "Appointment updated",
        "id": updated.id,
        "department": updated.department,
        "time": updated.appointment_time.isoformat() if updated.appointment_time else None,
        "status": updated.status.value,
        "payment_status": updated.payment_status.value,
    }


@router.get("/reschedule-requests")
async def list_reschedule_requests(
    status: Optional[str] = "pending",
    _: TokenData = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: list all reschedule requests (default: pending only)."""
    requests = await crud.list_reschedule_requests(db, status=status)
    return {
        "total": len(requests),
        "requests": [
            {
                "id": r.id,
                "appointment_id": r.appointment_id,
                "patient_id": r.patient_id,
                "requested_department": r.requested_department,
                "requested_time": r.requested_time.isoformat() if r.requested_time else None,
                "requested_symptoms_summary": r.requested_symptoms_summary,
                "reason": r.reason,
                "status": r.status.value,
                "admin_notes": r.admin_notes,
                "created_at": r.created_at.isoformat(),
            }
            for r in requests
        ],
    }


class RescheduleResolveRequest(BaseModel):
    admin_notes: Optional[str] = None


@router.post("/reschedule-requests/{req_id}/approve")
async def approve_reschedule(
    req_id: int,
    body: RescheduleResolveRequest,
    current_user: TokenData = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin approves a reschedule request — immediately applies the changes to the appointment."""
    req = await crud.get_reschedule_request(db, req_id)
    if not req:
        raise HTTPException(404, "Reschedule request not found")
    if req.status.value != "pending":
        raise HTTPException(400, f"Request already {req.status.value}")

    # Apply the requested changes to the appointment
    await crud.update_appointment_details(
        db,
        req.appointment_id,
        department=req.requested_department,
        appointment_time=req.requested_time,
        symptoms_summary=req.requested_symptoms_summary,
    )

    await crud.resolve_reschedule_request(
        db, req_id, status="approved",
        resolved_by=current_user.user_id,
        admin_notes=body.admin_notes,
    )
    await crud.log_audit(db, current_user.user_id, "approve_reschedule",
                          "reschedule_requests", req_id,
                          details={"appointment_id": req.appointment_id})
    return {
        "message": "Reschedule approved and appointment updated.",
        "reschedule_request_id": req_id,
        "appointment_id": req.appointment_id,
    }


@router.post("/reschedule-requests/{req_id}/reject")
async def reject_reschedule(
    req_id: int,
    body: RescheduleResolveRequest,
    current_user: TokenData = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin rejects a reschedule request — appointment stays unchanged."""
    req = await crud.get_reschedule_request(db, req_id)
    if not req:
        raise HTTPException(404, "Reschedule request not found")
    if req.status.value != "pending":
        raise HTTPException(400, f"Request already {req.status.value}")

    await crud.resolve_reschedule_request(
        db, req_id, status="rejected",
        resolved_by=current_user.user_id,
        admin_notes=body.admin_notes,
    )
    await crud.log_audit(db, current_user.user_id, "reject_reschedule",
                          "reschedule_requests", req_id,
                          details={"appointment_id": req.appointment_id})
    return {
        "message": "Reschedule request rejected. Appointment unchanged.",
        "reschedule_request_id": req_id,
        "appointment_id": req.appointment_id,
    }


@router.delete("/appointments/{appointment_id}")
async def admin_delete_appointment(
    appointment_id: int,
    current_user: TokenData = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: hard-delete an appointment record."""
    from sqlalchemy import delete as sql_delete
    from app.db.models import Appointment
    result = await db.execute(
        sql_delete(Appointment).where(Appointment.id == appointment_id).returning(Appointment.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(404, "Appointment not found")
    await crud.log_audit(db, current_user.user_id, "delete_appointment",
                          "appointments", appointment_id)
    return {"message": "Appointment deleted", "appointment_id": appointment_id}


# ─── Reviews ─────────────────────────────────────────────────────────────────
@router.get("/reviews")
async def list_reviews(
    category: Optional[str] = None,
    limit: int = 50,
    _: TokenData = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import select
    from app.db.models import Review, ReviewCategory

    stmt = select(Review).order_by(Review.review_date.desc()).limit(limit)
    if category and category != "all":
        try:
            stmt = stmt.where(Review.category == ReviewCategory(category))
        except ValueError:
            pass
    result = await db.execute(stmt)
    reviews = result.scalars().all()
    return {
        "category": category or "all",
        "count": len(reviews),
        "reviews": [
            {
                "id":              r.id,
                "platform":        r.platform or "google",
                "reviewer_name":   r.reviewer_name,
                "rating":          r.rating,
                "review_text":     r.review_text,
                "review_date":     r.review_date.isoformat() if r.review_date else None,
                "category":        r.category.value,
                "ai_reply":        r.ai_reply,
                "reply_approved":  r.reply_approved,
                "reply_posted":    r.reply_posted,
                "flagged_keywords": r.flagged_keywords or [],
            }
            for r in reviews
        ],
    }


@router.post("/reviews/sync-google")
async def sync_google_reviews(
    current_user: TokenData = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Fetch real reviews from Google Places API and store in DB."""
    from app.core.config import settings
    import httpx
    from app.db.models import Review, ReviewCategory
    from sqlalchemy import select

    if not settings.GOOGLE_PLACES_API_KEY:
        raise HTTPException(503, "GOOGLE_PLACES_API_KEY not configured. Add it to .env to enable Google review sync.")

    api_key = settings.GOOGLE_PLACES_API_KEY
    hospital = settings.HOSPITAL_NAME

    async with httpx.AsyncClient(timeout=15) as client:
        # Step 1: Find the place_id via text search
        search_resp = await client.get(
            "https://maps.googleapis.com/maps/api/place/findplacefromtext/json",
            params={
                "input": hospital,
                "inputtype": "textquery",
                "fields": "place_id,name",
                "key": api_key,
            },
        )
        search_data = search_resp.json()
        candidates = search_data.get("candidates", [])
        if not candidates:
            raise HTTPException(404, f"Hospital '{hospital}' not found via Places API")

        place_id = candidates[0]["place_id"]

        # Step 2: Fetch place details with reviews
        details_resp = await client.get(
            "https://maps.googleapis.com/maps/api/place/details/json",
            params={
                "place_id": place_id,
                "fields": "reviews,rating,user_ratings_total,name",
                "key": api_key,
                "reviews_sort": "newest",
            },
        )
        details = details_resp.json().get("result", {})

    google_reviews = details.get("reviews", [])
    if not google_reviews:
        return {"message": "No reviews found for this place", "synced": 0}

    # Keyword categorisation (same logic as reputation_tools.py)
    HIGH_RISK = {"unhygienic","dirty","negligence","malpractice","rude staff",
                 "wrong diagnosis","overcharged","scam","incompetent","dangerous",
                 "unqualified","fraud","unprofessional"}
    MODERATE  = {"waiting time","long wait","slow service","average","okay",
                 "could be better","not great"}

    def categorise(text: str, rating: float):
        lower = text.lower()
        flagged = [kw for kw in HIGH_RISK if kw in lower]
        if flagged or rating <= 2:
            return ReviewCategory.high_risk, flagged
        mod = [kw for kw in MODERATE if kw in lower]
        if mod or rating == 3:
            return ReviewCategory.moderate, mod
        return ReviewCategory.good, []

    synced = 0
    for gr in google_reviews:
        reviewer  = gr.get("author_name", "Anonymous")
        rating    = float(gr.get("rating", 5))
        text      = gr.get("text", "")
        ts        = gr.get("time", 0)
        rev_date  = datetime.utcfromtimestamp(ts) if ts else datetime.utcnow()
        category, flagged = categorise(text, rating)

        # Skip if already in DB (same reviewer + same date)
        existing = await db.execute(
            select(Review).where(
                Review.reviewer_name == reviewer,
                Review.review_date == rev_date,
            )
        )
        if existing.scalar_one_or_none():
            continue

        review = Review(
            platform=         "google",
            reviewer_name=    reviewer,
            rating=           rating,
            review_text=      text,
            review_date=      rev_date,
            category=         category,
            flagged_keywords= flagged,
            reply_approved=   False,
            reply_posted=     False,
        )
        db.add(review)
        synced += 1

    await db.flush()
    await crud.log_audit(db, current_user.user_id, "sync_google_reviews", "reviews", 0,
                         details={"synced": synced})
    return {
        "message": f"Synced {synced} new reviews from Google Places",
        "place_name": details.get("name", hospital),
        "total_fetched": len(google_reviews),
        "synced": synced,
    }


@router.post("/reviews/{review_id}/approve-reply")
async def approve_review_reply(
    review_id: int,
    current_user: TokenData = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    review = await crud.approve_review_reply(db, review_id)
    if not review:
        raise HTTPException(404, "Review not found")
    await crud.log_audit(db, current_user.user_id, "approve_reply", "reviews", review_id)
    return {"message": "Reply approved", "review_id": review_id}


# ─── Blog / Content ──────────────────────────────────────────────────────────
@router.get("/content/pending")
async def get_pending_content(
    _: TokenData = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    posts = await crud.get_pending_blog_posts(db)
    return {
        "count": len(posts),
        "posts": [
            {
                "id": p.id,
                "title": p.title,
                "post_type": p.post_type,
                "platform": p.platform,
                "status": p.status.value,
                "tags": p.tags,
                "created_at": p.created_at.isoformat(),
                "preview": p.content[:300] + "..." if len(p.content) > 300 else p.content,
            }
            for p in posts
        ],
    }


@router.post("/content/{post_id}/approve")
async def approve_content(
    post_id: int,
    current_user: TokenData = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    post = await crud.approve_blog_post(db, post_id, current_user.user_id)
    if not post:
        raise HTTPException(404, "Post not found")
    await crud.log_audit(db, current_user.user_id, "approve_content", "blog_posts", post_id)
    return {"message": "Content approved", "post_id": post_id}


@router.post("/content/{post_id}/reject")
async def reject_content(
    post_id: int,
    current_user: TokenData = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import update as sql_update
    from app.db.models import BlogPost, ContentStatus
    result = await db.execute(
        sql_update(BlogPost)
        .where(BlogPost.id == post_id)
        .values(status=ContentStatus.rejected)
        .returning(BlogPost.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(404, "Post not found")
    await crud.log_audit(db, current_user.user_id, "reject_content", "blog_posts", post_id)
    return {"message": "Content rejected", "post_id": post_id}


# ─── Notification Campaigns ───────────────────────────────────────────────────
class NotificationApprovalRequest(BaseModel):
    campaign_id: int


@router.get("/notifications/pending")
async def list_pending_campaigns(
    _: TokenData = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import select
    from app.db.models import NotificationCampaign, NotificationStatus
    result = await db.execute(
        select(NotificationCampaign)
        .where(NotificationCampaign.status == NotificationStatus.pending)
    )
    campaigns = result.scalars().all()
    return {
        "campaigns": [
            {
                "id": c.id,
                "disease_name": c.disease_name,
                "treatment_title": c.treatment_title,
                "status": c.status.value,
                "created_at": c.created_at.isoformat(),
                "email_preview": c.email_template[:500] + "..."
                    if len(c.email_template) > 500 else c.email_template,
            }
            for c in campaigns
        ]
    }


@router.post("/notifications/{campaign_id}/approve")
@router.post("/notifications/{campaign_id}/approve-and-send")
async def approve_and_send_campaign(
    campaign_id: int,
    background_tasks: BackgroundTasks,
    current_user: TokenData = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    from app.db.models import NotificationCampaign
    from sqlalchemy import select

    result = await db.execute(
        select(NotificationCampaign).where(NotificationCampaign.id == campaign_id)
    )
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(404, "Campaign not found")

    await crud.approve_campaign(db, campaign_id, current_user.user_id)

    # Fetch relevant patients
    patients = await crud.get_patients_by_disease_keyword(db, campaign.disease_name)

    # Send emails in background
    background_tasks.add_task(
        _send_campaign_emails, db, campaign_id, patients,
        campaign.treatment_title, campaign.email_template,
    )
    await crud.log_audit(db, current_user.user_id, "approve_campaign",
                          "notification_campaigns", campaign_id)
    return {
        "message": f"Campaign approved. Sending to {len(patients)} patients.",
        "campaign_id": campaign_id,
        "patient_count": len(patients),
    }


async def _send_campaign_emails(db: AsyncSession, campaign_id: int,
                                 patients, treatment_title: str,
                                 email_template: str):
    sent = 0
    for patient in patients:
        success = send_patient_notification(
            patient.email, patient.full_name or patient.username,
            subject=f"Important: New Treatment Available — {treatment_title}",
            email_body=email_template,
        )
        status = "sent" if success else "failed"
        await crud.log_notification(db, campaign_id, patient.id,
                                     patient.email, status)
        if success:
            sent += 1
    from sqlalchemy import update
    from app.db.models import NotificationCampaign, NotificationStatus
    await db.execute(
        update(NotificationCampaign)
        .where(NotificationCampaign.id == campaign_id)
        .values(sent_count=sent, status=NotificationStatus.sent)
    )
    await db.commit()


# ─── Doctor Management ────────────────────────────────────────────────────────

class DoctorCreateRequest(BaseModel):
    username: str
    email: str
    full_name: str
    specialization: str
    phone: Optional[str] = None
    password: str = "Doctor@123"


@router.get("/doctors")
async def list_doctors(
    _: TokenData = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """List all doctor accounts."""
    from sqlalchemy import select
    from app.db.models import User, UserRole
    result = await db.execute(
        select(User).where(User.role == UserRole.doctor).order_by(User.created_at.desc())
    )
    doctors = result.scalars().all()
    return {
        "doctors": [
            {
                "id":             d.id,
                "username":       d.username,
                "email":          d.email,
                "full_name":      d.full_name,
                "specialization": d.specialization or d.gender,
                "phone":          d.phone,
                "is_active":      d.is_active,
                "created_at":     d.created_at.isoformat() if d.created_at else None,
            }
            for d in doctors
        ]
    }


@router.post("/doctors", status_code=201)
async def create_doctor(
    body: DoctorCreateRequest,
    current_user: TokenData = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: create a new doctor account."""
    doctor = await crud.create_user(
        db,
        username=       body.username,
        email=          body.email,
        password=       body.password,
        full_name=      body.full_name,
        specialization= body.specialization,
        phone=          body.phone,
        role=           "doctor",
    )
    await crud.log_audit(db, current_user.user_id, "create_doctor", "users", doctor.id)
    return {
        "message":        "Doctor created",
        "id":             doctor.id,
        "username":       doctor.username,
        "full_name":      doctor.full_name,
        "specialization": doctor.specialization,
    }


@router.patch("/doctors/{doctor_id}/toggle")
async def toggle_doctor_status(
    doctor_id: int,
    current_user: TokenData = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: activate or deactivate a doctor account."""
    from sqlalchemy import select
    from app.db.models import User, UserRole
    result = await db.execute(select(User).where(User.id == doctor_id, User.role == UserRole.doctor))
    doctor = result.scalar_one_or_none()
    if not doctor:
        raise HTTPException(404, "Doctor not found")
    doctor.is_active = not doctor.is_active
    await db.flush()
    await crud.log_audit(db, current_user.user_id,
                         "activate_doctor" if doctor.is_active else "deactivate_doctor",
                         "users", doctor_id)
    return {"id": doctor_id, "is_active": doctor.is_active}


# ─── Audit Logs ───────────────────────────────────────────────────────────────
@router.get("/audit-logs")
async def get_audit_logs(
    limit: int = 50,
    _: TokenData = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import select
    from app.db.models import AuditLog
    result = await db.execute(
        select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit)
    )
    logs = result.scalars().all()
    return {
        "logs": [
            {
                "id": l.id,
                "user_id": l.user_id,
                "action": l.action,
                "resource": l.resource,
                "resource_id": l.resource_id,
                "details": l.details,
                "ip": l.ip_address,
                "timestamp": l.created_at.isoformat(),
            }
            for l in logs
        ]
    }
