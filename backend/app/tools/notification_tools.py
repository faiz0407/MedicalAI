"""
Agent 5 — Drug / Treatment Notification Tools.
Handles personalized patient notifications for new treatment updates.
"""
from typing import Dict, List
from langchain_core.tools import tool
from pydantic import BaseModel, Field
from datetime import datetime


class TreatmentInput(BaseModel):
    disease_name: str = Field(description="Name of the disease")
    treatment_title: str = Field(description="Title of the new treatment")
    treatment_details: str = Field(description="Detailed treatment information")


@tool("find_relevant_patients")
def find_relevant_patients(disease_name: str) -> Dict:
    """
    Returns a count of patients in the system diagnosed with or
    reporting symptoms related to the given disease.
    Actual patient list is fetched from DB at runtime via the router.
    """
    return {
        "disease_name": disease_name,
        "action": "fetch_patients_by_disease",
        "message": (
            f"Searching for patients with symptoms related to '{disease_name}'. "
            "Patient list will be retrieved from the database."
        ),
    }


@tool("generate_treatment_email", args_schema=TreatmentInput)
def generate_treatment_email(disease_name: str, treatment_title: str,
                              treatment_details: str) -> Dict:
    """
    Generates a personalised, AI-crafted email notification about a
    new treatment for patients with a specific disease.
    """
    subject = f"Important Update: New Treatment Available for {disease_name}"

    email_template = f"""Dear {{patient_name}},

We hope this message finds you well.

We are reaching out because, based on your medical history, you may benefit from
an important new development in the treatment of {disease_name}.

**{treatment_title}**

{treatment_details}

This new treatment option may significantly improve your quality of life. We strongly
encourage you to discuss this with your healthcare provider at your earliest convenience.

To schedule a consultation or learn more:
📞 Call us: 1-800-HEALTH-1
🌐 Visit: https://hospital.example.com/treatments/{disease_name.lower().replace(' ', '-')}
📅 Book online: https://hospital.example.com/book

This communication is intended solely for the above-named individual and is confidential.
If you have any questions, please contact us at care@hospital.example.com.

Warm regards,
The Healthcare AI Team
[Hospital Name]

---
⚕️ This is an informational message only. Do NOT make any changes to your current
treatment without consulting your doctor first.
"""

    return {
        "subject": subject,
        "email_template": email_template,
        "disease_name": disease_name,
        "treatment_title": treatment_title,
        "requires_approval": True,
        "preview_ready": True,
        "message": (
            "Email template generated successfully. "
            "Please review the content before sending to patients."
        ),
    }


@tool("preview_notification_campaign")
def preview_notification_campaign(campaign_id: int,
                                   patient_count: int,
                                   email_subject: str) -> Dict:
    """
    Shows a preview summary of the notification campaign before sending.
    """
    return {
        "campaign_id": campaign_id,
        "patient_count": patient_count,
        "email_subject": email_subject,
        "estimated_reach": patient_count,
        "approval_required": True,
        "preview_message": (
            f"📋 CAMPAIGN PREVIEW\n"
            f"Campaign ID: {campaign_id}\n"
            f"Subject: {email_subject}\n"
            f"Recipients: {patient_count} patient(s)\n\n"
            "⚠️ This campaign requires MANUAL APPROVAL before sending.\n"
            "Please confirm to proceed or cancel."
        ),
    }


@tool("mark_notifications_sent")
def mark_notifications_sent(campaign_id: int, sent_count: int) -> Dict:
    """
    Logs that notifications were sent for a campaign.
    Updates campaign status to 'sent' in the database.
    """
    return {
        "campaign_id": campaign_id,
        "sent_count": sent_count,
        "sent_at": datetime.utcnow().isoformat(),
        "status": "sent",
        "message": (
            f"✅ {sent_count} notification(s) sent successfully for campaign #{campaign_id}. "
            "All logs have been recorded."
        ),
    }
