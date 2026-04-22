# Piano Coach

Listens to your daughter's piano playing and tells you which notes and rhythms were wrong.

## Features

- **Upload sheet music** — photo (JPG/PNG/HEIC from iPhone) or MusicXML export
- **Upload a recording** — M4A, MP3, WAV, AAC from iPhone Voice Memos or any recorder
- **Record live** — microphone directly in the browser
- **Mistake report** — wrong notes, missed notes, extra notes, rhythm issues per measure

---

## Setup

### 1. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

> **macOS Apple Silicon note**: TensorFlow is installed automatically as a dependency of
> `basic-pitch` and `oemer`. If you hit a TF install error on M1/M2/M3, run:
> ```bash
> pip install tensorflow-macos tensorflow-metal
> ```
> then re-run `pip install -r requirements.txt`.

> **ffmpeg** (optional but recommended for WebM/M4A support):
> ```bash
> brew install ffmpeg
> ```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** in your browser.

---

## Usage

1. **Step 1 — Upload Sheet Music**
   - Take a clear, straight-on photo of the sheet music with your iPhone (no angle, good light)
   - Or export MusicXML from MuseScore / Sibelius / GarageBand
   - Tap "Browse" and select the file
   - Wait for "Found N notes across M measures" confirmation

2. **Step 2 — Provide Audio**
   - *Upload Recording*: use iPhone Voice Memos → share as M4A, then upload
   - *Record from Mic*: tap the mic button in the browser and play; tap Stop when done

3. **Tap "Analyze Playing"** — results appear below

---

## Accepted File Formats

| Type | Formats |
|---|---|
| Sheet music image | JPG, PNG, HEIC, HEIF, BMP, TIFF, WebP |
| Sheet music file | MusicXML (.musicxml, .xml), MXL (.mxl) |
| Audio recording | M4A, MP3, WAV, AAC, OGG, FLAC, WebM |

---

## OMR Accuracy Tips

Open-source OMR (oemer) works best when:
- The photo is taken **straight-on** (no perspective angle)
- The page is **fully visible** with no cut-off edges
- Lighting is **even** — no shadows across the staff lines
- The score uses **standard printed notation** (not handwritten)

If OMR fails on an image, try exporting MusicXML directly from a music notation app.
