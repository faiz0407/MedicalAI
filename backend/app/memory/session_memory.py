"""
In-process session memory store.
Keyed by session_id; holds conversation history + user context.
"""
from typing import Dict, List, Optional, Any
from datetime import datetime
import asyncio

# session_id → {messages, user_id, user_context, agents_used}
_store: Dict[str, Dict] = {}
_lock = asyncio.Lock()


async def init_session(session_id: str, user_id: int, user_context: Dict) -> None:
    async with _lock:
        if session_id not in _store:
            _store[session_id] = {
                "user_id": user_id,
                "user_context": user_context,  # {name, age, gender, role}
                "messages": [],
                "agents_used": [],
                "created_at": datetime.utcnow().isoformat(),
                "last_active": datetime.utcnow().isoformat(),
            }


async def add_message(session_id: str, role: str, content: str,
                      agent: Optional[str] = None) -> None:
    async with _lock:
        if session_id not in _store:
            return
        _store[session_id]["messages"].append({
            "role": role, "content": content,
            "agent": agent,
            "timestamp": datetime.utcnow().isoformat(),
        })
        _store[session_id]["last_active"] = datetime.utcnow().isoformat()
        if agent and agent not in _store[session_id]["agents_used"]:
            _store[session_id]["agents_used"].append(agent)


async def get_messages(session_id: str, last_n: int = 20) -> List[Dict]:
    async with _lock:
        if session_id not in _store:
            return []
        return _store[session_id]["messages"][-last_n:]


async def get_session_context(session_id: str) -> Optional[Dict]:
    async with _lock:
        return _store.get(session_id)


async def get_agents_used(session_id: str) -> List[str]:
    async with _lock:
        return _store.get(session_id, {}).get("agents_used", [])


async def get_message_count(session_id: str) -> int:
    async with _lock:
        return len(_store.get(session_id, {}).get("messages", []))


async def clear_session(session_id: str) -> None:
    async with _lock:
        _store.pop(session_id, None)


def get_all_active_sessions() -> Dict[str, Dict]:
    return dict(_store)
