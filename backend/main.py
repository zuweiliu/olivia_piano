import base64
import json
import math
import os
import tempfile
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from models import RefNote


def _sanitize(obj: Any) -> Any:
    """Recursively replace inf/nan floats so JSON serialization never fails."""
    if isinstance(obj, float):
        return 0.0 if (math.isnan(obj) or math.isinf(obj)) else obj
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize(v) for v in obj]
    return obj

app = FastAPI(title="Piano Coach API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".heic", ".heif", ".bmp", ".tiff", ".tif", ".webp"}
XML_EXTS = {".xml", ".musicxml", ".mxl"}
AUDIO_EXTS = {".wav", ".mp3", ".m4a", ".aac", ".ogg", ".flac", ".webm", ".mp4", ".aiff"}


def _ext(filename: str) -> str:
    return os.path.splitext(filename.lower())[1]


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.post("/api/parse-sheet")
async def parse_sheet(file: UploadFile = File(...)):
    """
    Accept a sheet music image (JPG/PNG/HEIC) or MusicXML file.
    Returns the parsed reference note sequence.
    """
    ext = _ext(file.filename or "")
    if ext not in IMAGE_EXTS and ext not in XML_EXTS:
        raise HTTPException(
            400,
            detail=(
                f"Unsupported file type '{ext}'. "
                "Accepted: JPG, PNG, HEIC (image) or MusicXML, MXL (sheet music XML)."
            ),
        )

    suffix = ext or ".jpg"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        from omr import parse_sheet_image, parse_musicxml_file

        xml_b64: str | None = None
        if ext in IMAGE_EXTS:
            ref_notes, xml_bytes = parse_sheet_image(tmp_path)
            xml_b64 = base64.b64encode(xml_bytes).decode()
        else:
            ref_notes = parse_musicxml_file(tmp_path)

        if not ref_notes:
            raise HTTPException(
                422,
                detail=(
                    "No notes could be extracted. "
                    "For images: ensure the photo is well-lit, straight-on, and in focus. "
                    "Alternatively, upload a MusicXML file exported from MuseScore or Sibelius."
                ),
            )

        measures = max((n.measure for n in ref_notes), default=0)

        response: dict = {
            "ref_notes": [n.model_dump() for n in ref_notes],
            "notes_count": len(ref_notes),
            "measures": measures,
            "summary": f"Found {len(ref_notes)} notes across {measures} measures",
        }
        if xml_b64:
            response["musicxml_b64"] = xml_b64
        return _sanitize(response)

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(500, detail=f"Sheet parsing failed: {exc}") from exc
    finally:
        os.unlink(tmp_path)


@app.post("/api/analyze")
async def analyze(
    ref_notes: str = Form(...),
    audio: UploadFile = File(...),
):
    """
    Accept the reference notes JSON (from /api/parse-sheet) and an audio file.
    Returns a full mistake report.
    """
    ext = _ext(audio.filename or "")
    if ext and ext not in AUDIO_EXTS:
        raise HTTPException(
            400,
            detail=(
                f"Unsupported audio format '{ext}'. "
                "Accepted: M4A, MP3, WAV, AAC, WEBM."
            ),
        )

    try:
        ref_data = json.loads(ref_notes)
        ref_list = [RefNote(**n) for n in ref_data]
    except Exception as exc:
        raise HTTPException(400, detail=f"Invalid ref_notes JSON: {exc}") from exc

    suffix = ext or ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        content = await audio.read()
        tmp.write(content)
        audio_path = tmp.name

    try:
        from transcribe import transcribe_audio
        from compare import compare_notes

        played = transcribe_audio(audio_path)
        report = compare_notes(ref_list, played)
        return _sanitize(report)

    except Exception as exc:
        raise HTTPException(500, detail=f"Analysis failed: {exc}") from exc
    finally:
        os.unlink(audio_path)
