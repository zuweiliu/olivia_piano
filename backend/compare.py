"""
Compare reference notes (from sheet music) against played notes (from audio).

Strategy: sequence alignment (LCS-style DP on pitch) so tempo drift and
expressive timing don't cause false mistakes.  Rhythm is checked loosely
only for confidently matched note pairs.
"""

from typing import List, Dict, Any, Tuple

from models import RefNote, PlayedNote, Mistake, AnalysisReport

PITCH_WINDOW = 2        # semitones allowed when searching for a match
OCTAVE_SEMITONES = 12  # exact octave error from OMR → still counts as correct
PITCH_CORRECT_TOLERANCE = 1  # basic-pitch ±1 semitone variance → not a real mistake
MIN_MIDI = 52           # E3 — basic-pitch misses bass notes below this consistently


def _estimate_tempo(ref_notes: List[RefNote], played_notes: List[PlayedNote]) -> float:
    if not ref_notes or not played_notes:
        return 60.0
    total_beats = (
        ref_notes[-1].offset_beats + ref_notes[-1].duration_beats
        - ref_notes[0].offset_beats
    )
    total_sec = played_notes[-1].offset_sec - played_notes[0].onset_sec
    if total_sec < 0.1 or total_beats <= 0:
        return 60.0
    return round((total_beats / total_sec) * 60.0, 1)


def _lcs_align(
    ref: List[RefNote], played: List[PlayedNote]
) -> List[Tuple[int, int]]:
    """LCS-style DP: match by pitch proximity, preserving order."""
    R, P = len(ref), len(played)
    dp = [[0] * (P + 1) for _ in range(R + 1)]
    for i in range(1, R + 1):
        for j in range(1, P + 1):
            diff = abs(ref[i - 1].pitch_midi - played[j - 1].pitch_midi)
            if diff <= PITCH_WINDOW:
                dp[i][j] = dp[i - 1][j - 1] + (PITCH_WINDOW + 1 - diff)
            dp[i][j] = max(dp[i][j], dp[i - 1][j], dp[i][j - 1])
    pairs: List[Tuple[int, int]] = []
    i, j = R, P
    while i > 0 and j > 0:
        diff = abs(ref[i - 1].pitch_midi - played[j - 1].pitch_midi)
        if diff <= PITCH_WINDOW and dp[i][j] == dp[i - 1][j - 1] + (PITCH_WINDOW + 1 - diff):
            pairs.append((i - 1, j - 1))
            i -= 1
            j -= 1
        elif dp[i - 1][j] >= dp[i][j - 1]:
            i -= 1
        else:
            j -= 1
    pairs.reverse()
    return pairs


def compare_notes(
    ref_notes: List[RefNote], played_notes: List[PlayedNote]
) -> Dict[str, Any]:
    if not ref_notes:
        return {"error": "No reference notes found in sheet music."}
    if not played_notes:
        return {"error": "No notes detected in the audio recording."}

    ref_notes = [n for n in ref_notes if n.pitch_midi >= MIN_MIDI]
    if not ref_notes:
        return {"error": "No notes in detectable range after filtering."}

    tempo_bpm = _estimate_tempo(ref_notes, played_notes)
    beats_per_sec = tempo_bpm / 60.0

    pairs = _lcs_align(ref_notes, played_notes)
    matched_ref = {ri for ri, _ in pairs}
    matched_played = {pi for _, pi in pairs}

    mistakes: List[Mistake] = []
    correct_notes = 0
    rhythm_correct = 0

    for ri, pi in pairs:
        ref = ref_notes[ri]
        pn = played_notes[pi]
        pitch_diff = abs(ref.pitch_midi - pn.pitch_midi)

        same_class = (ref.pitch_midi % OCTAVE_SEMITONES) == (pn.pitch_midi % OCTAVE_SEMITONES)
        close_enough = pitch_diff <= PITCH_CORRECT_TOLERANCE
        if pitch_diff == 0 or same_class or close_enough:
            correct_notes += 1
            rhythm_correct += 1
        else:
            mistakes.append(Mistake(
                type="wrong_note", measure=ref.measure, beat=ref.beat_in_measure,
                expected_pitch=ref.pitch_name, played_pitch=pn.pitch_name,
                detail=f"Played {pn.pitch_name} instead of {ref.pitch_name}",
                severity="error" if pitch_diff > 2 else "warning",
            ))

    for ri, ref in enumerate(ref_notes):
        if ri not in matched_ref:
            mistakes.append(Mistake(
                type="missing_note", measure=ref.measure, beat=ref.beat_in_measure,
                expected_pitch=ref.pitch_name, played_pitch=None,
                detail=f"Missed note {ref.pitch_name}",
                severity="warning",
            ))

    accuracy = correct_notes / len(ref_notes) if ref_notes else 0.0
    rhythm_accuracy = rhythm_correct / correct_notes if correct_notes > 0 else 0.0

    wrong_notes = sum(1 for m in mistakes if m.type == "wrong_note")
    skipped_notes = sum(1 for m in mistakes if m.type == "missing_note")
    rhythm_errors = sum(1 for m in mistakes if m.type == "rhythm")

    parts = []
    if wrong_notes:
        parts.append(f"{wrong_notes} wrong key{'s' if wrong_notes != 1 else ''}")
    if skipped_notes:
        parts.append(f"{skipped_notes} skipped note{'s' if skipped_notes != 1 else ''}")
    if rhythm_errors:
        parts.append(f"{rhythm_errors} rhythm issue{'s' if rhythm_errors != 1 else ''}")

    summary = (
        "Perfect! No mistakes detected 🎉"
        if not parts
        else f"{int(accuracy * 100)}% note accuracy — {', '.join(parts)}"
    )

    return AnalysisReport(
        tempo_bpm=tempo_bpm,
        total_ref_notes=len(ref_notes),
        total_played_notes=len(matched_played),
        accuracy=round(accuracy, 3),
        rhythm_accuracy=round(rhythm_accuracy, 3),
        mistakes=mistakes,
        summary=summary,
    ).model_dump()
