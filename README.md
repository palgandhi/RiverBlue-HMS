# RiverBlue HMS

Hotel Management System — mid-size hotels (50–200 rooms).

## Stack
| Layer | Technology |
|-------|-----------|
| Backend | FastAPI + Python 3.11 |
| ORM | SQLAlchemy 2.0 + asyncpg |
| Migrations | Alembic |
| Database | PostgreSQL 15 |
| Frontend | Next.js 14 + TypeScript |
| Styling | Tailwind CSS |
| Auth | JWT + NextAuth.js |
| Infra | Docker + Docker Compose |
| CI/CD | GitHub Actions |

## Quick Start
```bash
cp .env.example .env        # fill in secrets
docker compose up --build
docker compose exec backend alembic upgrade head
docker compose exec backend python scripts/seed.py
```

- API: http://localhost:8000
- Docs: http://localhost:8000/docs
- Frontend: http://localhost:3000
