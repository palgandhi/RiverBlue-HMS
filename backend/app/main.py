import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.core.config import settings
from app.middleware.logging import logging_middleware
from app.middleware.error_handler import error_handler_middleware
from app.api.v1.routes import auth, bookings, rooms, users, checkins, housekeeping, billing, invoice, night_audit, ota
from app.api.v1.routes import settings as settings_router

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger("riverblue")


async def scheduled_night_audit():
    """Runs the night audit every day at 23:59."""
    import asyncio
    from datetime import datetime, time
    while True:
        now = datetime.now()
        # Calculate seconds until 23:59:00
        target = now.replace(hour=23, minute=59, second=0, microsecond=0)
        if now >= target:
            target = target.replace(day=target.day + 1)
        wait_seconds = (target - now).total_seconds()
        logger.info(f"Night audit scheduled in {wait_seconds/3600:.1f} hours")
        await asyncio.sleep(wait_seconds)
        try:
            from app.core.database import AsyncSessionLocal
            from app.services.night_audit_service import run_night_audit
            async with AsyncSessionLocal() as db:
                result = await run_night_audit(db, ran_by="scheduler")
                logger.info(f"Scheduled night audit result: {result}")
        except Exception as e:
            logger.error(f"Scheduled night audit failed: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"RiverBlue HMS starting — environment: {settings.ENVIRONMENT}")
    import asyncio
    asyncio.create_task(scheduled_night_audit())
    yield
    logger.info("RiverBlue HMS shutting down")


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    description="RiverBlue Hotel Management System API",
    docs_url="/docs" if settings.ENVIRONMENT != "production" else None,
    redoc_url="/redoc" if settings.ENVIRONMENT != "production" else None,
    lifespan=lifespan,
)

# CORS — allow frontend origins
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
if settings.ENVIRONMENT == "production":
    origins = ["https://hms.riverblue.com"]  # update with real domain

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.middleware("http")(logging_middleware)
app.middleware("http")(error_handler_middleware)

PREFIX = f"/api/{settings.API_VERSION}"

app.include_router(auth.router, prefix=PREFIX)
app.include_router(bookings.router, prefix=PREFIX)
app.include_router(rooms.router, prefix=PREFIX)
app.include_router(users.router, prefix=PREFIX)
app.include_router(checkins.router, prefix=PREFIX)
app.include_router(housekeeping.router, prefix=PREFIX)
app.include_router(billing.router, prefix=PREFIX)
app.include_router(settings_router.router, prefix=PREFIX)
app.include_router(invoice.router, prefix=PREFIX)
app.include_router(night_audit.router, prefix=PREFIX)
app.include_router(ota.router, prefix=PREFIX)


@app.get("/health", tags=["System"])
async def health():
    return {
        "status": "ok",
        "version": "1.0.0",
        "service": settings.PROJECT_NAME,
        "environment": settings.ENVIRONMENT,
    }
