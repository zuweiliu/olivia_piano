"""
Compare reference notes (from sheet music) against played notes (from audio).

Strategy: sequence alignment (LCS-style DP on pitch) so tempo drift and
expressive timing don't cause false mistakes.  Rhythm is checked loosely
only for confidently matched note pairs.
"""

from typing import List, Dict, Any, Tuple, Optional

from models import RefNote, PlayedNote, Mistake, AnalysisReport, BarTiming

PITCH_WINDOW = 2        # semitones allowed when searching for a match
OCTAVE_SEMITONES = 12  # exact octave error from OMR → still counts as correct
PITCH_CORRECT_TOLERANCE = 1  # basic-pitch ±1 semitone variance → not a real mistake
MIN_MIDI = 52           # E3 — basic-pitch misses bass notes below this consistently


def _estimate_tempo(
    ref_notes: List[RefNote], played_notes: List[PlayedNote],
    pairs: Optional[List[Tuple[int, int]]] = None,
) -> float:
    if not ref_notes or not played_notes:
        return 60.0
    # Use aligned pairs if available (ignores speech/noise)
    if pairs and len(pairs) >= 2:
        first_ri, first_pi = pairs[0]
        last_ri, last_pi = pairs[-1]
        total_beats = (
            ref_notes[last_ri].offset_beats + ref_notes[last_ri].duration_beats
            - ref_notes[first_ri].offset_beats
        )
        total_sec = played_notes[last_pi].offset_sec - played_notes[first_pi].onset_sec
    else:
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


def _compute_bar_timings(
    ref_notes: List[RefNote], beats_per_sec: float, played_notes: List[PlayedNote],
    pairs: List[Tuple[int, int]],
) -> List[BarTiming]:
    """Build a list of {bar, start_sec, end_sec} from ref notes + tempo.
    Uses the alignment pairs to find the true music start (ignoring speech/noise)."""
    if not ref_notes or beats_per_sec <= 0:
        return []

    # Use the first aligned pair as the anchor point (skip speech/noise)
    if pairs:
        first_ri, first_pi = pairs[0]
        ref_start = ref_notes[first_ri].offset_beats
        played_start = played_notes[first_pi].onset_sec
    else:
        ref_start = ref_notes[0].offset_beats
        played_start = played_notes[0].onset_sec if played_notes else 0.0
    played_end = played_notes[-1].offset_sec if played_notes else 0.0

    bar_offsets: Dict[int, float] = {}
    for n in ref_notes:
        if n.measure not in bar_offsets or n.offset_beats < bar_offsets[n.measure]:
            bar_offsets[n.measure] = n.offset_beats

    sorted_bars = sorted(bar_offsets.items(), key=lambda x: x[1])
    timings: List[BarTiming] = []

    for idx, (bar_num, offset_beats) in enumerate(sorted_bars):
        start_sec = (offset_beats - ref_start) / beats_per_sec + played_start
        if idx + 1 < len(sorted_bars):
            end_sec = (sorted_bars[idx + 1][1] - ref_start) / beats_per_sec + played_start
        else:
            end_sec = played_end
        timings.append(BarTiming(bar=bar_num, start_sec=round(start_sec, 3), end_sec=round(end_sec, 3)))

    return timings


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

    pairs = _lcs_align(ref_notes, played_notes)
    tempo_bpm = _estimate_tempo(ref_notes, played_notes, pairs)
    beats_per_sec = tempo_bpm / 60.0
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

    bar_timings = _compute_bar_timings(ref_notes, beats_per_sec, played_notes, pairs)

    return AnalysisReport(
        tempo_bpm=tempo_bpm,
        total_ref_notes=len(ref_notes),
        total_played_notes=len(matched_played),
        accuracy=round(accuracy, 3),
        rhythm_accuracy=round(rhythm_accuracy, 3),
        mistakes=mistakes,
        bar_timings=bar_timings,
        summary=summary,
    ).model_dump()
