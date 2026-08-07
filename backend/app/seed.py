"""Demo environment seed.

Creates three stores, versioned policy packs, buyers with real histories, and
orders positioned for the four demo scenarios:

  1. happy path      ORD-2041  under cap, clean buyer  -> fully autonomous
  2. fraud           ORD-2042  repeat claimer, AI-generated evidence
  3. injection       ORD-2043  prompt-injection attempt in the chat
  4. human approval  ORD-2044  over cap -> seller must approve
  5. watchdog        ORD-2045  shipment stalled -> dispute opens proactively
"""
from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from PIL import Image, ImageDraw
from PIL.PngImagePlugin import PngInfo

from .config import settings
from .db.models import Buyer, Order, PolicyPack, Precedent, Store
from .db.session import init_db, session_scope


def _now() -> datetime:
    return datetime.now(timezone.utc)


# --------------------------------------------------------------------------
# policy packs
# --------------------------------------------------------------------------

CLOTHING_CLAUSES_V2 = [
    {
        "id": "CL-4.1",
        "title": "Order not delivered",
        "text": "If an order is not delivered within 10 days of dispatch, or the "
                "courier marks it undelivered, lost or stuck in transit, the buyer "
                "is entitled to a full refund without returning any item.",
        "claim_types": ["not_delivered"],
        "window_days": 30,
        "outcome": "full_refund",
        "exclusions": [],
    },
    {
        "id": "CL-4.2",
        "title": "Damaged on arrival",
        "text": "Items that arrive damaged, torn or stained must be reported within "
                "7 days of delivery with photographic evidence of the damage. "
                "Verified claims receive a full refund or a free replacement at the "
                "buyer's choice. Return shipping is paid by the store.",
        "claim_types": ["damage"],
        "window_days": 7,
        "outcome": "full_refund",
        "exclusions": ["custom_made"],
    },
    {
        "id": "CL-4.3",
        "title": "Wrong item or wrong size delivered",
        "text": "If the item delivered does not match the item ordered in design, "
                "colour or size, the buyer may request a replacement in the correct "
                "variant, or a full refund if the correct variant is unavailable. "
                "Must be reported within 7 days of delivery.",
        "claim_types": ["wrong_item", "wrong_size"],
        "window_days": 7,
        "outcome": "replacement",
        "exclusions": [],
    },
    {
        "id": "CL-4.4",
        "title": "Change of mind",
        "text": "Unused items in original packaging with tags intact may be returned "
                "within 3 days of delivery for a refund of the item price. Original "
                "shipping charges are not refunded.",
        "claim_types": ["change_of_mind"],
        "window_days": 3,
        "outcome": "partial_refund",
        "exclusions": ["sale_item", "custom_made"],
    },
    {
        "id": "CL-4.5",
        "title": "Sale and custom items",
        "text": "Items purchased during a clearance sale and made-to-order or "
                "customised items are final sale. They are not eligible for return "
                "or refund for change of mind, but remain covered for damage on "
                "arrival and wrong item delivered.",
        "claim_types": ["change_of_mind"],
        "window_days": 0,
        "outcome": "reject",
        "exclusions": [],
    },
]

ELECTRONICS_CLAUSES_V2 = [
    {
        "id": "EL-2.1",
        "title": "Damaged on arrival",
        "text": "Electronics that arrive physically damaged must be reported within "
                "7 days of delivery with photographic evidence showing the damage and "
                "the device serial number. Verified claims receive a full refund or "
                "replacement.",
        "claim_types": ["damage"],
        "window_days": 7,
        "outcome": "full_refund",
        "exclusions": [],
    },
    {
        "id": "EL-2.2",
        "title": "Functional defect",
        "text": "Devices that power on but do not function as described may be "
                "claimed within 10 days of delivery. The buyer must first complete "
                "guided troubleshooting. If the fault persists and is confirmed by "
                "screen recording or a diagnostic report, a replacement is issued.",
        "claim_types": ["functional_defect"],
        "window_days": 10,
        "outcome": "replacement",
        "exclusions": [],
    },
    {
        "id": "EL-2.3",
        "title": "Manufacturer warranty",
        "text": "Faults reported after 10 days and within 6 months of delivery are "
                "handled under manufacturer warranty through an authorised service "
                "centre. A pickup or service appointment is arranged; refunds are not "
                "issued directly under this clause.",
        "claim_types": ["functional_defect", "warranty"],
        "window_days": 180,
        "outcome": "escalate",
        "exclusions": [],
    },
    {
        "id": "EL-2.4",
        "title": "Order not delivered",
        "text": "If a shipment is not delivered within 10 days of dispatch or is "
                "marked lost or stuck by the courier, a full refund is issued.",
        "claim_types": ["not_delivered"],
        "window_days": 30,
        "outcome": "full_refund",
        "exclusions": [],
    },
    {
        "id": "EL-2.5",
        "title": "Opened consumables and accessories",
        "text": "Opened memory cards, earphone tips, screen protectors and software "
                "licences are not returnable except where damaged on arrival.",
        "claim_types": ["change_of_mind"],
        "window_days": 0,
        "outcome": "reject",
        "exclusions": [],
    },
]

