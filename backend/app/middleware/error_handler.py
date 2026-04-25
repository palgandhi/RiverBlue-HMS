import logging
import traceback
from fastapi import Request
from fastapi.responses import JSONResponse

logger = logging.getLogger("riverblue")

async def error_handler_middleware(request: Request, call_next):
    try:
        return await call_next(request)
    except Exception as e:
        logger.error(f"Unhandled error: {e}\n{traceback.format_exc()}")
        return JSONResponse(
            status_code=500,
            content={"detail": "An internal server error occurred. Please try again."}
        )
