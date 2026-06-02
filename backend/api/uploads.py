"""
DISHA Beta — Uploads API

Receives operator-provided artifacts from the Control sidebar:
  - Telecommand format files
  - Packet definition files
  - (Future: dictionaries, scripts, procedures)

Files are persisted to `uploads/<kind>/<filename>` on the server, with a
timestamp prefix so re-uploads don't clobber each other. Nothing in
this module parses the file content — that's a future ingest job.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path
from typing import List

from fastapi import APIRouter, File, HTTPException, UploadFile

router = APIRouter(prefix="/uploads", tags=["Uploads"])

ROOT = Path(__file__).resolve().parents[2]
UPLOAD_DIR = ROOT / "uploads"

# Allowed upload kinds (frontend uses these path segments)
ALLOWED_KINDS = {
    "telecommand_format": "Telecommand format",
    "packets":            "Packet definitions",
}

_SAFE_NAME = re.compile(r"[^A-Za-z0-9._-]+")


def _safe_filename(name: str) -> str:
    return _SAFE_NAME.sub("_", (name or "upload").strip()) or "upload"


def _kind_dir(kind: str) -> Path:
    if kind not in ALLOWED_KINDS:
        raise HTTPException(status_code=400, detail=f"Unknown upload kind: {kind}")
    d = UPLOAD_DIR / kind
    d.mkdir(parents=True, exist_ok=True)
    return d


@router.get("/kinds")
def list_kinds():
    """Catalog of what the frontend Insert menu can upload."""
    return {"kinds": [{"id": k, "label": v} for k, v in ALLOWED_KINDS.items()]}


@router.post("/{kind}")
async def upload(kind: str, file: UploadFile = File(...)):
    """Receive one file. Server saves with a UTC-timestamp prefix."""
    target_dir = _kind_dir(kind)
    safe = _safe_filename(file.filename or "upload")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    saved_name = f"{stamp}__{safe}"
    saved_path = target_dir / saved_name

    contents = await file.read()
    saved_path.write_bytes(contents)

    return {
        "ok": True,
        "kind": kind,
        "label": ALLOWED_KINDS[kind],
        "original_name": file.filename,
        "saved_as": saved_name,
        "size_bytes": len(contents),
        "received_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/{kind}")
def list_uploads(kind: str) -> dict:
    """List previously-uploaded files for a kind (newest first)."""
    target_dir = _kind_dir(kind)
    items: List[dict] = []
    for p in sorted(target_dir.iterdir(), reverse=True):
        if p.is_file():
            stat = p.stat()
            items.append({
                "saved_as": p.name,
                "size_bytes": stat.st_size,
                "mtime": datetime.fromtimestamp(
                    stat.st_mtime, tz=timezone.utc
                ).isoformat(),
            })
    return {"kind": kind, "label": ALLOWED_KINDS[kind], "files": items}