HOME_CLAUSES_V2 = [
    {
        "id": "HM-3.1",
        "title": "Damaged on arrival",
        "text": "Home and furnishing items damaged in transit must be reported within "
                "5 days of delivery with photographs of the damage and the packaging. "
                "Verified claims receive a full refund or replacement.",
        "claim_types": ["damage"],
        "window_days": 5,
        "outcome": "full_refund",
        "exclusions": [],
    },
    {
        "id": "HM-3.2",
        "title": "Order stuck or not delivered",
        "text": "If a shipment shows no movement for 7 days or is marked undelivered, "
                "the order is cancelled and refunded in full without waiting for the "
                "package to be returned to the warehouse.",
        "claim_types": ["not_delivered"],
        "window_days": 45,
        "outcome": "full_refund",
        "exclusions": [],
    },
    {
        "id": "HM-3.3",
        "title": "Wrong item delivered",
        "text": "Where the delivered item differs from the order, a replacement is "
                "arranged at no cost within 7 days of delivery.",
        "claim_types": ["wrong_item", "wrong_size"],
        "window_days": 7,
        "outcome": "replacement",
        "exclusions": [],
    },
]

# Older pack, kept so version-aware retrieval is demonstrable: the v1 damage
# window was 3 days, so an order purchased under v1 is judged more strictly.
CLOTHING_CLAUSES_V1 = [
    {
        "id": "CL-3.2",
        "title": "Damaged on arrival (2025 policy)",
        "text": "Damaged items must be reported within 3 days of delivery with "
                "photographic evidence. Verified claims receive a replacement.",
        "claim_types": ["damage"],
        "window_days": 3,
        "outcome": "replacement",
        "exclusions": [],
    },
]


# --------------------------------------------------------------------------
# sample media
# --------------------------------------------------------------------------

def _product_image(path, label: str, rgb: tuple[int, int, int]) -> None:
    img = Image.new("RGB", (480, 480), rgb)
    d = ImageDraw.Draw(img)
    d.rectangle([24, 24, 456, 456], outline=(255, 255, 255), width=3)
    d.text((40, 220), label, fill=(255, 255, 255))
    img.save(path, "JPEG", quality=88)


def _authentic_photo(path, label: str) -> None:
    """A photo that looks like it came off a phone: JPEG with camera EXIF."""
    img = Image.new("RGB", (900, 1200), (188, 176, 168))
    d = ImageDraw.Draw(img)
    d.rectangle([90, 200, 810, 900], fill=(142, 88, 74))
    d.line([(200, 340), (520, 620)], fill=(60, 40, 34), width=14)  # the "tear"
    d.rectangle([300, 950, 640, 1080], fill=(250, 250, 250))
    d.text((330, 1000), "TAG SKU KRT-RST-M", fill=(20, 20, 20))
    d.text((110, 240), label, fill=(255, 255, 255))
    exif = img.getexif()
    exif[271] = "samsung"                      # Make
    exif[272] = "SM-S928B"                     # Model
    exif[305] = "S928BXXU3AXK2"                # Software
    exif[306] = _now().strftime("%Y:%m:%d %H:%M:%S")  # DateTime
    exif[274] = 1                              # Orientation
    exif[282] = 72.0                           # XResolution
    exif[283] = 72.0                           # YResolution
    img.save(path, "JPEG", quality=90, exif=exif)


