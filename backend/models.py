from pydantic import BaseModel
from typing import Optional, List


class RefNote(BaseModel):
    pitch_midi: int
    pitch_name: str
    offset_beats: float
    duration_beats: float
    measure: int
    beat_in_measure: float


class PlayedNote(BaseModel):
    pitch_midi: int
    pitch_name: str
    onset_sec: float
    offset_sec: float
    duration_sec: float


class Mistake(BaseModel):
    type: str
    measure: int
    beat: float
    expected_pitch: Optional[str] = None
    played_pitch: Optional[str] = None
    detail: str
    severity: str


class BarTiming(BaseModel):
    bar: int
    start_sec: float
    end_sec: float


class SheetParseResponse(BaseModel):
    ref_notes: List[RefNote]
    notes_count: int
    measures: int
    summary: str


class AnalysisReport(BaseModel):
    tempo_bpm: float
    total_ref_notes: int
    total_played_notes: int
    accuracy: float
    rhythm_accuracy: float
    mistakes: List[Mistake]
    bar_timings: List[BarTiming] = []
    summary: str
