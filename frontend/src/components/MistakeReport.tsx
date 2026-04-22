import React, { useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle, Info, Music2 } from "lucide-react";
import { AnalysisReport, Mistake } from "../types";

interface Props {
  report: AnalysisReport;
  totalMeasures: number;
}

const TYPE_COLORS: Record<string, string> = {
  wrong_note: "bg-red-50 border-red-200 text-red-800",
  missing_note: "bg-orange-50 border-orange-200 text-orange-800",
  extra_note: "bg-yellow-50 border-yellow-200 text-yellow-800",
  rhythm: "bg-amber-50 border-amber-200 text-amber-800",
};

const TYPE_BADGE: Record<string, string> = {
  wrong_note: "bg-red-100 text-red-700",
  missing_note: "bg-orange-100 text-orange-700",
  extra_note: "bg-yellow-100 text-yellow-700",
  rhythm: "bg-amber-100 text-amber-700",
};

function ScoreRing({ value, label }: { value: number; label: string }) {
  const pct = Math.round(value * 100);
  const r = 36;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const color = pct >= 90 ? "#22c55e" : pct >= 70 ? "#f59e0b" : "#ef4444";
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="88" height="88" viewBox="0 0 88 88">
        <circle cx="44" cy="44" r={r} fill="none" stroke="#e5e7eb" strokeWidth="8" />
        <circle cx="44" cy="44" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          transform="rotate(-90 44 44)" />
        <text x="44" y="49" textAnchor="middle" fontSize="16" fontWeight="700" fill={color}>{pct}%</text>
      </svg>
      <p className="text-xs font-medium text-gray-500">{label}</p>
    </div>
  );
}

function plainEnglish(m: Mistake): string {
  if (m.type === "wrong_note") {
    return `You played the wrong key. You pressed ${m.played_pitch ?? "?"} but the sheet says ${m.expected_pitch ?? "?"}.`;
  }
  if (m.type === "missing_note") {
    return `You skipped a note. The sheet has ${m.expected_pitch ?? "a note"} here but nothing was heard.`;
  }
  if (m.type === "extra_note") {
    return `You played an extra key (${m.played_pitch ?? "?"}) that isn't in the sheet music.`;
  }
  if (m.type === "rhythm") {
    if (m.detail.includes("too briefly")) return `You let go of ${m.expected_pitch ?? "the key"} too quickly — hold it a bit longer.`;
    if (m.detail.includes("too long")) return `You held ${m.expected_pitch ?? "the key"} too long — release it sooner.`;
  }
  return m.detail;
}

