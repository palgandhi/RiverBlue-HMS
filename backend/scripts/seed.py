import asyncio, sys, os, uuid
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.core.database import AsyncSessionLocal
from app.models.models import User, UserRole, RoomType, Room, RoomStatus
from app.core.security import hash_password
from sqlalchemy import select, func

ADMIN_EMAIL = "admin@riverblue.com"
ADMIN_PASSWORD = "Admin@1234"


async def seed():
    async with AsyncSessionLocal() as db:
        # Admin
        r = await db.execute(select(User).where(User.email == ADMIN_EMAIL))
        if not r.scalar_one_or_none():
            db.add(User(email=ADMIN_EMAIL, hashed_password=hash_password(ADMIN_PASSWORD), full_name="Hotel Admin", role=UserRole.admin))
            print(f"[+] Admin created: {ADMIN_EMAIL} / {ADMIN_PASSWORD}")

        # System user for OTA webhooks
        r = await db.execute(select(User).where(User.email == "system@riverblue.com"))
        if not r.scalar_one_or_none():
            db.add(User(email="system@riverblue.com", hashed_password=hash_password(str(uuid.uuid4())), full_name="System", role=UserRole.admin))
            print("[+] System user created")

        # Room types
        for t in [
            {"name": "Standard Single", "base_price_per_night": 300000, "max_occupancy": 1, "total_rooms": 20},
            {"name": "Standard Double", "base_price_per_night": 450000, "max_occupancy": 2, "total_rooms": 40},
            {"name": "Deluxe Double",   "base_price_per_night": 650000, "max_occupancy": 2, "total_rooms": 30},
            {"name": "Suite",           "base_price_per_night": 1200000,"max_occupancy": 4, "total_rooms": 10},
        ]:
            r = await db.execute(select(RoomType).where(RoomType.name == t["name"]))
            if not r.scalar_one_or_none():
                db.add(RoomType(**t))
                print(f"[+] Room type: {t['name']}")

        await db.commit()

        # Rooms
        r = await db.execute(select(func.count()).select_from(Room))
        if r.scalar() == 0:
            r = await db.execute(select(RoomType))
            rt_map = {rt.name: rt.id for rt in r.scalars().all()}
            for floor in range(1, 6):
                for num in range(1, 11):
                    rtype = "Standard Single" if num <= 4 else "Standard Double" if num <= 8 else "Deluxe Double"
                    db.add(Room(room_type_id=rt_map[rtype], room_number=f"{floor}{num:02d}", floor=floor, status=RoomStatus.available))
            await db.commit()
            print("[+] 50 sample rooms created")

    print(f"\n✓ Seed complete. Login: {ADMIN_EMAIL} / {ADMIN_PASSWORD}")
    print("  IMPORTANT: Change the password after first login.\n")


if __name__ == "__main__":
    asyncio.run(seed())
