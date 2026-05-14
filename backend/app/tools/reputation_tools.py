"""
Agent 3 — Reputation Management Tools.
Fetches, categorises, and manages hospital reviews.
"""
import random
from typing import Dict, List
from langchain_core.tools import tool
from datetime import datetime, timedelta


HIGH_RISK_KEYWORDS = {
    "unhygienic", "dirty", "negligence", "malpractice", "rude staff",
    "wrong diagnosis", "overcharged", "scam", "incompetent", "dangerous",
    "unqualified", "fraud", "unprofessional",
}

MODERATE_KEYWORDS = {
    "waiting time", "long wait", "slow service", "average", "okay",
    "could be better", "not great",
}


def _categorise_review(text: str) -> tuple[str, List[str]]:
    text_lower = text.lower()
    matched_high = [kw for kw in HIGH_RISK_KEYWORDS if kw in text_lower]
    matched_mod  = [kw for kw in MODERATE_KEYWORDS  if kw in text_lower]
    if matched_high:
        return "high_risk", matched_high
    if matched_mod:
        return "moderate", matched_mod
    return "good", []


def _mock_fetch_reviews(count: int = 10) -> List[Dict]:
    """Simulates Google Reviews API response."""
    mock_reviews = [
        {"name": "Alice M.", "rating": 5.0,
         "text": "Excellent service! Doctors were very attentive and professional.",
         "date": (datetime.utcnow() - timedelta(days=1)).isoformat()},
        {"name": "Bob K.", "rating": 1.0,
         "text": "Unhygienic environment. Staff were rude and showed negligence.",
         "date": (datetime.utcnow() - timedelta(days=2)).isoformat()},
        {"name": "Carol S.", "rating": 3.0,
         "text": "Long waiting time but the doctor was good. Average experience overall.",
         "date": (datetime.utcnow() - timedelta(days=1)).isoformat()},
        {"name": "David R.", "rating": 5.0,
         "text": "Wonderful staff, very clean facility. Highly recommend!",
         "date": (datetime.utcnow() - timedelta(days=0)).isoformat()},
        {"name": "Emma P.", "rating": 2.0,
         "text": "I felt the diagnosis was wrong. Very unprofessional behavior from reception.",
         "date": (datetime.utcnow() - timedelta(days=3)).isoformat()},
        {"name": "Frank L.", "rating": 4.0,
         "text": "Good doctors, modern equipment. Slightly high charges but overall satisfied.",
         "date": (datetime.utcnow() - timedelta(days=1)).isoformat()},
        {"name": "Grace T.", "rating": 5.0,
         "text": "Best hospital in town. Saved my life. Thank you to all the staff!",
         "date": (datetime.utcnow() - timedelta(days=0)).isoformat()},
        {"name": "Henry O.", "rating": 1.0,
         "text": "Possible malpractice. Will be reporting to the medical board.",
         "date": (datetime.utcnow() - timedelta(days=2)).isoformat()},
        {"name": "Irene W.", "rating": 4.0,
         "text": "Professional and caring nurses. Doctor explained everything clearly.",
         "date": (datetime.utcnow() - timedelta(days=1)).isoformat()},
        {"name": "Jack N.", "rating": 3.0,
         "text": "Okay experience. Could be better in terms of cleanliness.",
         "date": (datetime.utcnow() - timedelta(days=2)).isoformat()},
    ]
    return random.sample(mock_reviews, min(count, len(mock_reviews)))


@tool("fetch_and_categorise_reviews")
def fetch_and_categorise_reviews(count: int = 10) -> Dict:
    """
    Fetches recent hospital reviews from Google (mock) and categorises them
    as good, moderate, or high_risk.
    """
    raw_reviews = _mock_fetch_reviews(count)
    categorised = []
    high_risk_reviews = []

    for r in raw_reviews:
        category, flagged = _categorise_review(r["text"])
        entry = {**r, "category": category, "flagged_keywords": flagged}
        categorised.append(entry)
        if category == "high_risk":
            high_risk_reviews.append(entry)

    return {
        "total_fetched": len(categorised),
        "reviews": categorised,
        "high_risk_count": len(high_risk_reviews),
        "high_risk_reviews": high_risk_reviews,
        "alert_required": len(high_risk_reviews) > 0,
        "message": (
            f"⚠️ {len(high_risk_reviews)} HIGH RISK review(s) detected! "
            "Email alert will be sent to hospital owner."
            if high_risk_reviews else
            "Reviews processed. No high-risk issues detected."
        ),
    }


@tool("generate_ai_reply")
def generate_ai_reply(review_text: str, category: str,
                       reviewer_name: str) -> Dict:
    """
    Generates a professional, empathetic AI reply for a review.
    Requires admin approval before posting.
    """
    if category == "high_risk":
        reply = (
            f"Dear {reviewer_name}, thank you for bringing this to our attention. "
            "We sincerely apologise for the experience you described. This does not "
            "reflect our standards of care. Our quality team is reviewing your feedback "
            "and will contact you directly within 24 hours to resolve this matter. "
            "Please reach us at care@hospital.example.com."
        )
    elif category == "moderate":
        reply = (
            f"Dear {reviewer_name}, thank you for your honest feedback. "
            "We appreciate you taking the time to share your experience. "
            "We are continually working to improve our services and your input "
            "helps us do that. We hope to provide you with an exceptional experience "
            "on your next visit."
        )
    else:
        reply = (
            f"Dear {reviewer_name}, thank you so much for your wonderful feedback! "
            "It means a great deal to our entire team to know we made a positive difference. "
            "We look forward to serving you again."
        )

    return {
        "generated_reply": reply,
        "requires_approval": True,
        "note": "This reply requires admin approval before it can be posted publicly.",
        "category": category,
    }


@tool("get_top_reviews")
def get_top_reviews(category: str = "good", limit: int = 10,
                     days_back: int = 1) -> Dict:
    """
    Returns top reviews filtered by category and date range.
    E.g., 'Show top 10 good reviews from yesterday'.
    """
    all_reviews = _mock_fetch_reviews(20)
    cutoff = datetime.utcnow() - timedelta(days=days_back)
    filtered = []
    for r in all_reviews:
        cat, _ = _categorise_review(r["text"])
        if cat == category:
            try:
                rev_date = datetime.fromisoformat(r["date"])
                if rev_date >= cutoff:
                    filtered.append({**r, "category": cat})
            except Exception:
                pass
    return {
        "category": category,
        "days_back": days_back,
        "count": len(filtered[:limit]),
        "reviews": filtered[:limit],
    }
