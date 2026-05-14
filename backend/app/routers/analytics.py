"""
Analytics Router — dashboard metrics, trends, reports.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.db import crud
from app.core.security import require_admin, TokenData

router = APIRouter(prefix="/api/analytics", tags=["Analytics"])


@router.get("/dashboard")
async def get_dashboard(
    _: TokenData = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Aggregate dashboard metrics for admin."""
    from sqlalchemy import select, func
    from app.db.models import (
        User, Appointment, Review, BlogPost, NotificationCampaign,
        UserRole, AppointmentStatus, PaymentStatus
    )

    # Patient count
    p_count = await db.execute(
        select(func.count(User.id)).where(User.role == UserRole.patient)
    )
    # Doctor count
    d_count = await db.execute(
        select(func.count(User.id)).where(User.role == UserRole.doctor)
    )
    # Today's appointments — use DB-side current_date so it matches the
    # server's local timezone rather than Python's utcnow()
    from sqlalchemy import text
    appt_today = await db.execute(
        select(func.count(Appointment.id))
        .where(func.date(Appointment.appointment_time) == func.current_date())
    )
    # All-time appointments
    appt_total = await db.execute(select(func.count(Appointment.id)))
    # Conversion rate — return as decimal fraction (0.55 not 55)
    conversion = await crud.get_booking_conversion_rate(db)
    # Pending reviews
    from app.db.models import ReviewCategory
    high_risk = await db.execute(
        select(func.count(Review.id))
        .where(Review.category == ReviewCategory.high_risk)
    )
    # Pending content
    pending_content = await db.execute(
        select(func.count(BlogPost.id))
        .where(BlogPost.status == "pending")
    )

    return {
        "total_patients": p_count.scalar(),
        "total_doctors": d_count.scalar(),
        "total_appointments": appt_total.scalar(),
        "appointments_today": appt_today.scalar(),
        "booking_conversion": round(conversion.get("conversion_rate", 0) / 100, 4),
        "high_risk_reviews_total": high_risk.scalar(),
        "pending_content_items": pending_content.scalar(),
    }


@router.get("/symptoms/trends")
async def symptom_trends(
    days: int = 30,
    _: TokenData = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Most common symptoms reported in the last N days."""
    data = await crud.get_most_common_symptoms(db, days=days)
    return {"days": days, "top_symptoms": data}


@router.get("/reviews/sentiment")
async def review_sentiment(
    days: int = 30,
    _: TokenData = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Sentiment trend across review categories."""
    trends = await crud.get_sentiment_trends(db, days=days)
    return {
        "days": days,
        "sentiment": {k.value if hasattr(k, "value") else k: v
                      for k, v in trends.items()},
    }


@router.get("/activity")
async def activity_trend(
    days: int = 7,
    _: TokenData = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Daily appointment and user registration counts for the last N days."""
    from sqlalchemy import select, func, cast, Date
    from app.db.models import Appointment, User
    from datetime import datetime, timedelta

    since = datetime.utcnow().date() - timedelta(days=days - 1)

    appt_rows = await db.execute(
        select(
            cast(Appointment.appointment_time, Date).label("day"),
            func.count(Appointment.id).label("appointments"),
        )
        .where(cast(Appointment.appointment_time, Date) >= since)
        .group_by(cast(Appointment.appointment_time, Date))
        .order_by(cast(Appointment.appointment_time, Date))
    )
    appt_by_day = {str(r.day): r.appointments for r in appt_rows.all()}

    user_rows = await db.execute(
        select(
            cast(User.created_at, Date).label("day"),
            func.count(User.id).label("registrations"),
        )
        .where(cast(User.created_at, Date) >= since)
        .group_by(cast(User.created_at, Date))
        .order_by(cast(User.created_at, Date))
    )
    user_by_day = {str(r.day): r.registrations for r in user_rows.all()}

    result = []
    for i in range(days):
        day = since + timedelta(days=i)
        day_str = str(day)
        result.append({
            "day":           day.strftime("%a"),
            "date":          day_str,
            "appointments":  appt_by_day.get(day_str, 0),
            "registrations": user_by_day.get(day_str, 0),
        })
    return {"days": days, "activity": result}


@router.get("/appointments/stats")
async def appointment_stats(
    _: TokenData = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Appointment booking and completion statistics."""
    from sqlalchemy import select, func
    from app.db.models import Appointment, AppointmentStatus

    result = await db.execute(
        select(Appointment.status, func.count(Appointment.id))
        .group_by(Appointment.status)
    )
    stats = {row[0].value: row[1] for row in result.all()}
    conversion = await crud.get_booking_conversion_rate(db)

    return {"by_status": stats, "conversion": conversion}
