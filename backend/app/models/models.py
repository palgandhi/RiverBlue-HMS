import uuid
import enum
from datetime import datetime, date
from typing import Optional, List
from sqlalchemy import (
    String, Integer, Boolean, Text, DateTime, Date,
    ForeignKey, Enum as SAEnum, JSON, func
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class UserRole(str, enum.Enum):
    admin = "admin"
    receptionist = "receptionist"
    housekeeping = "housekeeping"
    fb_staff = "fb_staff"


class RoomStatus(str, enum.Enum):
    available = "available"
    occupied = "occupied"
    maintenance = "maintenance"
    cleaning = "cleaning"
    out_of_order = "out_of_order"


class BookingStatus(str, enum.Enum):
    confirmed = "confirmed"
    checked_in = "checked_in"
    checked_out = "checked_out"
    cancelled = "cancelled"
    no_show = "no_show"


class BookingSource(str, enum.Enum):
    direct = "direct"
    walk_in = "walk_in"
    makemytrip = "makemytrip"
    ixigo = "ixigo"
    booking_com = "booking_com"
    expedia = "expedia"
    phone = "phone"
    other = "other"


class InvoiceStatus(str, enum.Enum):
    draft = "draft"
    issued = "issued"
    paid = "paid"
    partially_paid = "partially_paid"
    void = "void"


class PaymentMethod(str, enum.Enum):
    cash = "cash"
    card = "card"
    upi = "upi"
    bank_transfer = "bank_transfer"
    ota_prepaid = "ota_prepaid"


class PaymentStatus(str, enum.Enum):
    pending = "pending"
    completed = "completed"
    failed = "failed"
    refunded = "refunded"


class HousekeepingTaskType(str, enum.Enum):
    checkout_cleaning = "checkout_cleaning"
    daily_cleaning = "daily_cleaning"
    turndown = "turndown"
    maintenance = "maintenance"
    deep_clean = "deep_clean"


class TaskStatus(str, enum.Enum):
    pending = "pending"
    in_progress = "in_progress"
    completed = "completed"
    skipped = "skipped"


class TaskPriority(str, enum.Enum):
    low = "low"
    normal = "normal"
    urgent = "urgent"


class FBOrderType(str, enum.Enum):
    room_service = "room_service"
    restaurant = "restaurant"
    minibar = "minibar"


class FBOrderStatus(str, enum.Enum):
    pending = "pending"
    preparing = "preparing"
    delivered = "delivered"
    cancelled = "cancelled"


class User(Base):
    __tablename__ = "users"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(SAEnum(UserRole), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    bookings_created: Mapped[List["Booking"]] = relationship("Booking", back_populates="created_by_user", foreign_keys="Booking.created_by")
    checkins_processed: Mapped[List["CheckIn"]] = relationship("CheckIn", back_populates="processed_by_user")
    housekeeping_tasks: Mapped[List["HousekeepingTask"]] = relationship("HousekeepingTask", back_populates="assigned_user")
    fb_orders: Mapped[List["FBOrder"]] = relationship("FBOrder", back_populates="taken_by_user")


class RoomType(Base):
    __tablename__ = "room_types"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    base_price_per_night: Mapped[int] = mapped_column(Integer, nullable=False)
    max_occupancy: Mapped[int] = mapped_column(Integer, nullable=False)
    total_rooms: Mapped[int] = mapped_column(Integer, nullable=False)
    amenities: Mapped[Optional[dict]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    rooms: Mapped[List["Room"]] = relationship("Room", back_populates="room_type")


class Room(Base):
    __tablename__ = "rooms"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    room_type_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("room_types.id"), nullable=False)
    room_number: Mapped[str] = mapped_column(String(10), unique=True, nullable=False, index=True)
    floor: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[RoomStatus] = mapped_column(SAEnum(RoomStatus), default=RoomStatus.available)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    room_type: Mapped["RoomType"] = relationship("RoomType", back_populates="rooms")
    bookings: Mapped[List["Booking"]] = relationship("Booking", back_populates="room")
    housekeeping_tasks: Mapped[List["HousekeepingTask"]] = relationship("HousekeepingTask", back_populates="room")


class Guest(Base):
    __tablename__ = "guests"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[Optional[str]] = mapped_column(String(255), index=True)
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    id_type: Mapped[Optional[str]] = mapped_column(String(50))
    id_number: Mapped[Optional[str]] = mapped_column(String(100))
    nationality: Mapped[Optional[str]] = mapped_column(String(100))
    address: Mapped[Optional[str]] = mapped_column(Text)
    total_stays: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    bookings: Mapped[List["Booking"]] = relationship("Booking", back_populates="guest")


class Booking(Base):
    __tablename__ = "bookings"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    guest_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("guests.id"), nullable=False)
    room_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("rooms.id"), nullable=False)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    booking_ref: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)
    check_in_date: Mapped[date] = mapped_column(Date, nullable=False)
    check_out_date: Mapped[date] = mapped_column(Date, nullable=False)
    num_adults: Mapped[int] = mapped_column(Integer, default=1)
    num_children: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[BookingStatus] = mapped_column(SAEnum(BookingStatus), default=BookingStatus.confirmed)
    source: Mapped[BookingSource] = mapped_column(SAEnum(BookingSource), default=BookingSource.direct)
    ota_booking_id: Mapped[Optional[str]] = mapped_column(String(100))
    ota_channel: Mapped[Optional[str]] = mapped_column(String(50))
    total_amount: Mapped[int] = mapped_column(Integer, nullable=False)
    amount_paid: Mapped[int] = mapped_column(Integer, default=0)
    special_requests: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    guest: Mapped["Guest"] = relationship("Guest", back_populates="bookings")
    room: Mapped["Room"] = relationship("Room", back_populates="bookings")
    created_by_user: Mapped["User"] = relationship("User", back_populates="bookings_created", foreign_keys=[created_by])
    checkin: Mapped[Optional["CheckIn"]] = relationship("CheckIn", back_populates="booking", uselist=False)
    invoices: Mapped[List["Invoice"]] = relationship("Invoice", back_populates="booking")
    fb_orders: Mapped[List["FBOrder"]] = relationship("FBOrder", back_populates="booking")


