from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, Any
import uuid
import logging
from app.models.models import AuditLog
from app.core.context import request_user_id, request_ip, request_user_agent

logger = logging.getLogger("riverblue")

async def log_action(
    db: AsyncSession,
    action: str,
    entity_type: str,
    entity_id: Optional[str] = None,
    old_value: Optional[dict[str, Any]] = None,
    new_value: Optional[dict[str, Any]] = None,
    user_id: Optional[uuid.UUID] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> AuditLog:
    """Logs a security or system action into the audit_logs table, automatically pulling client metadata from the request context if not explicitly provided."""
    try:
        log = AuditLog(
            user_id=user_id or request_user_id.get(),
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            old_value=old_value,
            new_value=new_value,
            ip_address=ip_address or request_ip.get(),
            user_agent=user_agent or request_user_agent.get()
        )
        db.add(log)
        await db.flush()
        return log
    except Exception as e:
        logger.error(f"Failed to write audit log: {e}")
        raise
