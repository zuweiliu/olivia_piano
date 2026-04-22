import axios from "axios";
import { AnalysisReport, RefNote, SheetParseResult } from "./types";

const BASE = "/api";

export async function parseSheet(file: File): Promise<SheetParseResult> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await axios.post<SheetParseResult>(`${BASE}/parse-sheet`, form, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 300_000,
  });
  return data;
}

export async function analyze(
  refNotes: RefNote[],
  audio: Blob,
  audioFilename: string
): Promise<AnalysisReport> {
  const form = new FormData();
  form.append("ref_notes", JSON.stringify(refNotes));
  form.append("audio", audio, audioFilename);
  const { data } = await axios.post<AnalysisReport>(`${BASE}/analyze`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}
