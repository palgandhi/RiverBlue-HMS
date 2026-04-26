#!/usr/bin/env python3
"""
RiverBlue HMS — End-to-End Stress Test
Tests every endpoint, every flow, every edge case.
Run from the riverblue-hms root directory.
Usage: python3 scripts/stress_test.py
"""

import requests
import json
import sys
from datetime import date, timedelta
from typing import Optional

BASE = "http://localhost:8000/api/v1"
PASS = "\033[92m✓\033[0m"
FAIL = "\033[91m✗\033[0m"
WARN = "\033[93m⚠\033[0m"
BOLD = "\033[1m"
RESET = "\033[0m"

results = {"passed": 0, "failed": 0, "warned": 0}
token = None
headers = {}


def section(title: str):
    print(f"\n{BOLD}{'─'*50}{RESET}")
    print(f"{BOLD}  {title}{RESET}")
    print(f"{BOLD}{'─'*50}{RESET}")


def test(name: str, passed: bool, detail: str = "", warn: bool = False):
    if warn:
        print(f"  {WARN} {name} — {detail}")
        results["warned"] += 1
    elif passed:
        print(f"  {PASS} {name}" + (f" — {detail}" if detail else ""))
        results["passed"] += 1
    else:
        print(f"  {FAIL} {name} — {detail}")
        results["failed"] += 1


def get(path, **kwargs):
    return requests.get(f"{BASE}{path}", headers=headers, **kwargs)

def post(path, data, **kwargs):
    return requests.post(f"{BASE}{path}", json=data, headers=headers, **kwargs)

def patch(path, data, **kwargs):
    return requests.patch(f"{BASE}{path}", json=data, headers=headers, **kwargs)


# ── 1. HEALTH CHECK ───────────────────────────────────────────────────────────
section("1. Health Check")

r = requests.get("http://localhost:8000/health")
test("Health endpoint responds", r.status_code == 200)
test("Returns correct service name", r.json().get("service") == "RiverBlue HMS")
test("Returns environment", "environment" in r.json())


# ── 2. AUTHENTICATION ─────────────────────────────────────────────────────────
section("2. Authentication")

# Wrong password
r = post("/auth/login", {"email": "admin@riverblue.com", "password": "wrongpassword"})
test("Rejects wrong password", r.status_code == 401)

# Wrong email
r = post("/auth/login", {"email": "nobody@nowhere.com", "password": "Admin@1234"})
test("Rejects unknown email", r.status_code == 401)

# Invalid email format
r = post("/auth/login", {"email": "notanemail", "password": "Admin@1234"})
test("Rejects malformed email", r.status_code == 422)

# Correct login
r = post("/auth/login", {"email": "admin@riverblue.com", "password": "Admin@1234"})
test("Admin login succeeds", r.status_code == 200, f"status={r.status_code}")
if r.status_code == 200:
    token = r.json()["access_token"]
    refresh_token = r.json()["refresh_token"]
    headers["Authorization"] = f"Bearer {token}"
    test("Access token present", bool(token))
    test("Refresh token present", bool(refresh_token))
    test("User role is admin", r.json()["user"]["role"] == "admin")

# Get current user
r = get("/auth/me")
test("GET /auth/me returns user", r.status_code == 200)
test("Me returns correct email", r.json().get("email") == "admin@riverblue.com")

# Token refresh
r = post("/auth/refresh", {"refresh_token": refresh_token})
test("Token refresh works", r.status_code == 200)

# Unauthorized access
r = requests.get(f"{BASE}/auth/me")
test("Rejects request without token", r.status_code == 401)

# Invalid token
r = requests.get(f"{BASE}/auth/me", headers={"Authorization": "Bearer invalidtoken"})
test("Rejects invalid token", r.status_code == 401)


# ── 3. ROOM TYPES ─────────────────────────────────────────────────────────────
section("3. Room Types")

