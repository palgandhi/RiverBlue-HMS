import contextvars
from typing import Optional
import uuid

# Context variables to hold request-level context for audit logging
request_user_id: contextvars.ContextVar[Optional[uuid.UUID]] = contextvars.ContextVar("request_user_id", default=None)
request_ip: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar("request_ip", default=None)
request_user_agent: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar("request_user_agent", default=None)