class CheckIn(Base):
    __tablename__ = "checkins"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    booking_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("bookings.id"), unique=True, nullable=False)
    processed_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    checkin_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    checkout_time: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    key_card_number: Mapped[Optional[str]] = mapped_column(String(50))
    remarks: Mapped[Optional[str]] = mapped_column(Text)
    booking: Mapped["Booking"] = relationship("Booking", back_populates="checkin")
    processed_by_user: Mapped["User"] = relationship("User", back_populates="checkins_processed")


class Invoice(Base):
    __tablename__ = "invoices"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    booking_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("bookings.id"), nullable=False)
    invoice_number: Mapped[str] = mapped_column(String(30), unique=True, nullable=False, index=True)
    subtotal: Mapped[int] = mapped_column(Integer, nullable=False)
    tax_amount: Mapped[int] = mapped_column(Integer, default=0)
    discount_amount: Mapped[int] = mapped_column(Integer, default=0)
    total_amount: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[InvoiceStatus] = mapped_column(SAEnum(InvoiceStatus), default=InvoiceStatus.draft)
    issued_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    booking: Mapped["Booking"] = relationship("Booking", back_populates="invoices")
    items: Mapped[List["InvoiceItem"]] = relationship("InvoiceItem", back_populates="invoice", cascade="all, delete-orphan")
    payments: Mapped[List["Payment"]] = relationship("Payment", back_populates="invoice")


class InvoiceItem(Base):
    __tablename__ = "invoice_items"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    invoice_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("invoices.id"), nullable=False)
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    item_type: Mapped[str] = mapped_column(String(50), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    unit_price: Mapped[int] = mapped_column(Integer, nullable=False)
    total_price: Mapped[int] = mapped_column(Integer, nullable=False)
    invoice: Mapped["Invoice"] = relationship("Invoice", back_populates="items")


class Payment(Base):
    __tablename__ = "payments"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    invoice_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("invoices.id"), nullable=False)
    processed_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    method: Mapped[PaymentMethod] = mapped_column(SAEnum(PaymentMethod), nullable=False)
    transaction_ref: Mapped[Optional[str]] = mapped_column(String(100))
    status: Mapped[PaymentStatus] = mapped_column(SAEnum(PaymentStatus), default=PaymentStatus.completed)
    paid_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    invoice: Mapped["Invoice"] = relationship("Invoice", back_populates="payments")
    processed_by_user: Mapped["User"] = relationship("User")


class HousekeepingTask(Base):
    __tablename__ = "housekeeping_tasks"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    room_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("rooms.id"), nullable=False)
    assigned_to: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("users.id"))
    task_type: Mapped[HousekeepingTaskType] = mapped_column(SAEnum(HousekeepingTaskType), nullable=False)
    priority: Mapped[TaskPriority] = mapped_column(SAEnum(TaskPriority), default=TaskPriority.normal)
    status: Mapped[TaskStatus] = mapped_column(SAEnum(TaskStatus), default=TaskStatus.pending)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    scheduled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    room: Mapped["Room"] = relationship("Room", back_populates="housekeeping_tasks")
    assigned_user: Mapped[Optional["User"]] = relationship("User", back_populates="housekeeping_tasks")


class FBOrder(Base):
    __tablename__ = "fb_orders"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    booking_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("bookings.id"), nullable=False)
    taken_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    order_type: Mapped[FBOrderType] = mapped_column(SAEnum(FBOrderType), nullable=False)
    status: Mapped[FBOrderStatus] = mapped_column(SAEnum(FBOrderStatus), default=FBOrderStatus.pending)
    total_amount: Mapped[int] = mapped_column(Integer, default=0)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    ordered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    booking: Mapped["Booking"] = relationship("Booking", back_populates="fb_orders")
    taken_by_user: Mapped["User"] = relationship("User", back_populates="fb_orders")
    items: Mapped[List["FBOrderItem"]] = relationship("FBOrderItem", back_populates="order", cascade="all, delete-orphan")


class FBOrderItem(Base):
    __tablename__ = "fb_order_items"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("fb_orders.id"), nullable=False)
    item_name: Mapped[str] = mapped_column(String(255), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    unit_price: Mapped[int] = mapped_column(Integer, nullable=False)
    total_price: Mapped[int] = mapped_column(Integer, nullable=False)
    order: Mapped["FBOrder"] = relationship("FBOrder", back_populates="items")


class OTAChannel(Base):
    __tablename__ = "ota_channels"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    api_endpoint: Mapped[Optional[str]] = mapped_column(String(500))
    api_key_encrypted: Mapped[Optional[str]] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_synced_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
