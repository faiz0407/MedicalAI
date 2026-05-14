"""
Email Service — sends alerts and patient notifications via SMTP.
"""
import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import List, Dict
from app.core.config import settings

logger = logging.getLogger(__name__)


def _send_email(to_addresses: List[str], subject: str, body: str,
                html: bool = False) -> bool:
    """Low-level SMTP send. Returns True on success."""
    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        logger.warning("SMTP not configured — email NOT sent to %s", to_addresses)
        logger.info("MOCK EMAIL | To: %s | Subject: %s", to_addresses, subject)
        return True  # Mock success for dev

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = settings.SMTP_USER
    msg["To"]      = ", ".join(to_addresses)
    part = MIMEText(body, "html" if html else "plain")
    msg.attach(part)

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            server.ehlo()
            server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.sendmail(settings.SMTP_USER, to_addresses, msg.as_string())
        logger.info("Email sent to %s | Subject: %s", to_addresses, subject)
        return True
    except Exception as e:
        logger.error("Email send failed: %s", e)
        return False


def send_high_risk_alert(review_text: str, reviewer: str,
                          flagged_keywords: List[str]) -> bool:
    """Alert hospital owner about a high-risk review."""
    subject = "⚠️ HIGH RISK Review Detected — Immediate Attention Required"
    body = f"""
    <h2 style="color:red;">⚠️ High Risk Review Alert</h2>
    <p><strong>Reviewer:</strong> {reviewer}</p>
    <p><strong>Review Text:</strong><br><em>"{review_text}"</em></p>
    <p><strong>Flagged Keywords:</strong> {', '.join(flagged_keywords)}</p>
    <p>Please log in to the admin dashboard to review and approve a response.</p>
    <p><a href="https://healthcare.example.com/admin/reviews">View in Dashboard</a></p>
    """
    return _send_email([settings.ALERT_EMAIL], subject, body, html=True)


def send_appointment_confirmation(patient_email: str, patient_name: str,
                                   department: str, appointment_time: str,
                                   confirmation_link: str) -> bool:
    subject = "✅ Appointment Confirmed — HealthcareAI"
    body = f"""
    <h2>Appointment Confirmed!</h2>
    <p>Dear {patient_name},</p>
    <p>Your appointment has been successfully booked.</p>
    <ul>
        <li><strong>Department:</strong> {department}</li>
        <li><strong>Date & Time:</strong> {appointment_time}</li>
    </ul>
    <p><a href="{confirmation_link}">View Confirmation</a></p>
    <p>Please arrive 10 minutes early. Bring your ID and insurance card.</p>
    <p>Best regards,<br>HealthcareAI Team</p>
    """
    return _send_email([patient_email], subject, body, html=True)


def send_patient_notification(patient_email: str, patient_name: str,
                               subject: str, email_body: str) -> bool:
    """Send a treatment notification to a specific patient."""
    personalised_body = email_body.replace("{patient_name}", patient_name)
    return _send_email([patient_email], subject, personalised_body)


def send_no_show_notification(patient_email: str, patient_name: str,
                               appointment_time: str) -> bool:
    subject = "Missed Appointment — Would you like to reschedule?"
    body = f"""
    <p>Dear {patient_name},</p>
    <p>We noticed you missed your appointment scheduled for {appointment_time}.</p>
    <p>Would you like to reschedule? Please reply to this email or visit our portal.</p>
    <p><a href="https://healthcare.example.com/reschedule">Reschedule Now</a></p>
    """
    return _send_email([patient_email], subject, body, html=True)
