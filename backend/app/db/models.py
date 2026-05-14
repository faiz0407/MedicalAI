"""
SQLAlchemy ORM models — all DB tables defined here.
"""
from datetime import datetime
from typing import Optional
from sqlalchemy import (
    Column, Integer, String, Text, Boolean, DateTime,
    ForeignKey, Float, Enum as SAEnum, JSON
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.database import Base
import enum


# ──────────────────────────────────────────────────────────────────────────────
# ENUMS
# ──────────────────────────────────────────────────────────────────────────────

class UserRole(str, enum.Enum):
    patient = "patient"
    doctor  = "doctor"
    admin   = "admin"


class AppointmentStatus(str, enum.Enum):
    pending    = "pending"
    confirmed  = "confirmed"
    cancelled  = "cancelled"
    completed  = "completed"
    no_show    = "no_show"


class PaymentStatus(str, enum.Enum):
    pending   = "pending"
    paid      = "paid"
    failed    = "failed"
    refunded  = "refunded"


class ReviewCategory(str, enum.Enum):
    good      = "good"
    moderate  = "moderate"
    high_risk = "high_risk"


class ContentStatus(str, enum.Enum):
    draft    = "draft"
    pending  = "pending"
    approved = "approved"
    rejected = "rejected"
    published = "published"


class NotificationStatus(str, enum.Enum):
    pending  = "pending"
    approved = "approved"
    sent     = "sent"
    failed   = "failed"


# ──────────────────────────────────────────────────────────────────────────────
# USERS
# ──────────────────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id            = Column(Integer, primary_key=True, index=True)
    username      = Column(String(100), unique=True, nullable=False, index=True)
    email         = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name     = Column(String(255))
    age           = Column(Integer)
    gender        = Column(String(20))
    specialization = Column(String(200))   # doctors only
    phone         = Column(String(20))
    role          = Column(SAEnum(UserRole), default=UserRole.patient, nullable=False)
    is_active     = Column(Boolean, default=True)
    created_at    = Column(DateTime(timezone=True), server_default=func.now())
    updated_at    = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    symptoms      = relationship("Symptom", back_populates="user")
    appointments  = relationship("Appointment", back_populates="patient",
                                 foreign_keys="Appointment.patient_id")
    daily_summaries = relationship("DailySummary", back_populates="user")
    notifications_received = relationship("NotificationLog", back_populates="patient")


# ──────────────────────────────────────────────────────────────────────────────
# SYMPTOMS
# ──────────────────────────────────────────────────────────────────────────────

class Symptom(Base):
    __tablename__ = "symptoms"

    id            = Column(Integer, primary_key=True, index=True)
    user_id       = Column(Integer, ForeignKey("users.id"), nullable=False)
    session_id    = Column(String(100), index=True)
    symptoms_list = Column(JSON)                   # ["chest pain", "fever"]
    raw_text      = Column(Text)                   # original user text
    severity      = Column(String(50))             # mild / moderate / severe
    is_emergency  = Column(Boolean, default=False)
    ai_response   = Column(Text)
    created_at    = Column(DateTime(timezone=True), server_default=func.now())

    user          = relationship("User", back_populates="symptoms")


# ──────────────────────────────────────────────────────────────────────────────
# APPOINTMENTS
# ──────────────────────────────────────────────────────────────────────────────

class Appointment(Base):
    __tablename__ = "appointments"

    id                 = Column(Integer, primary_key=True, index=True)
    patient_id         = Column(Integer, ForeignKey("users.id"), nullable=False)
    doctor_id          = Column(Integer, ForeignKey("users.id"), nullable=True)
    department         = Column(String(100))
    appointment_time   = Column(DateTime(timezone=True))
    symptoms_summary   = Column(Text)
    status             = Column(SAEnum(AppointmentStatus), default=AppointmentStatus.pending)
    payment_status     = Column(SAEnum(PaymentStatus), default=PaymentStatus.pending)
    payment_reference  = Column(String(200))
    confirmation_link  = Column(String(500))
    feedback           = Column(Text)
    feedback_rating    = Column(Integer)           # 1-5
    rescheduled_from   = Column(Integer, ForeignKey("appointments.id"), nullable=True)
    created_at         = Column(DateTime(timezone=True), server_default=func.now())
    updated_at         = Column(DateTime(timezone=True), onupdate=func.now())

    patient            = relationship("User", back_populates="appointments",
                                      foreign_keys=[patient_id])
    doctor             = relationship("User", foreign_keys=[doctor_id])


# ──────────────────────────────────────────────────────────────────────────────
# REVIEWS
# ──────────────────────────────────────────────────────────────────────────────

class Review(Base):
    __tablename__ = "reviews"

    id              = Column(Integer, primary_key=True, index=True)
    platform        = Column(String(50), default="google")   # google | facebook | etc.
    reviewer_name   = Column(String(200))
    rating          = Column(Float)
    review_text     = Column(Text)
    review_date     = Column(DateTime(timezone=True))
    category        = Column(SAEnum(ReviewCategory))
    ai_reply        = Column(Text)
    reply_approved  = Column(Boolean, default=False)
    reply_posted    = Column(Boolean, default=False)
    flagged_keywords = Column(JSON)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())


# ──────────────────────────────────────────────────────────────────────────────
# BLOG POSTS / SOCIAL CONTENT
# ──────────────────────────────────────────────────────────────────────────────

