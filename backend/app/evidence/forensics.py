"""File-level forensics for evidence that arrives as an upload.

This runs only on the fallback tier. Live capture is the primary defence,
because provenance beats detection: an image produced under a challenge we
issued seconds earlier does not need to be classified as real or fake.

Everything here is a *signal*, never a verdict. Metadata can be stripped by a
messaging app, so absence of EXIF raises suspicion rather than proving anything,
and the score it feeds is one input among several.
"""
from __future__ import annotations

import hashlib
from pathlib import Path

from PIL import Image

# EXIF tags that a real camera writes
TAG_MAKE, TAG_MODEL, TAG_SOFTWARE, TAG_DATETIME = 271, 272, 305, 306

GENERATOR_HINTS = (
    "dall", "midjourney", "stable diffusion", "stablediffusion", "firefly",
    "generative", "synthetic", "imagen", "flux", "gpt-image", "sora",
    "nano banana", "seedream", "ai-generated",
)

# Common phone screen sizes: an image at exactly these dimensions is more
# likely a screenshot than a photograph.
SCREENSHOT_SIZES = {(1080, 1920), (1170, 2532), (1179, 2556), (1290, 2796),
                    (1440, 3120), (828, 1792), (750, 1334), (1284, 2778)}


def content_hash(path: str | Path) -> str:
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()[:32]


def perceptual_hash(path: str | Path) -> str:
    """Average hash. Survives recompression and resizing, so the same fake
    submitted at two different stores still collides."""
    try:
        img = Image.open(path).convert("L").resize((8, 8), Image.LANCZOS)
    except Exception:
        return ""
    pixels = list(img.getdata())
    avg = sum(pixels) / len(pixels)
    bits = "".join("1" if p >= avg else "0" for p in pixels)
    return f"{int(bits, 2):016x}"


def hamming(a: str, b: str) -> int:
    """Distance between two average hashes. Zero is the same picture; a handful
    of bits is the same picture after a screenshot and a re-encode; anything
    much larger is a different picture."""
    if not a or not b or len(a) != len(b):
        return 64
    try:
        return bin(int(a, 16) ^ int(b, 16)).count("1")
    except ValueError:
        return 64


def analyse(path: str | Path) -> dict:
    """Returns the signals, the flags they raise, and hashes for cross-store
    correlation."""
    p = Path(path)
    out: dict = {
        "file": p.name,
        "format": None,
        "dimensions": None,
        "flags": [],
        "camera": {},
        "generator_markers": [],
        "content_hash": "",
        "perceptual_hash": "",
    }
    if not p.exists():
        out["flags"].append("file_missing")
        return out

    out["content_hash"] = content_hash(p)
    out["perceptual_hash"] = perceptual_hash(p)

    try:
        img = Image.open(p)
    except Exception:
        out["flags"].append("unreadable_image")
        return out

    out["format"] = img.format
    out["dimensions"] = list(img.size)

    # ---- camera metadata --------------------------------------------------
    exif = {}
    try:
        exif = dict(img.getexif())
    except Exception:
        exif = {}

    make = exif.get(TAG_MAKE)
    model = exif.get(TAG_MODEL)
    software = str(exif.get(TAG_SOFTWARE, ""))
    taken = exif.get(TAG_DATETIME)
    out["camera"] = {"make": make, "model": model, "software": software or None,
                     "taken_at": taken}

    if not make and not model:
        out["flags"].append("no_camera_exif")
    if any(h in software.lower() for h in GENERATOR_HINTS):
        out["flags"].append("generator_metadata")
        out["generator_markers"].append(f"exif.Software={software}")

    # ---- embedded text metadata (PNG chunks, XMP) -------------------------
    info_blob = " ".join(f"{k}={v}" for k, v in (img.info or {}).items()
                         if isinstance(v, str)).lower()
    for hint in GENERATOR_HINTS:
        if hint in info_blob:
            if "generator_metadata" not in out["flags"]:
                out["flags"].append("generator_metadata")
            out["generator_markers"].append(f"metadata contains '{hint}'")
            break

    # ---- C2PA / Content Credentials --------------------------------------
    # A full implementation verifies the signed manifest; here we detect the
    # presence of a claim and whether it declares an AI generator.
    c2pa = _c2pa_scan(p, img)
    out["c2pa"] = c2pa
    if c2pa["present"] and c2pa["ai_declared"]:
        out["flags"].append("c2pa_ai_declared")
    elif c2pa["present"] and c2pa["capture_declared"]:
        out["flags"].append("c2pa_capture_declared")  # a point in its favour

    # ---- shape heuristics -------------------------------------------------
    if tuple(img.size) in SCREENSHOT_SIZES:
        out["flags"].append("screenshot_dimensions")
    if img.format == "PNG" and "no_camera_exif" in out["flags"]:
        # phones produce JPEG or HEIC; a PNG "photo" is a screenshot or a render
        out["flags"].append("png_without_camera_origin")

    return out


def _c2pa_scan(path: Path, img: Image.Image) -> dict:
    """Look for a Content Credentials manifest and what it claims.

    Real C2PA verification requires validating a signature chain; that is the
    production path. Detection of the claim and its generator is enough to move
    a fraud signal, which is all this tier is allowed to do.
    """
    result = {"present": False, "ai_declared": False, "capture_declared": False,
              "generator": None}

    text_meta = {k.lower(): str(v).lower() for k, v in (img.info or {}).items()
                 if isinstance(v, str)}
    for key, value in text_meta.items():
        if "c2pa" in key or "contentcredential" in key:
            result["present"] = True
            result["generator"] = value[:120]
            if any(h in value for h in GENERATOR_HINTS):
                result["ai_declared"] = True
            if "camera" in value or "capture" in value:
                result["capture_declared"] = True

    if not result["present"]:
        try:
            head = path.read_bytes()[:65536]
            if b"c2pa" in head or b"jumbf" in head or b"urn:uuid:c2pa" in head:
                result["present"] = True
                blob = head.lower()
                if any(h.encode() in blob for h in GENERATOR_HINTS):
                    result["ai_declared"] = True
        except Exception:
            pass

    return result


def summarise(analysis: dict) -> str:
    """One line for the audit log and the seller's dossier."""
    flags = analysis.get("flags", [])
    if not flags:
        cam = analysis.get("camera", {})
        if cam.get("make"):
            return f"Camera metadata present ({cam['make']} {cam.get('model', '')}).".strip()
        return "No adverse signals."
    readable = {
        "no_camera_exif": "no camera metadata",
        "generator_metadata": "carries AI generator metadata",
        "c2pa_ai_declared": "Content Credentials declare an AI generator",
        "c2pa_capture_declared": "Content Credentials declare camera capture",
        "screenshot_dimensions": "dimensions match a phone screenshot",
        "png_without_camera_origin": "PNG with no camera origin",
        "file_missing": "file missing",
        "unreadable_image": "unreadable image",
    }
    return "; ".join(readable.get(f, f) for f in flags)