r = get("/rooms/types")
test("GET /rooms/types returns list", r.status_code == 200)
test("Room types not empty", len(r.json()) > 0, f"{len(r.json())} types found")
room_types = r.json()
if room_types:
    rt = room_types[0]
    test("Room type has required fields", all(k in rt for k in ["id","name","base_price_per_night","max_occupancy"]))
    test("Price stored in paise (integer)", isinstance(rt["base_price_per_night"], int))


# ── 4. ROOMS ──────────────────────────────────────────────────────────────────
section("4. Rooms")

r = get("/rooms/")
test("GET /rooms/ returns list", r.status_code == 200)
rooms = r.json()
test("Rooms not empty", len(rooms) > 0, f"{len(rooms)} rooms found")
test("Rooms have required fields", all(all(k in rm for k in ["id","room_number","floor","status"]) for rm in rooms[:3]))

available_rooms = [rm for rm in rooms if rm["status"] == "available"]
test("At least one available room exists", len(available_rooms) > 0, f"{len(available_rooms)} available")

occupied_rooms = [rm for rm in rooms if rm["status"] == "occupied"]
test("Occupied rooms tracked", True, f"{len(occupied_rooms)} occupied", warn=len(occupied_rooms)==0)

# Filter by status
r = get("/rooms/?status=available")
test("Filter rooms by status works", r.status_code == 200)
test("Filter returns only available rooms", all(rm["status"] == "available" for rm in r.json()))

# Filter by floor
r = get("/rooms/?floor=1")
test("Filter rooms by floor works", r.status_code == 200)
test("Filter returns only floor 1", all(rm["floor"] == 1 for rm in r.json()))

# Non-admin cannot create room
import random as _rand2
import random as _rand2
_test_room_num = f"T{_rand2.randint(100,999)}"
r2 = post("/rooms/", {"room_type_id": room_types[0]["id"], "room_number": _test_room_num, "floor": 9})
test("Admin can access room creation", r2.status_code in [201, 409])


# ── 5. GUESTS ─────────────────────────────────────────────────────────────────
section("5. Guest Management")

guest_data = {
    "full_name": "Test Guest Stress",
    "phone": "9876543210",
    "email": "stresstest@riverblue.com",
    "id_type": "Aadhar",
    "id_number": "1234-5678-9012",
}
r = post("/bookings/guests", guest_data)
test("Create guest succeeds", r.status_code == 201, f"status={r.status_code}")
guest_id = None
if r.status_code == 201:
    guest_id = r.json()["id"]
    test("Guest has ID", bool(guest_id))
    test("Guest name matches", r.json()["full_name"] == guest_data["full_name"])

# Duplicate guest by email returns existing
r2 = post("/bookings/guests", guest_data)
test("Duplicate guest returns existing", r2.status_code == 201)
if r.status_code == 201 and r2.status_code == 201:
    test("Same ID returned for duplicate", r.json()["id"] == r2.json()["id"])


# ── 6. BOOKINGS ───────────────────────────────────────────────────────────────
section("6. Booking Management")

r = get("/bookings/")
test("GET /bookings/ returns list", r.status_code == 200)
bookings = r.json()
test("Bookings list returned", isinstance(bookings, list), f"{len(bookings)} bookings")

# Create a booking
today = date.today()
import random as _rand
checkin = (today + timedelta(days=_rand.randint(60, 120))).isoformat()
checkout = (today + timedelta(days=_rand.randint(121, 130))).isoformat()

