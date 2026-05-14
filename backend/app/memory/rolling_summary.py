"""
5-Day Rolling Summary Memory.

At end of each day (or on demand):
 1. Collect all messages for user in that session
 2. Use Groq llama-3.1-8b-instant to produce a concise summary (cheap, fast)
 3. Store in DB + in-memory cache

During next session, the last 5 daily summaries are injected into
the system prompt to give the LLM medium-term context.
"""
from typing import List, Dict
from datetime import datetime
from app.core.config import settings

# Cache: user_id → list of summary dicts (last 5 days)
_summary_cache: Dict[int, List[Dict]] = {}


async def generate_daily_summary(user_id: int, messages: List[Dict],
                                  agents_used: List[str]) -> str:
    """Summarise a conversation using Anthropic Haiku (fast, cheap)."""
    if not messages:
        return "No interactions recorded today."

    transcript = "\n".join(
        f"{m['role'].upper()}: {m['content']}" for m in messages
    )
    prompt = (
        "You are a medical assistant summariser. "
        "Produce a concise (3-5 sentence) summary of the following patient-chatbot "
        "conversation for the medical record. Include: main symptoms discussed, "
        "guidance provided, and any appointments or actions taken.\n\n"
        f"CONVERSATION:\n{transcript}\n\n"
        f"Agents used: {', '.join(agents_used)}"
    )

    try:
        from groq import AsyncGroq
        client = AsyncGroq(api_key=settings.GROQ_API_KEY)
        response = await client.chat.completions.create(
            model=settings.GROQ_MODEL_FAST,
            max_tokens=300,
            temperature=0.3,
            messages=[{"role": "user", "content": prompt}],
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        return f"Summary generation failed: {str(e)}"


async def store_summary_in_db(db, user_id: int, summary_date: datetime,
                               summary_text: str, interaction_count: int,
                               agents_used: List[str]):
    from app.db.crud import save_daily_summary
    return await save_daily_summary(
        db, user_id=user_id, summary_date=summary_date,
        summary_text=summary_text, interaction_count=interaction_count,
        agents_used=agents_used,
    )


async def load_rolling_summaries(db, user_id: int) -> List[Dict]:
    """Load last 5 days of summaries from DB into cache and return."""
    from app.db.crud import get_recent_summaries
    rows = await get_recent_summaries(db, user_id=user_id,
                                       days=settings.ROLLING_SUMMARY_DAYS)
    summaries = [
        {
            "date":        row.summary_date.strftime("%Y-%m-%d"),
            "summary":     row.summary_text,
            "agents_used": row.agents_used or [],
        }
        for row in rows
    ]
    _summary_cache[user_id] = summaries
    return summaries


def get_cached_summaries(user_id: int) -> List[Dict]:
    return _summary_cache.get(user_id, [])


def build_memory_context_string(user_id: int) -> str:
    """Format rolling summaries as a system prompt section."""
    summaries = get_cached_summaries(user_id)
    if not summaries:
        return ""
    lines = ["## Recent Patient History (last 5 days):"]
    for s in summaries:
        lines.append(f"[{s['date']}] {s['summary']}")
    return "\n".join(lines)