def _generated_image(path, label: str) -> None:
    """A file with the fingerprints of a generated image: PNG, no camera EXIF,
    and a generator tag in the metadata."""
    img = Image.new("RGB", (1024, 1024), (206, 198, 190))
    d = ImageDraw.Draw(img)
    d.rectangle([160, 260, 864, 800], fill=(38, 42, 52))
    d.line([(300, 380), (700, 660)], fill=(210, 210, 220), width=10)
    d.text((180, 300), label, fill=(255, 255, 255))
    meta = PngInfo()
    meta.add_text("Software", "Generative Image Model v3")
    meta.add_text("parameters", "photorealistic cracked wireless earbuds, product photo")
    meta.add_text("c2pa.claim_generator", "synthetic-image-generator/3.1")
    img.save(path, "PNG", pnginfo=meta)


def seed_media() -> dict[str, str]:
    base = settings.media_dir / "samples"
    base.mkdir(parents=True, exist_ok=True)
    paths = {}

    products = [
        ("kurti", "Cotton Kurti Set", (168, 92, 66)),
        ("saree", "Handloom Silk Saree", (92, 62, 110)),
        ("earbuds", "Wireless Earbuds", (44, 48, 58)),
        ("cushion", "Floor Cushion", (150, 96, 74)),
        ("lamp", "Ceramic Table Lamp", (196, 178, 148)),
    ]
    for key, label, rgb in products:
        p = base / f"product_{key}.jpg"
        if not p.exists():
            _product_image(p, label, rgb)
        paths[f"product_{key}"] = str(p)

    real = base / "evidence_authentic.jpg"
    if not real.exists():
        _authentic_photo(real, "torn sleeve")
    paths["evidence_authentic"] = str(real)

    fake = base / "evidence_generated.png"
    if not fake.exists():
        _generated_image(fake, "cracked earbud")
    paths["evidence_generated"] = str(fake)

    return paths


# --------------------------------------------------------------------------
# seed
# --------------------------------------------------------------------------

def _key(prefix: str, store: str) -> str:
    return f"{prefix}_{hashlib.sha256((prefix + store).encode()).hexdigest()[:24]}"


