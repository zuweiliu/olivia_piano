"""
Sheet music image → reference note sequence using oemer (OMR) + music21.
Also supports direct MusicXML / MXL file parsing as a more reliable fallback.
"""

import subprocess
import sys
import tempfile
import os
import glob
import shutil
from typing import List

import music21
import music21.note
import music21.chord

from models import RefNote


def _run_oemer(image_path: str, output_dir: str) -> str:
    """Run the oemer CLI on an image and return the path to the output MusicXML."""
    oemer_bin = shutil.which("oemer")
    if oemer_bin is None:
        venv_oemer = os.path.join(os.path.dirname(sys.executable), "oemer")
        if os.path.exists(venv_oemer):
            oemer_bin = venv_oemer
        else:
            raise RuntimeError(
                "oemer is not installed or not on PATH. "
                "Run: pip install oemer"
            )

    result = subprocess.run(
        [oemer_bin, image_path, "-o", output_dir],
        capture_output=True,
        text=True,
        timeout=300,
    )

    if result.returncode != 0:
        raise RuntimeError(
            f"oemer failed (exit {result.returncode}).\n"
            f"stderr: {result.stderr[-2000:]}"
        )

    patterns = [
        os.path.join(output_dir, "*.musicxml"),
        os.path.join(output_dir, "*.xml"),
        os.path.join(output_dir, "*.mxl"),
    ]
    xml_files: List[str] = []
    for pat in patterns:
        xml_files.extend(glob.glob(pat))

    if not xml_files:
        raise RuntimeError(
            "oemer ran successfully but produced no MusicXML output. "
            "Try uploading a clearer, well-lit, straight-on photo of the sheet music."
        )

    return xml_files[0]


def _safe_float(v: float, fallback: float = 0.0) -> float:
    """Replace inf / nan with a safe fallback so JSON serialization never fails."""
    import math
    return fallback if (math.isnan(v) or math.isinf(v)) else v


def _parse_musicxml(xml_path: str) -> List[RefNote]:
    """Parse a MusicXML / MXL file and extract all notes with timing info."""
    score = music21.converter.parse(xml_path)

    notes: List[RefNote] = []

    for part in score.parts:
        for measure in part.getElementsByClass("Measure"):
            measure_num = int(measure.number) if measure.number else 0
            measure_offset = _safe_float(float(measure.offset))

            for element in measure.flatten().notes:
                note_offset_in_measure = _safe_float(float(element.offset))
                global_offset = measure_offset + note_offset_in_measure
                beat_in_measure = round(note_offset_in_measure + 1.0, 3)

                duration = _safe_float(float(element.quarterLength), 0.25)
                if duration <= 0:
                    duration = 0.25

                if isinstance(element, music21.note.Note):
                    notes.append(
                        RefNote(
                            pitch_midi=element.pitch.midi,
                            pitch_name=element.pitch.nameWithOctave,
                            offset_beats=global_offset,
                            duration_beats=duration,
                            measure=measure_num,
                            beat_in_measure=beat_in_measure,
                        )
                    )
                elif isinstance(element, music21.chord.Chord):
                    for pitch in element.pitches:
                        notes.append(
                            RefNote(
                                pitch_midi=pitch.midi,
                                pitch_name=pitch.nameWithOctave,
                                offset_beats=global_offset,
                                duration_beats=duration,
                                measure=measure_num,
                                beat_in_measure=beat_in_measure,
                            )
                        )

    notes.sort(key=lambda n: (n.offset_beats, n.pitch_midi))
    return notes


def _to_png(image_path: str) -> str:
    """
    Convert any image (HEIC, TIFF, WebP, etc.) to a plain RGB PNG that
    OpenCV / oemer can always read.  Returns the path to the PNG file.
    """
    try:
        import pillow_heif
        pillow_heif.register_heif_opener()
    except ImportError:
        pass

    from PIL import Image as PILImage
    img = PILImage.open(image_path).convert("RGB")
    png_path = image_path + "_converted.png"
    img.save(png_path, format="PNG")
    return png_path


def parse_sheet_image(image_path: str) -> tuple:
    """OMR pipeline: image → MusicXML (via oemer) → (RefNote list, xml bytes)."""
    png_path = _to_png(image_path)
    try:
        with tempfile.TemporaryDirectory(prefix="piano_omr_") as tmpdir:
            xml_path = _run_oemer(png_path, tmpdir)
            notes = _parse_musicxml(xml_path)
            with open(xml_path, "rb") as f:
                xml_bytes = f.read()
            return notes, xml_bytes
    finally:
        if png_path != image_path and os.path.exists(png_path):
            os.unlink(png_path)


def parse_musicxml_file(xml_path: str) -> List[RefNote]:
    """Direct MusicXML/MXL parse — more reliable than image OMR."""
    return _parse_musicxml(xml_path)
