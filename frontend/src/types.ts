export interface RefNote {
  pitch_midi: number;
  pitch_name: string;
  offset_beats: number;
  duration_beats: number;
  measure: number;
  beat_in_measure: number;
}

export interface SheetParseResult {
  ref_notes: RefNote[];
  notes_count: number;
  measures: number;
  summary: string;
  musicxml_b64?: string;
}

export type MistakeType = "wrong_note" | "missing_note" | "extra_note" | "rhythm";

export interface Mistake {
  type: MistakeType;
  measure: number;
  beat: number;
  expected_pitch: string | null;
  played_pitch: string | null;
  detail: string;
  severity: "error" | "warning";
}

export interface AnalysisReport {
  tempo_bpm: number;
  total_ref_notes: number;
  total_played_notes: number;
  accuracy: number;
  rhythm_accuracy: number;
  mistakes: Mistake[];
  summary: string;
}