def seed(reset: bool = False) -> dict:
    init_db()
    media = seed_media()
    now = _now()

    with session_scope() as db:
        if db.query(Store).count() and not reset:
            return {"seeded": False, "reason": "already populated"}

        if reset:
            from .db.models import (AuditEntry, CaptureSession, Dispute,
                                    Evidence, RefundLedger)
            for model in (AuditEntry, RefundLedger, Evidence, CaptureSession,
                          Dispute, Precedent, Order, Buyer, PolicyPack, Store):
                db.query(model).delete()

        # ---------------- stores ----------------
        stores = [
            Store(
                id="st_rehana", name="Rehana's Closet", category="clothing",
                auto_approve_cap=800.0, fraud_threshold=0.6,
                capabilities={"gateway_refund": True, "courier_pickup": True,
                              "restock": True, "upi_payout": True, "cod_only": False},
                connector="local", onboarded=True,
                publishable_key=_key("pk", "st_rehana"), secret_key=_key("sk", "st_rehana"),
            ),
            Store(
                id="st_techkart", name="TechKart", category="electronics",
                auto_approve_cap=2000.0, fraud_threshold=0.55,
                capabilities={"gateway_refund": True, "courier_pickup": True,
                              "restock": True, "upi_payout": True, "cod_only": False},
                connector="local", onboarded=True,
                publishable_key=_key("pk", "st_techkart"), secret_key=_key("sk", "st_techkart"),
            ),
            # A COD-only store with no courier integration: proves the engine
            # degrades gracefully on missing capabilities instead of failing.
            Store(
                id="st_urbanleaf", name="Urban Leaf Home", category="home",
                auto_approve_cap=1200.0, fraud_threshold=0.6,
                capabilities={"gateway_refund": False, "courier_pickup": False,
                              "restock": False, "upi_payout": True, "cod_only": True},
                connector="local", onboarded=True,
                publishable_key=_key("pk", "st_urbanleaf"), secret_key=_key("sk", "st_urbanleaf"),
            ),
        ]
        db.add_all(stores)

        # ---------------- policy packs ----------------
        db.add_all([
            PolicyPack(store_id="st_rehana", version="v1",
                       effective_from=datetime(2025, 1, 1, tzinfo=timezone.utc),
                       clauses=CLOTHING_CLAUSES_V1),
            PolicyPack(store_id="st_rehana", version="v2",
                       effective_from=datetime(2026, 6, 1, tzinfo=timezone.utc),
                       clauses=CLOTHING_CLAUSES_V2),
            PolicyPack(store_id="st_techkart", version="v2",
                       effective_from=datetime(2026, 1, 1, tzinfo=timezone.utc),
                       clauses=ELECTRONICS_CLAUSES_V2),
            PolicyPack(store_id="st_urbanleaf", version="v2",
                       effective_from=datetime(2026, 1, 1, tzinfo=timezone.utc),
                       clauses=HOME_CLAUSES_V2),
        ])

        # ---------------- buyers ----------------
        db.add_all([
            Buyer(id="by_arjun", name="Arjun Menon", email="arjun.menon@example.com",
                  phone="+91 98470 11234", language="en",
                  device_fingerprint="dev_a91f", address_hash="addr_thrissur_01",
                  created_at=now - timedelta(days=760)),
            Buyer(id="by_rahul", name="Rahul Verma", email="r.verma.deals@example.com",
                  phone="+91 90000 55512", language="en",
                  device_fingerprint="dev_ff02", address_hash="addr_shared_77",
                  created_at=now - timedelta(days=14)),
            Buyer(id="by_meera", name="Meera Nair", email="meera.nair@example.com",
                  phone="+91 99461 77820", language="ml",
                  device_fingerprint="dev_c410", address_hash="addr_kochi_09",
                  created_at=now - timedelta(days=430)),
        ])

        # ---------------- orders ----------------
        def order(**kw) -> Order:
            return Order(**kw)

        orders = [
            # --- scenario 1: happy path, under cap, trusted buyer -----------
            order(id="ORD-2041", store_id="st_rehana", buyer_id="by_arjun",
                  items=[{"sku": "KRT-RST-M", "title": "Cotton Kurti Set",
                          "variant": "Rust / M", "qty": 1, "price": 749.0,
                          "image": media["product_kurti"], "serial": "KRT-RST-M"}],
                  total=749.0, payment_method="prepaid", payment_ref="pay_R41x8821",
                  status="delivered", placed_at=now - timedelta(days=5),
                  delivered_at=now - timedelta(hours=6),
                  courier="Delhivery", tracking_id="DL18865010264272",
                  shipment_events=[
                      {"at": (now - timedelta(days=4)).isoformat(), "status": "dispatched"},
                      {"at": (now - timedelta(days=1)).isoformat(), "status": "out_for_delivery"},
                      {"at": (now - timedelta(hours=6)).isoformat(), "status": "delivered"},
                  ]),

            # --- scenario 2: fraud, repeat claimer, generated evidence ------
            order(id="ORD-2042", store_id="st_techkart", buyer_id="by_rahul",
                  items=[{"sku": "EAR-PRO-BLK", "title": "Wireless Earbuds Pro",
                          "variant": "Black", "qty": 1, "price": 1899.0,
                          "image": media["product_earbuds"], "serial": "SN-TK-77401932"}],
                  total=1899.0, payment_method="prepaid", payment_ref="pay_R42y1190",
                  status="delivered", placed_at=now - timedelta(days=6),
                  delivered_at=now - timedelta(days=2),
                  courier="Bluedart", tracking_id="BD44120983",
                  shipment_events=[
                      {"at": (now - timedelta(days=5)).isoformat(), "status": "dispatched"},
                      {"at": (now - timedelta(days=2)).isoformat(), "status": "delivered"},
                  ]),

            # --- scenario 3: injection attempt ------------------------------
            order(id="ORD-2043", store_id="st_rehana", buyer_id="by_rahul",
                  items=[{"sku": "DUP-GLD-F", "title": "Chanderi Dupatta",
                          "variant": "Gold", "qty": 1, "price": 899.0,
                          "image": media["product_kurti"], "serial": "DUP-GLD-F"}],
                  total=899.0, payment_method="prepaid", payment_ref="pay_R43z7781",
                  status="delivered", placed_at=now - timedelta(days=4),
                  delivered_at=now - timedelta(days=1),
                  courier="Delhivery", tracking_id="DL18865011002",
                  shipment_events=[
                      {"at": (now - timedelta(days=3)).isoformat(), "status": "dispatched"},
                      {"at": (now - timedelta(days=1)).isoformat(), "status": "delivered"},
                  ]),

            # --- scenario 4: high value, over cap -> seller approval --------
            order(id="ORD-2044", store_id="st_rehana", buyer_id="by_meera",
                  items=[{"sku": "SAR-SLK-01", "title": "Handloom Silk Saree",
                          "variant": "Deep Plum", "qty": 1, "price": 4200.0,
                          "image": media["product_saree"], "serial": "SAR-SLK-01"}],
                  total=4200.0, payment_method="prepaid", payment_ref="pay_R44a3312",
                  status="delivered", placed_at=now - timedelta(days=3),
                  delivered_at=now - timedelta(hours=20),
                  courier="Delhivery", tracking_id="DL18865012884",
                  shipment_events=[
                      {"at": (now - timedelta(days=2)).isoformat(), "status": "dispatched"},
                      {"at": (now - timedelta(hours=20)).isoformat(), "status": "delivered"},
                  ]),

            # --- scenario 5: stalled shipment -> watchdog opens a dispute ---
            order(id="ORD-2045", store_id="st_urbanleaf", buyer_id="by_meera",
                  items=[{"sku": "CSH-RST-2", "title": "Cotton Floor Cushion (Set of 2)",
                          "variant": "Rust Brown", "qty": 1, "price": 2499.0,
                          "image": media["product_cushion"], "serial": "CSH-RST-2"}],
                  total=2499.0, payment_method="cod", payment_ref="",
                  status="in_transit", placed_at=now - timedelta(days=26),
                  delivered_at=None,
                  courier="Delhivery Heavy", tracking_id="DL18865010264272",
                  shipment_events=[
                      {"at": (now - timedelta(days=25)).isoformat(), "status": "dispatched"},
                      {"at": (now - timedelta(days=22)).isoformat(), "status": "reached_hub",
                       "note": "Thrissur hub"},
                      {"at": (now - timedelta(days=21)).isoformat(), "status": "undelivered",
                       "note": "short shipment"},
                  ]),

            # --- history for the trusted buyer -----------------------------
            order(id="ORD-1990", store_id="st_rehana", buyer_id="by_arjun",
                  items=[{"sku": "SHT-BLU-L", "title": "Linen Shirt", "variant": "Blue / L",
                          "qty": 1, "price": 1250.0, "image": media["product_kurti"],
                          "serial": "SHT-BLU-L"}],
                  total=1250.0, payment_ref="pay_hist01", status="delivered",
                  placed_at=now - timedelta(days=180), delivered_at=now - timedelta(days=175)),
            order(id="ORD-1991", store_id="st_techkart", buyer_id="by_arjun",
                  items=[{"sku": "CHG-65W", "title": "65W Fast Charger", "variant": "White",
                          "qty": 1, "price": 1499.0, "image": media["product_earbuds"],
                          "serial": "SN-TK-55120031"}],
                  total=1499.0, payment_ref="pay_hist02", status="delivered",
                  placed_at=now - timedelta(days=120), delivered_at=now - timedelta(days=116)),
            order(id="ORD-1992", store_id="st_urbanleaf", buyer_id="by_arjun",
                  items=[{"sku": "LMP-CER-1", "title": "Ceramic Table Lamp", "variant": "Sand",
                          "qty": 1, "price": 1899.0, "image": media["product_lamp"],
                          "serial": "LMP-CER-1"}],
                  total=1899.0, payment_ref="pay_hist03", status="delivered",
                  placed_at=now - timedelta(days=60), delivered_at=now - timedelta(days=56)),
        ]
        db.add_all(orders)

        # ---------------- fraud history for the repeat claimer -------------
        # Three prior claims in 60 days spread across DIFFERENT stores: no single
        # store can see this pattern, the platform can.
        db.add_all([
            Precedent(store_id="st_techkart", dispute_id="D-9001", claim_type="damage",
                      summary="Rahul Verma claimed screen damage on earphones, refunded",
                      outcome="full_refund", amount=1299.0,
                      created_at=now - timedelta(days=52)),
            Precedent(store_id="st_urbanleaf", dispute_id="D-9002", claim_type="damage",
                      summary="Rahul Verma claimed cracked lamp base, refunded",
                      outcome="full_refund", amount=1899.0,
                      created_at=now - timedelta(days=33)),
            Precedent(store_id="st_rehana", dispute_id="D-9003", claim_type="not_delivered",
                      summary="Rahul Verma claimed non-delivery, refunded",
                      outcome="full_refund", amount=999.0,
                      created_at=now - timedelta(days=12)),
        ])

    return {
        "seeded": True,
        "stores": 3,
        "orders": 9,
        "buyers": 3,
        "media": media,
    }


if __name__ == "__main__":
    import json
    print(json.dumps(seed(reset=True), indent=2, default=str))