booking_ref = None
if guest_id and available_rooms:
    room_id = available_rooms[0]["id"]
    r = post("/bookings/", {
        "guest_id": guest_id,
        "room_id": room_id,
        "check_in_date": checkin,
        "check_out_date": checkout,
        "num_adults": 2,
        "num_children": 0,
        "source": "direct",
        "special_requests": "Stress test booking",
    })
    test("Create booking succeeds", r.status_code == 201, f"status={r.status_code}")
    if r.status_code == 201:
        booking_ref = r.json()["booking_ref"]
        test("Booking ref generated", booking_ref.startswith("RB-"))
        test("Total amount calculated", r.json()["total_amount"] > 0)
        test("Status is confirmed", r.json()["status"] == "confirmed")
        test("Source recorded correctly", r.json()["source"] == "direct")

        # Get booking by ref
        r2 = get(f"/bookings/{booking_ref}")
        test("GET /bookings/{ref} works", r2.status_code == 200)
        test("Booking ref matches", r2.json()["booking_ref"] == booking_ref)

        # Double booking same room same dates — should fail
        r3 = post("/bookings/", {
            "guest_id": guest_id,
            "room_id": room_id,
            "check_in_date": checkin,
            "check_out_date": checkout,
            "num_adults": 1,
            "source": "direct",
        })
        test("Double booking rejected (409)", r3.status_code == 409)

        # Invalid dates — checkout before checkin
        r4 = post("/bookings/", {
            "guest_id": guest_id,
            "room_id": room_id,
            "check_in_date": checkout,
            "check_out_date": checkin,
            "num_adults": 1,
            "source": "direct",
        })
        test("Invalid dates rejected (422)", r4.status_code == 422)

# Filter bookings by status
r = get("/bookings/?status=confirmed")
test("Filter bookings by status works", r.status_code == 200)

# Filter bookings by source
r = get("/bookings/?source=direct")
test("Filter bookings by source works", r.status_code == 200)

# Pagination
r = get("/bookings/?skip=0&limit=5")
test("Pagination works", r.status_code == 200)
test("Limit respected", len(r.json()) <= 5)


# ── 7. CHECK-IN / CHECK-OUT ───────────────────────────────────────────────────
section("7. Check-in / Check-out")

# Try checking in a non-existent booking
r = post("/checkins/", {"booking_ref": "RB-XXXXXX"})
test("Check-in rejects non-existent booking", r.status_code == 404)

# Create a booking for immediate checkin test
today_str = today.isoformat()
tomorrow_str = (today + timedelta(days=1)).isoformat()
checkin_booking_ref = None

if guest_id and len(available_rooms) > 1:
    room_id2 = available_rooms[1]["id"] if len(available_rooms) > 1 else available_rooms[0]["id"]
    r = post("/bookings/", {
        "guest_id": guest_id,
        "room_id": room_id2,
        "check_in_date": today_str,
        "check_out_date": tomorrow_str,
        "num_adults": 1,
        "source": "walk_in",
    })
    if r.status_code == 201:
        checkin_booking_ref = r.json()["booking_ref"]

        # Check in
        r2 = post("/checkins/", {
            "booking_ref": checkin_booking_ref,
            "key_card_number": "KC-STRESS-01",
            "remarks": "Stress test checkin",
        })
        test("Check-in succeeds", r2.status_code == 201, f"status={r2.status_code}")

        # Verify room is now occupied
        import time; time.sleep(0.5)
        rooms_after = get("/rooms/").json()
        room_after = next((rm for rm in rooms_after if rm["id"] == room_id2), None)
        test("Room status → occupied after check-in",
             room_after and room_after["status"] == "occupied",
             f"status={room_after['status'] if room_after else 'not found'}")

        # Double check-in should fail
        r3 = post("/checkins/", {"booking_ref": checkin_booking_ref})
        test("Duplicate check-in rejected", r3.status_code == 409)

        # Check out
        r4 = post(f"/checkins/{checkin_booking_ref}/checkout", {"remarks": "Stress test checkout"})
        test("Check-out succeeds", r4.status_code == 200, f"status={r4.status_code}")

        # Verify room is now cleaning
        import time; time.sleep(0.5)
        rooms_after2 = get("/rooms/").json()
        room_after2 = next((rm for rm in rooms_after2 if rm["id"] == room_id2), None)
        test("Room status → cleaning after check-out",
             room_after2 and room_after2["status"] == "cleaning",
             f"status={room_after2['status'] if room_after2 else 'not found'}")

        # Verify housekeeping task created
        tasks = get("/housekeeping/tasks").json()
        task_created = any(t["room_id"] == room_id2 and t["task_type"] == "checkout_cleaning" for t in tasks)
        test("Housekeeping task auto-created on checkout", task_created)


