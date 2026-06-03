import time
import logging
from fastapi import Request
from app.core.context import request_ip, request_user_agent, request_user_id

logger = logging.getLogger("riverblue")

async def logging_middleware(request: Request, call_next):
    # Set context variables for audit logging
    ip_token = request_ip.set(request.client.host if request.client else None)
    ua_token = request_user_agent.set(request.headers.get("user-agent"))
    user_token = request_user_id.set(None)

    try:
        start = time.time()
        response = await call_next(request)
        duration = round((time.time() - start) * 1000, 2)
        logger.info(f"{request.method} {request.url.path} → {response.status_code} ({duration}ms)")
        return response
    finally:
        request_ip.reset(ip_token)
        request_user_agent.reset(ua_token)
        request_user_id.reset(user_token)
