"""
Audio file → played note sequence using Spotify basic-pitch.
Supports M4A, MP3, WAV, AAC, WEBM, OGG and other formats loadable by librosa.
"""

from typing import List

from models import PlayedNote

_MIDI_NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def midi_to_name(midi: int) -> str:
    octave = (midi // 12) - 1
    name = _MIDI_NOTE_NAMES[midi % 12]
    return f"{name}{octave}"


def transcribe_audio(audio_path: str) -> List[PlayedNote]:
    """
    Transcribe an audio file to a list of PlayedNote objects.
    Uses Spotify basic-pitch for polyphonic piano transcription.
    """
    try:
        from basic_pitch.inference import predict
        from basic_pitch import ICASSP_2022_MODEL_PATH
    except ImportError as exc:
        raise RuntimeError(
            "basic-pitch is not installed. Run: pip install basic-pitch"
        ) from exc

    _, midi_data, _ = predict(audio_path, ICASSP_2022_MODEL_PATH)

    notes: List[PlayedNote] = []
    for instrument in midi_data.instruments:
        for note in instrument.notes:
            duration = float(note.end - note.start)
            if duration < 0.05:
                continue
            notes.append(
                PlayedNote(
                    pitch_midi=int(note.pitch),
                    pitch_name=midi_to_name(int(note.pitch)),
                    onset_sec=float(note.start),
                    offset_sec=float(note.end),
                    duration_sec=duration,
                )
            )

    notes.sort(key=lambda n: (n.onset_sec, n.pitch_midi))
    return notes