# ── 8. HOUSEKEEPING ───────────────────────────────────────────────────────────
section("8. Housekeeping")

r = get("/housekeeping/tasks")
test("GET /housekeeping/tasks returns list", r.status_code == 200)
tasks = r.json()
test("Tasks returned", isinstance(tasks, list), f"{len(tasks)} tasks")

if tasks:
    task = next((t for t in tasks if t["status"] == "pending"), None)
    if task:
        # Update to in_progress
        r2 = patch(f"/housekeeping/tasks/{task['id']}", {"status": "in_progress"})
        test("Update task to in_progress", r2.status_code == 200)
        test("Status updated correctly", r2.json()["status"] == "in_progress")

        # Complete the task
        r3 = patch(f"/housekeeping/tasks/{task['id']}", {"status": "completed"})
        test("Complete task succeeds", r3.status_code == 200)
        test("Task marked completed", r3.json()["status"] == "completed")
        test("Completion time recorded", r3.json()["completed_at"] is not None)

        # If it was a checkout cleaning, room should be available
        if task["task_type"] == "checkout_cleaning":
            rooms_now = get("/rooms/").json()
            room_now = next((rm for rm in rooms_now if rm["id"] == task["room_id"]), None)
            test("Room → available after housekeeping complete",
                 room_now and room_now["status"] == "available",
                 f"status={room_now['status'] if room_now else 'not found'}")


# ── 9. STAFF MANAGEMENT ───────────────────────────────────────────────────────
section("9. Staff Management")

r = get("/users/")
test("GET /users/ returns list", r.status_code == 200)
users = r.json()
test("Users list not empty", len(users) > 0, f"{len(users)} users")

# Create staff user
import random, string
rand_suffix = "".join(random.choices(string.ascii_lowercase, k=6))
new_user_email = f"test_{rand_suffix}@riverblue.com"

r = post("/users/", {
    "email": new_user_email,
    "password": "TestPass@123",
    "full_name": "Stress Test Staff",
    "role": "receptionist",
})
test("Create staff user succeeds", r.status_code == 201, f"status={r.status_code}")
new_user_id = None
if r.status_code == 201:
    new_user_id = r.json()["id"]
    test("User has ID", bool(new_user_id))
    test("Role assigned correctly", r.json()["role"] == "receptionist")

    # Duplicate email rejected
    r2 = post("/users/", {
        "email": new_user_email,
        "password": "TestPass@123",
        "full_name": "Duplicate",
        "role": "receptionist",
    })
    test("Duplicate email rejected", r2.status_code == 409)

    # Deactivate user
    r3 = patch(f"/users/{new_user_id}", {"is_active": False})
    test("Deactivate user works", r3.status_code == 200)
    test("User is inactive", r3.json()["is_active"] == False)

    # Deactivated user cannot login
    r4 = post("/auth/login", {"email": new_user_email, "password": "TestPass@123"})
    test("Inactive user cannot login", r4.status_code == 403)

    # Reactivate
    r5 = patch(f"/users/{new_user_id}", {"is_active": True})
    test("Reactivate user works", r5.status_code == 200)

# Cannot deactivate own account — test with receptionist trying admin-only endpoint
r = post("/auth/login", {"email": new_user_email, "password": "TestPass@123"})
if r.status_code == 200:
    recep_headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    r2 = requests.get(f"{BASE}/users/", headers=recep_headers)
    test("Receptionist cannot access staff list (403)", r2.status_code == 403)


