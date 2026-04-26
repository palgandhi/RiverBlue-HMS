import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.core.config import settings
from app.middleware.logging import logging_middleware
from app.middleware.error_handler import error_handler_middleware
from app.api.v1.routes import auth, bookings, rooms, users, checkins, housekeeping, billing

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger("riverblue")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"RiverBlue HMS starting — environment: {settings.ENVIRONMENT}")
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


@app.get("/health", tags=["System"])
async def health():
    return {
        "status": "ok",
        "version": "1.0.0",
        "service": settings.PROJECT_NAME,
        "environment": settings.ENVIRONMENT,
    }
