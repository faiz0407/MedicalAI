"""
Payment Service — Razorpay integration (with mock fallback for dev).
RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET must be set in .env for live mode.
Leave them blank to run in mock mode (useful for local dev without Razorpay account).
"""
import hmac
import hashlib
import uuid
import logging
from typing import Dict

logger = logging.getLogger(__name__)

CONSULTATION_FEE_PAISE = 100  # ₹1 = 100 paise


def create_razorpay_order(amount_paise: int, receipt: str) -> Dict:
    from app.core.config import settings
    if not settings.RAZORPAY_KEY_ID:
        logger.info("MOCK Razorpay order created (no key configured): receipt=%s", receipt)
        return {
            "id": f"order_MOCK_{uuid.uuid4().hex[:12].upper()}",
            "amount": amount_paise,
            "currency": "INR",
            "_mock": True,
        }
    import razorpay
    client = razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))
    order = client.order.create({
        "amount": amount_paise,
        "currency": "INR",
        "receipt": receipt,
    })
    logger.info("Razorpay order created: id=%s receipt=%s", order["id"], receipt)
    return order


def verify_razorpay_signature(order_id: str, payment_id: str, signature: str) -> bool:
    from app.core.config import settings
    if not settings.RAZORPAY_KEY_SECRET:
        return True  # mock mode — always succeeds
    msg = f"{order_id}|{payment_id}"
    expected = hmac.new(
        settings.RAZORPAY_KEY_SECRET.encode(),
        msg.encode(),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


def refund_payment(payment_reference: str, amount: float) -> Dict:
    logger.info("MOCK REFUND: ref=%s amount=%.2f", payment_reference, amount)
    return {
        "success": True,
        "refund_reference": f"REFUND-{payment_reference}",
        "amount_refunded": amount,
    }
