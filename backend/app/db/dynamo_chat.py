"""
DynamoDB-backed chat storage — replaces PostgreSQL for sessions and messages.

Tables (PAY_PER_REQUEST billing — fits within DynamoDB free tier):
  healthcare_chat_sessions
    PK: user_id    (String)
    SK: session_id (String)

  healthcare_chat_messages
    PK: session_id (String)
    SK: created_at (String, ISO-8601 with microseconds — lexicographic sort = chronological)

All public methods are async; synchronous boto3 calls run in a thread-pool executor
so they never block the FastAPI event loop.
"""
import asyncio
import logging
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from functools import partial
from typing import Any, Dict, List, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

SESSIONS_TABLE = "healthcare_chat_sessions"
MESSAGES_TABLE = "healthcare_chat_messages"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _deserialize(obj: Any) -> Any:
    """Recursively convert DynamoDB Decimal values to int/float."""
    if isinstance(obj, Decimal):
        return int(obj) if obj == int(obj) else float(obj)
    if isinstance(obj, dict):
        return {k: _deserialize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_deserialize(i) for i in obj]
    return obj


def _serialize(obj: Any) -> Any:
    """Recursively convert float→Decimal so DynamoDB accepts the item."""
    if isinstance(obj, float):
        return Decimal(str(obj))
    if isinstance(obj, dict):
        return {k: _serialize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_serialize(i) for i in obj]
    return obj


