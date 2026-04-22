import React, { useState } from "react";
import { Piano } from "lucide-react";
import SheetUpload from "./components/SheetUpload";
import AudioInput from "./components/AudioInput";
import MistakeReport from "./components/MistakeReport";
import { AnalysisReport, RefNote, SheetParseResult } from "./types";

export default function App() {
  const [refNotes, setRefNotes] = useState<RefNote[] | null>(null);
  const [totalMeasures, setTotalMeasures] = useState<number>(0);
  const [report, setReport] = useState<AnalysisReport | null>(null);

  function handleParsed(result: SheetParseResult) {
    setRefNotes(result.ref_notes);
    setTotalMeasures(result.measures);
    setReport(null);
  }

  function handleReport(r: AnalysisReport) {
    setReport(r);
    setTimeout(() => {
      document.getElementById("results")?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-gray-50">
      <header className="border-b border-indigo-100 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600">
            <Piano className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-gray-900">Piano Coach</h1>
            <p className="text-xs text-gray-400">Practice feedback for Olivia</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-5 px-4 py-6 pb-16">
        <SheetUpload onParsed={handleParsed} />
        <AudioInput refNotes={refNotes} onReport={handleReport} />
        {report && (
          <div id="results">
            <MistakeReport report={report} totalMeasures={totalMeasures} />
          </div>
        )}
      </main>

      <footer className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-sm border-t border-gray-100 py-2 text-center text-xs text-gray-400">
        Note accuracy · Rhythm analysis · Supports image, MusicXML, M4A, MP3, WAV
      </footer>
    </div>
  );
}