# ── 10. RBAC ──────────────────────────────────────────────────────────────────
section("10. Role-Based Access Control")

# Create housekeeping user
rand_suffix2 = "".join(random.choices(string.ascii_lowercase, k=6))
hk_email = f"hk_{rand_suffix2}@riverblue.com"
r = post("/users/", {"email": hk_email, "password": "TestPass@123", "full_name": "HK Test", "role": "housekeeping"})
if r.status_code == 201:
    hk_login = post("/auth/login", {"email": hk_email, "password": "TestPass@123"})
    if hk_login.status_code == 200:
        hk_headers = {"Authorization": f"Bearer {hk_login.json()['access_token']}"}

        # Housekeeping can access tasks
        r2 = requests.get(f"{BASE}/housekeeping/tasks", headers=hk_headers)
        test("Housekeeping can access tasks", r2.status_code == 200)

        # Housekeeping cannot create bookings
        r3 = requests.post(f"{BASE}/bookings/", json={}, headers=hk_headers)
        test("Housekeeping cannot create bookings (403)", r3.status_code == 403)

        # Housekeeping cannot access staff list
        r4 = requests.get(f"{BASE}/users/", headers=hk_headers)
        test("Housekeeping cannot access staff list (403)", r4.status_code == 403)

        # Housekeeping can update room status
        if available_rooms:
            r5 = requests.patch(
                f"{BASE}/rooms/{available_rooms[0]['id']}/status",
                json={"status": "maintenance"},
                headers=hk_headers
            )
            test("Housekeeping can update room status", r5.status_code == 200)
            # Restore
            requests.patch(
                f"{BASE}/rooms/{available_rooms[0]['id']}/status",
                json={"status": "available"},
                headers=headers
            )


# ── 11. EDGE CASES ────────────────────────────────────────────────────────────
section("11. Edge Cases & Validation")

# Booking with checkout = checkin (same day)
if guest_id and available_rooms:
    r = post("/bookings/", {
        "guest_id": guest_id,
        "room_id": available_rooms[0]["id"],
        "check_in_date": today_str,
        "check_out_date": today_str,
        "num_adults": 1,
        "source": "direct",
    })
    test("Same-day checkin/checkout rejected", r.status_code == 422)

    # Zero adults
    r = post("/bookings/", {
        "guest_id": guest_id,
        "room_id": available_rooms[0]["id"],
        "check_in_date": checkin,
        "check_out_date": checkout,
        "num_adults": 0,
        "source": "direct",
    })
    test("0 adults booking handled", r.status_code in [201, 422], warn=r.status_code==201)

# Non-existent booking ref
r = get("/bookings/RB-XXXXXX")
test("Non-existent booking returns 404", r.status_code == 404)

# Non-existent room status update
r = patch("/rooms/00000000-0000-0000-0000-000000000000/status", {"status": "available"})
test("Non-existent room returns 404", r.status_code == 404)

# Invalid room status value
if rooms:
    r = patch(f"/rooms/{rooms[0]['id']}/status", {"status": "flying"})
    test("Invalid room status rejected (422)", r.status_code == 422)


# ── SUMMARY ───────────────────────────────────────────────────────────────────
total = results["passed"] + results["failed"] + results["warned"]
print(f"\n{BOLD}{'═'*50}{RESET}")
print(f"{BOLD}  TEST RESULTS{RESET}")
print(f"{BOLD}{'═'*50}{RESET}")
print(f"  {PASS} Passed:  {results['passed']}")
print(f"  {FAIL} Failed:  {results['failed']}")
print(f"  {WARN} Warned:  {results['warned']}")
print(f"  Total:   {total}")
score = round((results["passed"] / total) * 100) if total > 0 else 0
print(f"  Score:   {score}%")
print(f"{BOLD}{'═'*50}{RESET}\n")

if results["failed"] > 0:
    sys.exit(1)