class DynamoChatDB:
    """
    Wraps two DynamoDB tables for chat sessions + messages.
    Call ``await dynamo_chat.initialize()`` once at application startup.
    """

    def __init__(self) -> None:
        self._dynamodb = None
        self._sessions_table = None
        self._messages_table = None
        self._ready = False

    # ── Initialisation ────────────────────────────────────────────────────────

    def _sync_initialize(self) -> None:
        """Blocking startup — runs in a thread pool from initialize()."""
        import boto3

        if not settings.AWS_ACCESS_KEY_ID or not settings.AWS_SECRET_ACCESS_KEY:
            logger.warning(
                "AWS credentials not set — DynamoDB chat storage disabled. "
                "Set AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION in .env"
            )
            return

        kwargs: Dict[str, Any] = {"region_name": settings.AWS_REGION}
        if settings.AWS_ACCESS_KEY_ID:
            kwargs["aws_access_key_id"] = settings.AWS_ACCESS_KEY_ID
        if settings.AWS_SECRET_ACCESS_KEY:
            kwargs["aws_secret_access_key"] = settings.AWS_SECRET_ACCESS_KEY

        self._dynamodb = boto3.resource("dynamodb", **kwargs)
        client = self._dynamodb.meta.client

        existing = {t for t in client.list_tables().get("TableNames", [])}

        if SESSIONS_TABLE not in existing:
            client.create_table(
                TableName=SESSIONS_TABLE,
                KeySchema=[
                    {"AttributeName": "user_id",    "KeyType": "HASH"},
                    {"AttributeName": "session_id", "KeyType": "RANGE"},
                ],
                AttributeDefinitions=[
                    {"AttributeName": "user_id",    "AttributeType": "S"},
                    {"AttributeName": "session_id", "AttributeType": "S"},
                ],
                BillingMode="PAY_PER_REQUEST",
            )
            client.get_waiter("table_exists").wait(TableName=SESSIONS_TABLE)
            logger.info("Created DynamoDB table: %s", SESSIONS_TABLE)

        if MESSAGES_TABLE not in existing:
            client.create_table(
                TableName=MESSAGES_TABLE,
                KeySchema=[
                    {"AttributeName": "session_id", "KeyType": "HASH"},
                    {"AttributeName": "created_at", "KeyType": "RANGE"},
                ],
                AttributeDefinitions=[
                    {"AttributeName": "session_id", "AttributeType": "S"},
                    {"AttributeName": "created_at", "AttributeType": "S"},
                ],
                BillingMode="PAY_PER_REQUEST",
            )
            client.get_waiter("table_exists").wait(TableName=MESSAGES_TABLE)
            logger.info("Created DynamoDB table: %s", MESSAGES_TABLE)

        self._sessions_table = self._dynamodb.Table(SESSIONS_TABLE)
        self._messages_table = self._dynamodb.Table(MESSAGES_TABLE)
        self._ready = True
        logger.info("DynamoDB chat store ready (%s, %s)", SESSIONS_TABLE, MESSAGES_TABLE)

    async def initialize(self) -> None:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self._sync_initialize)

    async def _run(self, func, *args, **kwargs):
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, partial(func, *args, **kwargs))

    # ── Sessions ──────────────────────────────────────────────────────────────

    def _sync_get_or_create_session(self, user_id: int, session_id: str) -> Dict:
        resp = self._sessions_table.get_item(
            Key={"user_id": str(user_id), "session_id": session_id}
        )
        if "Item" in resp:
            return _deserialize(resp["Item"])
        now = _now()
        item: Dict = {
            "user_id":       str(user_id),
            "session_id":    session_id,
            "title":         "New Chat",
            "created_at":    now,
            "last_active":   now,
            "message_count": 0,
        }
        self._sessions_table.put_item(Item=item)
        return item

    async def get_or_create_session(self, user_id: int, session_id: str) -> Dict:
        if not self._ready:
            return {}
        return await self._run(self._sync_get_or_create_session, user_id, session_id)

    def _sync_update_session(
        self, user_id: int, session_id: str,
        title: Optional[str], delta: int,
    ) -> None:
        now = _now()
        expr = "SET last_active = :now, message_count = message_count + :d"
        vals: Dict[str, Any] = {":now": now, ":d": delta}
        names: Optional[Dict] = None
        if title:
            expr += ", #t = :t"
            vals[":t"] = title
            names = {"#t": "title"}
        kw: Dict[str, Any] = dict(
            Key={"user_id": str(user_id), "session_id": session_id},
            UpdateExpression=expr,
            ExpressionAttributeValues=vals,
        )
        if names:
            kw["ExpressionAttributeNames"] = names
        self._sessions_table.update_item(**kw)

    async def update_session(
        self, user_id: int, session_id: str,
        title: Optional[str] = None, delta: int = 2,
    ) -> None:
        if not self._ready:
            return
        await self._run(self._sync_update_session, user_id, session_id, title, delta)

    def _sync_list_sessions(self, user_id: int) -> List[Dict]:
        from boto3.dynamodb.conditions import Key
        resp = self._sessions_table.query(
            KeyConditionExpression=Key("user_id").eq(str(user_id))
        )
        items = [_deserialize(i) for i in resp.get("Items", [])]
        items.sort(key=lambda x: x.get("last_active", ""), reverse=True)
        return items

    async def list_sessions(self, user_id: int) -> List[Dict]:
        if not self._ready:
            return []
        return await self._run(self._sync_list_sessions, user_id)

    def _sync_delete_session(self, user_id: int, session_id: str) -> None:
        from boto3.dynamodb.conditions import Key
        self._sessions_table.delete_item(
            Key={"user_id": str(user_id), "session_id": session_id}
        )
        last_key = None
        with self._messages_table.batch_writer() as batch:
            while True:
                kw: Dict[str, Any] = {
                    "KeyConditionExpression": Key("session_id").eq(session_id)
                }
                if last_key:
                    kw["ExclusiveStartKey"] = last_key
                r = self._messages_table.query(**kw)
                for item in r.get("Items", []):
                    batch.delete_item(
                        Key={
                            "session_id": item["session_id"],
                            "created_at": item["created_at"],
                        }
                    )
                last_key = r.get("LastEvaluatedKey")
                if not last_key:
                    break

    async def delete_session(self, user_id: int, session_id: str) -> None:
        if not self._ready:
            return
        await self._run(self._sync_delete_session, user_id, session_id)

    # ── Messages ──────────────────────────────────────────────────────────────

    def _sync_save_message(
        self, session_id: str, role: str, content: str,
        agent_used: Optional[str], metadata: Optional[Dict],
    ) -> Dict:
        now = _now()
        item: Dict[str, Any] = {
            "session_id": session_id,
            "created_at": now,
            "message_id": str(uuid.uuid4()),
            "role":       role,
            "content":    content,
        }
        if agent_used:
            item["agent_used"] = agent_used
        if metadata:
            item["metadata"] = _serialize(metadata)
        self._messages_table.put_item(Item=_serialize(item))
        return item

    async def save_message(
        self, session_id: str, role: str, content: str,
        agent_used: Optional[str] = None,
        metadata: Optional[Dict] = None,
    ) -> Dict:
        if not self._ready:
            return {}
        return await self._run(
            self._sync_save_message, session_id, role, content, agent_used, metadata
        )

    def _sync_get_messages(self, session_id: str, limit: int) -> List[Dict]:
        from boto3.dynamodb.conditions import Key
        resp = self._messages_table.query(
            KeyConditionExpression=Key("session_id").eq(session_id),
            ScanIndexForward=True,
            Limit=limit,
        )
        return [_deserialize(i) for i in resp.get("Items", [])]

    async def get_messages(self, session_id: str, limit: int = 100) -> List[Dict]:
        if not self._ready:
            return []
        return await self._run(self._sync_get_messages, session_id, limit)


dynamo_chat = DynamoChatDB()
