export type UserRole = "admin" | "receptionist" | "housekeeping" | "fb_staff";

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export interface Room {
  id: string;
  room_number: string;
  floor: number;
  status: RoomStatus;
  notes: string | null;
  room_type_id: string;
}

export interface RoomType {
  id: string;
  name: string;
  base_price_per_night: number;
  max_occupancy: number;
  total_rooms: number;
  amenities: Record<string, unknown> | null;
}

export type RoomStatus = "available" | "occupied" | "maintenance" | "cleaning" | "out_of_order";

export type BookingStatus = "confirmed" | "checked_in" | "checked_out" | "cancelled" | "no_show";

export type BookingSource = "direct" | "walk_in" | "makemytrip" | "ixigo" | "booking_com" | "expedia" | "phone" | "other";

export interface Guest {
  id: string;
  full_name: string;
  email: string | null;
  phone: string;
  id_type: string | null;
  nationality: string | null;
  total_stays: number;
  created_at: string;
}

export interface Booking {
  id: string;
  booking_ref: string;
  guest_id: string;
  room_id: string;
  check_in_date: string;
  check_out_date: string;
  num_adults: number;
  num_children: number;
  status: BookingStatus;
  source: BookingSource;
  ota_booking_id: string | null;
  total_amount: number;
  amount_paid: number;
  special_requests: string | null;
  created_at: string;
}

export interface AuthStore {
  user: User | null;
  token: string | null;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
}
