import random
import string
from datetime import date


def generate_ref(prefix: str = "RB", length: int = 6) -> str:
    suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=length))
    return f"{prefix}-{suffix}"


def generate_invoice_number(sequence: int) -> str:
    from datetime import datetime
    year = datetime.now().year
    return f"RB-INV-{year}-{sequence:05d}"


def nights_between(check_in: date, check_out: date) -> int:
    return max(0, (check_out - check_in).days)


def paise_to_rupees(paise: int) -> float:
    return round(paise / 100, 2)


def rupees_to_paise(rupees: float) -> int:
    return int(round(rupees * 100))


def calculate_gst(amount_paise: int, rate_per_night_paise: int) -> dict:
    """
    GST rates per Indian tax law:
    - Below Rs 7500/night: 12% GST (6% CGST + 6% SGST)
    - Rs 7500 and above: 18% GST (9% CGST + 9% SGST)
    Returns dict with gst_rate, cgst, sgst, total_tax all in paise.
    """
    rate_rupees = rate_per_night_paise / 100
    if rate_rupees < 7500:
        gst_rate = 0.12
        cgst_rate = 0.06
        sgst_rate = 0.06
    else:
        gst_rate = 0.18
        cgst_rate = 0.09
        sgst_rate = 0.09

    total_tax = int(round(amount_paise * gst_rate))
    cgst = int(round(amount_paise * cgst_rate))
    sgst = total_tax - cgst

    return {
        "gst_rate": gst_rate,
        "cgst_rate": cgst_rate,
        "sgst_rate": sgst_rate,
        "cgst": cgst,
        "sgst": sgst,
        "total_tax": total_tax,
        "total_with_tax": amount_paise + total_tax,
    }
