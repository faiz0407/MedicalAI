"""
CRUD operations — ALL database access goes through these functions.
The LLM never touches the DB directly; agents call these via tool wrappers.
"""
from datetime import datetime, date, timedelta
from typing import List, Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, func, and_, or_
from sqlalchemy.orm import selectinload

from app.db.models import (
    User, Symptom, Appointment, Review, BlogPost,
    NotificationCampaign, NotificationLog, DailySummary,
    AuditLog, ChatSession, ChatMessage, RescheduleRequest,
    UserRole, AppointmentStatus, PaymentStatus,
    ReviewCategory, ContentStatus, NotificationStatus, RescheduleStatus
)
from app.core.security import hash_password


# ──────────────────────────────────────────────────────────────────────────────
# USERS
# ──────────────────────────────────────────────────────────────────────────────

async def create_user(db: AsyncSession, username: str, email: str,
                      password: str, full_name: str = None,
                      age: int = None, gender: str = None,
                      specialization: str = None,
                      phone: str = None,
                      role: str = "patient") -> User:
    user = User(
        username=username, email=email,
        hashed_password=hash_password(password),
        full_name=full_name, age=age, gender=gender,
        specialization=specialization,
        phone=phone,
        role=UserRole(role),
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


async def get_user_by_username(db: AsyncSession, username: str) -> Optional[User]:
    result = await db.execute(select(User).where(User.username == username))
    return result.scalar_one_or_none()


async def get_user_by_id(db: AsyncSession, user_id: int) -> Optional[User]:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def get_user_by_email(db: AsyncSession, email: str) -> Optional[User]:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_patients_by_disease_keyword(db: AsyncSession, keyword: str) -> List[User]:
    """Fetch patients who had symptoms matching a disease keyword."""
    result = await db.execute(
        select(User)
        .join(Symptom, Symptom.user_id == User.id)
        .where(Symptom.raw_text.ilike(f"%{keyword}%"))
        .distinct()
    )
    return result.scalars().all()


async def update_user_profile(db: AsyncSession, user_id: int, **kwargs) -> User:
    await db.execute(update(User).where(User.id == user_id).values(**kwargs))
    return await get_user_by_id(db, user_id)


# ──────────────────────────────────────────────────────────────────────────────
# SYMPTOMS
# ──────────────────────────────────────────────────────────────────────────────

async def save_symptoms(db: AsyncSession, user_id: int, session_id: str,
                        symptoms_list: List[str], raw_text: str,
                        severity: str, is_emergency: bool,
                        ai_response: str) -> Symptom:
    symptom = Symptom(
        user_id=user_id, session_id=session_id,
        symptoms_list=symptoms_list, raw_text=raw_text,
        severity=severity, is_emergency=is_emergency,
        ai_response=ai_response,
    )
    db.add(symptom)
    await db.flush()
    await db.refresh(symptom)
    return symptom


async def get_user_symptoms(db: AsyncSession, user_id: int,
                            limit: int = 20) -> List[Symptom]:
    result = await db.execute(
        select(Symptom)
        .where(Symptom.user_id == user_id)
        .order_by(Symptom.created_at.desc())
        .limit(limit)
    )
    return result.scalars().all()


async def get_most_common_symptoms(db: AsyncSession, days: int = 30) -> List[Dict]:
    """Analytics: most reported symptoms in the past N days."""
    since = datetime.utcnow() - timedelta(days=days)
    result = await db.execute(
        select(Symptom).where(Symptom.created_at >= since)
    )
    symptoms = result.scalars().all()
    freq: Dict[str, int] = {}
    for s in symptoms:
        for sym in (s.symptoms_list or []):
            freq[sym] = freq.get(sym, 0) + 1
    return sorted([{"symptom": k, "count": v} for k, v in freq.items()],
                  key=lambda x: x["count"], reverse=True)[:20]


# ──────────────────────────────────────────────────────────────────────────────
# APPOINTMENTS
# ──────────────────────────────────────────────────────────────────────────────

async def create_appointment(db: AsyncSession, patient_id: int,
                             department: str, appointment_time: datetime,
                             symptoms_summary: str = None) -> Appointment:
    appt = Appointment(
        patient_id=patient_id, department=department,
        appointment_time=appointment_time,
        symptoms_summary=symptoms_summary,
    )
    db.add(appt)
    await db.flush()
    await db.refresh(appt)
    return appt


async def get_appointment(db: AsyncSession, appt_id: int) -> Optional[Appointment]:
    result = await db.execute(
        select(Appointment).where(Appointment.id == appt_id)
    )
    return result.scalar_one_or_none()


async def update_appointment_payment(db: AsyncSession, appt_id: int,
                                     payment_status: str,
                                     payment_reference: str,
                                     confirmation_link: str) -> Appointment:
    await db.execute(
        update(Appointment).where(Appointment.id == appt_id).values(
            payment_status=PaymentStatus(payment_status),
            payment_reference=payment_reference,
            confirmation_link=confirmation_link,
            status=AppointmentStatus.confirmed,
        )
    )
    return await get_appointment(db, appt_id)


async def update_appointment_status(db: AsyncSession, appt_id: int,
                                    status: str) -> Appointment:
    await db.execute(
        update(Appointment).where(Appointment.id == appt_id).values(
            status=AppointmentStatus(status)
        )
    )
    return await get_appointment(db, appt_id)


async def update_appointment_details(
    db: AsyncSession,
    appt_id: int,
    department: str = None,
    appointment_time: datetime = None,
    symptoms_summary: str = None,
) -> Appointment:
    values = {}
    if department:
        values["department"] = department
    if appointment_time:
        values["appointment_time"] = appointment_time
    if symptoms_summary is not None:
        values["symptoms_summary"] = symptoms_summary
    if values:
        await db.execute(
            update(Appointment).where(Appointment.id == appt_id).values(**values)
        )
    return await get_appointment(db, appt_id)


async def get_all_appointments(
    db: AsyncSession,
    status: str = None,
    limit: int = 100,
    offset: int = 0,
) -> List[Appointment]:
    stmt = select(Appointment).order_by(Appointment.appointment_time.desc())
    if status:
        stmt = stmt.where(Appointment.status == AppointmentStatus(status))
    stmt = stmt.limit(limit).offset(offset)
    result = await db.execute(stmt)
    return result.scalars().all()


async def add_appointment_feedback(db: AsyncSession, appt_id: int,
                                   feedback: str, rating: int) -> Appointment:
    await db.execute(
        update(Appointment).where(Appointment.id == appt_id).values(
            feedback=feedback, feedback_rating=rating,
            status=AppointmentStatus.completed,
        )
    )
    return await get_appointment(db, appt_id)


async def get_patient_appointments(db: AsyncSession,
                                   patient_id: int) -> List[Appointment]:
    result = await db.execute(
        select(Appointment)
        .where(Appointment.patient_id == patient_id)
        .order_by(Appointment.appointment_time.desc())
    )
    return result.scalars().all()


async def get_booking_conversion_rate(db: AsyncSession) -> Dict:
    total = await db.execute(select(func.count(Appointment.id)))
    paid  = await db.execute(
        select(func.count(Appointment.id))
        .where(Appointment.payment_status == PaymentStatus.paid)
    )
    t, p = total.scalar(), paid.scalar()
    rate = round((p / t * 100), 2) if t else 0
    return {"total": t, "paid": p, "conversion_rate": rate}


# ──────────────────────────────────────────────────────────────────────────────
# REVIEWS
# ──────────────────────────────────────────────────────────────────────────────

async def save_review(db: AsyncSession, platform: str, reviewer_name: str,
                      rating: float, review_text: str,
                      review_date: datetime, category: str,
                      ai_reply: str, flagged_keywords: List[str]) -> Review:
    review = Review(
        platform=platform, reviewer_name=reviewer_name, rating=rating,
        review_text=review_text, review_date=review_date,
        category=ReviewCategory(category), ai_reply=ai_reply,
        flagged_keywords=flagged_keywords,
    )
    db.add(review)
    await db.flush()
    await db.refresh(review)
    return review


async def get_reviews_by_category(db: AsyncSession, category: str,
                                  limit: int = 10,
                                  since_date: Optional[date] = None) -> List[Review]:
    query = select(Review).where(Review.category == ReviewCategory(category))
    if since_date:
        query = query.where(Review.review_date >= since_date)
    query = query.order_by(Review.review_date.desc()).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


async def approve_review_reply(db: AsyncSession, review_id: int) -> Review:
    await db.execute(
        update(Review).where(Review.id == review_id).values(reply_approved=True)
    )
    result = await db.execute(select(Review).where(Review.id == review_id))
    return result.scalar_one_or_none()


async def get_sentiment_trends(db: AsyncSession, days: int = 30) -> Dict:
    since = datetime.utcnow() - timedelta(days=days)
    result = await db.execute(
        select(Review.category, func.count(Review.id))
        .where(Review.created_at >= since)
        .group_by(Review.category)
    )
    return {row[0]: row[1] for row in result.all()}


# ──────────────────────────────────────────────────────────────────────────────
# BLOG POSTS
# ──────────────────────────────────────────────────────────────────────────────

async def create_blog_post(db: AsyncSession, title: str, content: str,
                           post_type: str, platform: str,
                           tags: List[str] = None) -> BlogPost:
    post = BlogPost(
        title=title, content=content, post_type=post_type,
        platform=platform, tags=tags or [],
        status=ContentStatus.pending,
    )
    db.add(post)
    await db.flush()
    await db.refresh(post)
    return post


async def approve_blog_post(db: AsyncSession, post_id: int,
                            approved_by: int) -> BlogPost:
    await db.execute(
        update(BlogPost).where(BlogPost.id == post_id).values(
            status=ContentStatus.approved,
            approved_by=approved_by,
            approved_at=func.now(),
        )
    )
    result = await db.execute(select(BlogPost).where(BlogPost.id == post_id))
    return result.scalar_one_or_none()


async def get_pending_blog_posts(db: AsyncSession) -> List[BlogPost]:
    result = await db.execute(
        select(BlogPost).where(BlogPost.status == ContentStatus.pending)
        .order_by(BlogPost.created_at.desc())
    )
    return result.scalars().all()


# ──────────────────────────────────────────────────────────────────────────────
# NOTIFICATIONS
# ──────────────────────────────────────────────────────────────────────────────

async def create_notification_campaign(db: AsyncSession, disease_name: str,
                                       treatment_title: str,
                                       treatment_details: str,
                                       email_template: str) -> NotificationCampaign:
    campaign = NotificationCampaign(
        disease_name=disease_name,
        treatment_title=treatment_title,
        treatment_details=treatment_details,
        email_template=email_template,
    )
    db.add(campaign)
    await db.flush()
    await db.refresh(campaign)
    return campaign


async def approve_campaign(db: AsyncSession, campaign_id: int,
                           approved_by: int) -> NotificationCampaign:
    await db.execute(
        update(NotificationCampaign)
        .where(NotificationCampaign.id == campaign_id)
        .values(status=NotificationStatus.approved,
                approved_by=approved_by,
                approved_at=func.now())
    )
    result = await db.execute(
        select(NotificationCampaign).where(NotificationCampaign.id == campaign_id)
    )
    return result.scalar_one_or_none()


async def log_notification(db: AsyncSession, campaign_id: int,
                           patient_id: int, email: str,
                           status: str, error_msg: str = None) -> NotificationLog:
    log = NotificationLog(
        campaign_id=campaign_id, patient_id=patient_id,
        email=email, status=NotificationStatus(status),
        sent_at=datetime.utcnow() if status == "sent" else None,
        error_msg=error_msg,
    )
    db.add(log)
    await db.flush()
    return log


# ──────────────────────────────────────────────────────────────────────────────
# RESCHEDULE REQUESTS
# ──────────────────────────────────────────────────────────────────────────────

async def create_reschedule_request(
    db: AsyncSession,
    appointment_id: int,
    patient_id: int,
    reason: str = None,
    requested_department: str = None,
    requested_time: datetime = None,
    requested_symptoms_summary: str = None,
) -> RescheduleRequest:
    req = RescheduleRequest(
        appointment_id=appointment_id,
        patient_id=patient_id,
        reason=reason,
        requested_department=requested_department,
        requested_time=requested_time,
        requested_symptoms_summary=requested_symptoms_summary,
    )
    db.add(req)
    await db.flush()
    await db.refresh(req)
    return req


async def get_reschedule_request(db: AsyncSession, req_id: int) -> Optional[RescheduleRequest]:
    result = await db.execute(
        select(RescheduleRequest).where(RescheduleRequest.id == req_id)
    )
    return result.scalar_one_or_none()


async def list_reschedule_requests(
    db: AsyncSession,
    status: str = None,
    patient_id: int = None,
) -> List[RescheduleRequest]:
    stmt = select(RescheduleRequest).order_by(RescheduleRequest.created_at.desc())
    if status:
        stmt = stmt.where(RescheduleRequest.status == RescheduleStatus(status))
    if patient_id:
        stmt = stmt.where(RescheduleRequest.patient_id == patient_id)
    result = await db.execute(stmt)
    return result.scalars().all()


async def resolve_reschedule_request(
    db: AsyncSession,
    req_id: int,
    status: str,
    resolved_by: int,
    admin_notes: str = None,
) -> RescheduleRequest:
    await db.execute(
        update(RescheduleRequest)
        .where(RescheduleRequest.id == req_id)
        .values(
            status=RescheduleStatus(status),
            resolved_by=resolved_by,
            resolved_at=datetime.utcnow(),
            admin_notes=admin_notes,
        )
    )
    return await get_reschedule_request(db, req_id)


# ──────────────────────────────────────────────────────────────────────────────
# DAILY SUMMARIES
# ──────────────────────────────────────────────────────────────────────────────

async def save_daily_summary(db: AsyncSession, user_id: int,
                             summary_date: datetime, summary_text: str,
                             interaction_count: int,
                             agents_used: List[str]) -> DailySummary:
    summary = DailySummary(
        user_id=user_id, summary_date=summary_date,
        summary_text=summary_text,
        interaction_count=interaction_count,
        agents_used=agents_used,
    )
    db.add(summary)
    await db.flush()
    await db.refresh(summary)
    return summary


async def get_recent_summaries(db: AsyncSession, user_id: int,
                               days: int = 5) -> List[DailySummary]:
    since = datetime.utcnow() - timedelta(days=days)
    result = await db.execute(
        select(DailySummary)
        .where(and_(DailySummary.user_id == user_id,
                    DailySummary.summary_date >= since))
        .order_by(DailySummary.summary_date.desc())
    )
    return result.scalars().all()


# ──────────────────────────────────────────────────────────────────────────────
# AUDIT LOGS
# ──────────────────────────────────────────────────────────────────────────────

async def log_audit(db: AsyncSession, user_id: Optional[int],
                    action: str, resource: str,
                    resource_id: Optional[int] = None,
                    details: Dict = None,
                    ip_address: str = None) -> AuditLog:
    log = AuditLog(
        user_id=user_id, action=action, resource=resource,
        resource_id=resource_id, details=details or {},
        ip_address=ip_address,
    )
    db.add(log)
    await db.flush()
    return log


# ──────────────────────────────────────────────────────────────────────────────
# CHAT SESSIONS
# ──────────────────────────────────────────────────────────────────────────────

async def get_or_create_session(db: AsyncSession, session_id: str,
                                user_id: int) -> ChatSession:
    result = await db.execute(
        select(ChatSession).where(ChatSession.session_id == session_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        session = ChatSession(session_id=session_id, user_id=user_id)
        db.add(session)
        await db.flush()
        await db.refresh(session)
    return session


async def save_chat_message(db: AsyncSession, session_fk_id: int,
                            role: str, content: str,
                            agent_used: str = None,
                            metadata: Dict = None) -> ChatMessage:
    msg = ChatMessage(
        session_id_fk=session_fk_id, role=role,
        content=content, agent_used=agent_used,
        metadata=metadata or {},
    )
    db.add(msg)
    await db.flush()
    return msg


async def get_session_messages(db: AsyncSession,
                               session_id: str,
                               limit: int = 50) -> List[ChatMessage]:
    sess_result = await db.execute(
        select(ChatSession).where(ChatSession.session_id == session_id)
    )
    sess = sess_result.scalar_one_or_none()
    if not sess:
        return []
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id_fk == sess.id)
        .order_by(ChatMessage.created_at.asc())
        .limit(limit)
    )
    return result.scalars().all()