function MeasureMap({ totalMeasures, mistakesByMeasure }: {
  totalMeasures: number;
  mistakesByMeasure: Map<number, Mistake[]>;
}) {
  const [active, setActive] = useState<number | null>(null);
  const count = Math.max(totalMeasures, Math.max(...Array.from(mistakesByMeasure.keys()).filter(k => k > 0), 0));
  if (count < 1) return null;

  return (
    <div className="mb-5">
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
        Bar map — tap a red bar to jump to its mistakes
      </p>
      <div className="flex flex-wrap gap-1">
        {Array.from({ length: count }, (_, i) => i + 1).map((m) => {
          const hasMistake = mistakesByMeasure.has(m);
          const isActive = active === m;
          return (
            <button
              key={m}
              onClick={() => {
                setActive(isActive ? null : m);
                if (!isActive) {
                  document.getElementById(`measure-${m}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                }
              }}
              className={`flex h-8 w-8 items-center justify-center rounded text-xs font-bold transition-all
                ${hasMistake
                  ? isActive
                    ? "bg-red-500 text-white ring-2 ring-red-300 scale-110"
                    : "bg-red-100 text-red-700 hover:bg-red-200"
                  : "bg-gray-100 text-gray-400"
                }`}
            >
              {m}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-xs text-gray-400">
        <span className="inline-block w-3 h-3 rounded bg-red-100 mr-1 align-middle" />red = has mistakes &nbsp;
        <span className="inline-block w-3 h-3 rounded bg-gray-100 mr-1 align-middle" />grey = correct
      </p>
    </div>
  );
}

function groupByMeasure(mistakes: Mistake[]): Map<number, Mistake[]> {
  const map = new Map<number, Mistake[]>();
  for (const m of mistakes) {
    const key = m.measure;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(m);
  }
  return new Map([...map.entries()].sort((a, b) => a[0] - b[0]));
}

export default function MistakeReport({ report, totalMeasures }: Props) {
  const [showGuide, setShowGuide] = useState(false);
  const [showWarnings, setShowWarnings] = useState(false);
  const errorCount = report.mistakes.filter((m) => m.severity === "error").length;
  const warnCount = report.mistakes.filter((m) => m.severity === "warning").length;
  const visibleMistakes = showWarnings ? report.mistakes : report.mistakes.filter((m) => m.severity === "error");
  const grouped = groupByMeasure(visibleMistakes);
  const isPerfect = report.mistakes.length === 0;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100">
          <span className="text-sm font-bold text-indigo-600">3</span>
        </div>
        <h2 className="text-lg font-semibold text-gray-800">Analysis Results</h2>
      </div>

      {isPerfect ? (
        <div className="flex flex-col items-center gap-3 py-8">
          <CheckCircle className="h-16 w-16 text-green-500" />
          <p className="text-xl font-bold text-green-700">Perfect Performance!</p>
          <p className="text-sm text-gray-500">No mistakes detected. Great job!</p>
        </div>
      ) : errorCount === 0 ? (
        <>
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-green-50 p-3 text-sm text-green-700">
            <CheckCircle className="h-4 w-4 flex-shrink-0" />
            <span>No wrong keys — {warnCount} minor warning{warnCount !== 1 ? "s" : ""} only</span>
            <button
              onClick={() => setShowWarnings((v) => !v)}
              className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-200"
            >
              {showWarnings ? "Hide warnings" : "Show warnings"}
            </button>
          </div>
          {showWarnings && (
            <div className="space-y-5">
              {[...grouped.entries()].map(([measure, mistakes]) => (
                <div key={measure} id={`measure-${measure}`}>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-700">
                      {measure > 0 ? measure : "?"}
                    </span>
                    <p className="text-sm font-semibold text-gray-700">
                      {measure === 0 ? "General" : `Bar ${measure}`}
                      {measure > 0 && totalMeasures > 0 && (
                        <span className="ml-2 text-xs font-normal text-gray-400">
                          (row {Math.ceil(measure / 4)}, bar {((measure - 1) % 4) + 1} in that row)
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="space-y-2 pl-8">
                    {mistakes.map((m, i) => (
                      <div key={i} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                        <p className="text-sm font-medium text-amber-800">{plainEnglish(m)}</p>
                        <p className="mt-1 text-xs text-amber-600 opacity-70">beat {m.beat} of bar {measure}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="mb-5 rounded-xl bg-gray-50 p-3 text-center text-sm font-medium text-gray-700">
            {report.summary}
          </div>

          <div className="mb-6 flex items-center justify-around">
            <ScoreRing value={report.accuracy} label="Note Accuracy" />
            <ScoreRing value={report.rhythm_accuracy} label="Rhythm Accuracy" />
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-50">
                <Music2 className="h-7 w-7 text-indigo-500" />
              </div>
              <p className="text-sm font-semibold text-gray-700">{report.tempo_bpm} BPM</p>
              <p className="text-xs text-gray-400">Estimated tempo</p>
            </div>
          </div>

          <div className="mb-4 flex flex-wrap gap-3 text-sm">
            <div className="flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1">
              <span className="text-gray-500">Notes heard:</span>
              <span className="font-semibold text-gray-800">{report.total_played_notes}</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1">
              <span className="text-gray-500">Expected:</span>
              <span className="font-semibold text-gray-800">{report.total_ref_notes}</span>
            </div>
            {errorCount > 0 && (
              <div className="flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1">
                <AlertCircle className="h-3.5 w-3.5 text-red-600" />
                <span className="font-semibold text-red-700">{errorCount} errors</span>
              </div>
            )}
            {warnCount > 0 && (
              <button
                onClick={() => setShowWarnings((v) => !v)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 transition-colors ${
                  showWarnings
                    ? "bg-amber-300 text-amber-900"
                    : "bg-amber-100 text-amber-700 hover:bg-amber-200"
                }`}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                <span className="font-semibold">
                  {warnCount} warning{warnCount !== 1 ? "s" : ""}
                </span>
                <span className="text-xs opacity-70">{showWarnings ? "(hide)" : "(show)"}</span>
              </button>
            )}
          </div>

          {/* Beginner guide toggle */}
          <button
            onClick={() => setShowGuide(!showGuide)}
            className="mb-4 flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800"
          >
            <Info className="h-3.5 w-3.5" />
            {showGuide ? "Hide" : "How do I find the bar on the sheet music?"}
          </button>
          {showGuide && (
            <div className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-900 space-y-2">
              <p><strong>What is a bar (measure)?</strong> Sheet music is divided into sections by vertical lines called <em>bar lines</em>. Each section between two bar lines is one bar (also called a measure). They are counted left-to-right, top-to-bottom.</p>
              <div className="font-mono bg-white rounded p-2 text-xs text-gray-700 leading-relaxed">
                | Bar 1 | Bar 2 | Bar 3 | Bar 4 |<br/>
                | Bar 5 | Bar 6 | Bar 7 | Bar 8 |
              </div>
              <p>So <strong>"Bar 8"</strong> = count 8 sections from the very start of the piece. On a typical sheet with 4 bars per row, bar 8 is the <strong>last bar on the 2nd row</strong>.</p>
              <p><strong>What is beat 1.0?</strong> Each bar has beats (usually 4 counts). Beat 1 is the <strong>first note in that bar</strong>.</p>
            </div>
          )}

          <MeasureMap totalMeasures={totalMeasures} mistakesByMeasure={grouped} />

          <div className="space-y-5">
            {[...grouped.entries()].map(([measure, mistakes]) => (
              <div key={measure} id={`measure-${measure}`}>
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-xs font-bold text-red-700">
                    {measure > 0 ? measure : "?"}
                  </span>
                  <p className="text-sm font-semibold text-gray-700">
                    {measure === 0 ? "General" : `Bar ${measure}`}
                    {measure > 0 && totalMeasures > 0 && (
                      <span className="ml-2 text-xs font-normal text-gray-400">
                        (row {Math.ceil(measure / 4)}, bar {((measure - 1) % 4) + 1} in that row)
                      </span>
                    )}
                  </p>
                </div>
                <div className="space-y-2 pl-8">
                  {mistakes.map((m, i) => (
                    <div
                      key={i}
                      className={`rounded-lg border p-3 ${
                        TYPE_COLORS[m.type] ?? "bg-gray-50 border-gray-200 text-gray-800"
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TYPE_BADGE[m.type] ?? "bg-gray-100 text-gray-700"}`}>
                          {m.type === "wrong_note" ? "Wrong key" :
                           m.type === "missing_note" ? "Missed note" :
                           m.type === "extra_note" ? "Extra key" : "Timing"}
                        </span>
                        {m.severity === "error"
                          ? <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                          : <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />}
                      </div>
                      <p className="text-sm font-medium leading-snug">{plainEnglish(m)}</p>
                      <p className="mt-1 text-xs opacity-60">beat {m.beat} of bar {measure}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