class BlogPost(Base):
    __tablename__ = "blog_posts"

    id           = Column(Integer, primary_key=True, index=True)
    title        = Column(String(500))
    content      = Column(Text)
    post_type    = Column(String(50))       # blog | social_media | website
    platform     = Column(String(100))      # website | twitter | linkedin
    status       = Column(SAEnum(ContentStatus), default=ContentStatus.draft)
    approved_by  = Column(Integer, ForeignKey("users.id"), nullable=True)
    approved_at  = Column(DateTime(timezone=True))
    published_at = Column(DateTime(timezone=True))
    tags         = Column(JSON)
    created_at   = Column(DateTime(timezone=True), server_default=func.now())
    updated_at   = Column(DateTime(timezone=True), onupdate=func.now())


# ──────────────────────────────────────────────────────────────────────────────
# NOTIFICATIONS / DRUG ALERTS
# ──────────────────────────────────────────────────────────────────────────────

class NotificationCampaign(Base):
    __tablename__ = "notification_campaigns"

    id              = Column(Integer, primary_key=True, index=True)
    disease_name    = Column(String(200))
    treatment_title = Column(String(500))
    treatment_details = Column(Text)
    email_template  = Column(Text)          # AI-generated template
    status          = Column(SAEnum(NotificationStatus), default=NotificationStatus.pending)
    approved_by     = Column(Integer, ForeignKey("users.id"), nullable=True)
    approved_at     = Column(DateTime(timezone=True))
    sent_count      = Column(Integer, default=0)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())

    logs            = relationship("NotificationLog", back_populates="campaign")


class NotificationLog(Base):
    __tablename__ = "notification_logs"

    id           = Column(Integer, primary_key=True, index=True)
    campaign_id  = Column(Integer, ForeignKey("notification_campaigns.id"))
    patient_id   = Column(Integer, ForeignKey("users.id"))
    email        = Column(String(255))
    status       = Column(SAEnum(NotificationStatus), default=NotificationStatus.pending)
    sent_at      = Column(DateTime(timezone=True))
    error_msg    = Column(Text)

    campaign     = relationship("NotificationCampaign", back_populates="logs")
    patient      = relationship("User", back_populates="notifications_received")


# ──────────────────────────────────────────────────────────────────────────────
# DAILY SUMMARIES (Memory System)
# ──────────────────────────────────────────────────────────────────────────────

class DailySummary(Base):
    __tablename__ = "daily_summaries"

    id           = Column(Integer, primary_key=True, index=True)
    user_id      = Column(Integer, ForeignKey("users.id"))
    summary_date = Column(DateTime(timezone=True))
    summary_text = Column(Text)
    interaction_count = Column(Integer, default=0)
    agents_used  = Column(JSON)                  # ["agent1", "agent2"]
    created_at   = Column(DateTime(timezone=True), server_default=func.now())

    user         = relationship("User", back_populates="daily_summaries")


# ──────────────────────────────────────────────────────────────────────────────
# RESCHEDULE REQUESTS
# ──────────────────────────────────────────────────────────────────────────────

class RescheduleStatus(str, enum.Enum):
    pending  = "pending"
    approved = "approved"
    rejected = "rejected"


class RescheduleRequest(Base):
    __tablename__ = "reschedule_requests"

    id                        = Column(Integer, primary_key=True, index=True)
    appointment_id            = Column(Integer, ForeignKey("appointments.id"), nullable=False)
    patient_id                = Column(Integer, ForeignKey("users.id"), nullable=False)
    requested_department      = Column(String(100))
    requested_time            = Column(DateTime(timezone=True))
    requested_symptoms_summary = Column(Text)
    reason                    = Column(Text)
    status                    = Column(SAEnum(RescheduleStatus), default=RescheduleStatus.pending, nullable=False)
    admin_notes               = Column(Text)
    resolved_by               = Column(Integer, ForeignKey("users.id"), nullable=True)
    resolved_at               = Column(DateTime(timezone=True))
    created_at                = Column(DateTime(timezone=True), server_default=func.now())

    appointment = relationship("Appointment", foreign_keys=[appointment_id])
    patient     = relationship("User", foreign_keys=[patient_id])


# ──────────────────────────────────────────────────────────────────────────────
# AUDIT LOGS
# ──────────────────────────────────────────────────────────────────────────────

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id          = Column(Integer, primary_key=True, index=True)
    user_id     = Column(Integer, ForeignKey("users.id"), nullable=True)
    action      = Column(String(200))
    resource    = Column(String(200))
    resource_id = Column(Integer)
    details     = Column(JSON)
    ip_address  = Column(String(50))
    created_at  = Column(DateTime(timezone=True), server_default=func.now())


# ──────────────────────────────────────────────────────────────────────────────
# CHAT SESSIONS
# ──────────────────────────────────────────────────────────────────────────────

class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id           = Column(Integer, primary_key=True, index=True)
    session_id   = Column(String(100), unique=True, index=True)
    user_id      = Column(Integer, ForeignKey("users.id"))
    started_at   = Column(DateTime(timezone=True), server_default=func.now())
    last_active  = Column(DateTime(timezone=True), server_default=func.now())
    message_count = Column(Integer, default=0)
    agents_invoked = Column(JSON)

    messages     = relationship("ChatMessage", back_populates="session")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id           = Column(Integer, primary_key=True, index=True)
    session_id_fk = Column(Integer, ForeignKey("chat_sessions.id"))
    role         = Column(String(20))     # user | assistant | system
    content      = Column(Text)
    agent_used   = Column(String(50))
    msg_metadata = Column("metadata", JSON)
    created_at   = Column(DateTime(timezone=True), server_default=func.now())

    session      = relationship("ChatSession", back_populates="messages")
