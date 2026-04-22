import React, { useEffect, useRef, useState, useCallback } from "react";
import { OpenSheetMusicDisplay as OSMD } from "opensheetmusicdisplay";
import type { BarTiming } from "../types";

interface Props {
  musicxmlB64: string;
  audioUrl: string;
  barTimings: BarTiming[];
  onBarChange?: (bar: number) => void;
}

interface MeasureBox {
  x: number; y: number; w: number; h: number;
}

export default function SheetPlayer({
  musicxmlB64,
  audioUrl,
  barTimings,
  onBarChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OSMD | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const [currentBar, setCurrentBar] = useState<number>(0);
  const lastBarRef = useRef<number>(0);
  const [barsPerRow, setBarsPerRow] = useState(5);
  const [osmdReady, setOsmdReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [totalMeasuresFound, setTotalMeasuresFound] = useState(0);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [debugTime, setDebugTime] = useState("");

  // Map of measure number → pixel bounding box (relative to osmd-container)
  const measureBoxes = useRef<Map<number, MeasureBox>>(new Map());

  // Decode base64 → Blob (works for both MXL zip and plain MusicXML)
  const musicBlob = React.useMemo(() => {
    try {
      const binary = atob(musicxmlB64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new Blob([bytes]);
    } catch {
      return null;
    }
  }, [musicxmlB64]);

  // Initialize and render OSMD
  useEffect(() => {
    if (!containerRef.current || !musicBlob) return;
    setOsmdReady(false);

    const osmd = new OSMD(containerRef.current, {
      autoResize: false,
      drawTitle: true,
      drawComposer: true,
      drawPartNames: false,
      drawMeasureNumbers: true,
      backend: "svg",
      followCursor: false,
    });

    osmdRef.current = osmd;

    setLoadError(null);
    osmd
      .load(musicBlob)
      .then(() => {
        if (barsPerRow > 0) {
          osmd.EngravingRules.RenderXMeasuresPerLineAkaSystem = barsPerRow;
          // At zoom 1.0, ~2 bars fit. Scale zoom to fit requested bars.
          osmd.zoom = 2 / barsPerRow;
        }
        osmd.render();

        // Extract measure bounding boxes from the rendered SVG
        try {
          const boxes = new Map<number, MeasureBox>();
          const graphic = osmd.GraphicSheet;
          const unitPx = 10 * osmd.zoom;
          if (graphic) {
            for (const page of graphic.MusicPages) {
              for (const system of page.MusicSystems) {
                for (const staffLine of system.StaffLines) {
                  for (const measure of staffLine.Measures as any[]) {
                    const mNum: number = measure.MeasureNumber;
                    const ps = measure.PositionAndShape;
                    if (!ps || boxes.has(mNum)) continue;
                    const abs = ps.AbsolutePosition;
                    const sz = ps.Size;
                    boxes.set(mNum, {
                      x: abs.x * unitPx,
                      y: abs.y * unitPx,
                      w: sz.width * unitPx,
                      h: sz.height * unitPx,
                    });
                  }
                }
              }
            }
          }
          measureBoxes.current = boxes;
          setTotalMeasuresFound(boxes.size);
          console.log(`OSMD: ${boxes.size} measure boxes built`, [...boxes.entries()].slice(0, 3));
        } catch (e) {
          console.warn("Measure box extraction failed:", e);
        }

        setOsmdReady(true);
      })
      .catch((err: unknown) => {
        console.error("OSMD load error:", err);
        setLoadError(String(err));
      });

    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
      osmdRef.current = null;
    };
  }, [musicBlob, barsPerRow]);

  // Map current time → bar number
  const timeToBar = useCallback(
    (t: number): number => {
      if (!barTimings.length) return 0;
      for (let i = barTimings.length - 1; i >= 0; i--) {
        if (t >= barTimings[i].start_sec) return barTimings[i].bar;
      }
      return barTimings[0].bar;
    },
    [barTimings],
  );

  // Position highlight overlay on the target measure
  const goToMeasure = useCallback(
    (bar: number) => {
      const hl = highlightRef.current;
      if (!hl || !osmdReady) return;

      const box = measureBoxes.current.get(bar);
      if (!box) {
        hl.style.display = "none";
        return;
      }

      hl.style.display = "block";
      hl.style.left = `${box.x}px`;
      hl.style.top = `${box.y}px`;
      hl.style.width = `${box.w}px`;
      hl.style.height = `${box.h}px`;

      // Scroll within the container to keep highlight visible
      if (scrollRef.current) {
        const scrollBox = scrollRef.current;
        const hlTop = box.y;
        const hlBot = box.y + box.h;
        const visTop = scrollBox.scrollTop;
        const visBot = visTop + scrollBox.clientHeight;

        if (hlBot > visBot || hlTop < visTop) {
          scrollBox.scrollTo({
            top: Math.max(0, hlTop - scrollBox.clientHeight / 3),
            behavior: "smooth",
          });
        }
      }
    },
    [osmdReady],
  );

  // Update cursor when bar changes
  useEffect(() => {
    if (currentBar > 0) {
      goToMeasure(currentBar);
      onBarChange?.(currentBar);
    }
  }, [currentBar, goToMeasure, onBarChange]);

  // Audio timeupdate → track bar (use ref to avoid stale closure)
  const onTimeUpdate = (e: React.SyntheticEvent<HTMLAudioElement>) => {
    const t = e.currentTarget.currentTime;
    const bar = timeToBar(t);
    setDebugTime(`t=${t.toFixed(1)}s → bar ${bar}`);
    if (bar !== lastBarRef.current) {
      lastBarRef.current = bar;
      setCurrentBar(bar);
    }
  };

  return (
    <div className="space-y-3">
      {/* Top bar: current bar badge + bars/row control */}
      <div className="flex items-center gap-3">
        {currentBar > 0 && (
          <div className="flex items-center gap-1 rounded-full bg-indigo-100 px-3 py-1.5 animate-pulse">
            <span className="text-sm font-bold text-indigo-700">
              ▶ Bar {currentBar}
            </span>
          </div>
        )}
        {osmdReady && totalMeasuresFound > 0 && (
          <span className="text-xs text-gray-400">{totalMeasuresFound} bars rendered</span>
        )}
        {debugTime && (
          <span className="text-xs font-mono text-gray-400">{debugTime}</span>
        )}
        {barTimings.length > 0 && (
          <span className="text-xs font-mono text-gray-400">
            timings: {barTimings.slice(0, 3).map(b => `bar${b.bar}@${b.start_sec}s`).join(", ")}…
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <label className="text-xs text-gray-400">Bars/row:</label>
          <input
            type="number"
            min={1}
            max={8}
            value={barsPerRow}
            onChange={(e) =>
              setBarsPerRow(Math.max(1, Math.min(8, parseInt(e.target.value) || 4)))
            }
            className="w-12 rounded border border-gray-300 px-1.5 py-0.5 text-center text-xs"
          />
        </div>
      </div>

      {/* Audio player — native controls for reliable playback */}
      <div className="rounded-lg border-2 border-indigo-200 bg-indigo-50 p-2">
        <p className="mb-1 text-xs font-semibold text-indigo-600">
          🎵 Play here to see bar tracking on the sheet:
        </p>
        <audio
          ref={audioRef}
          src={audioUrl}
          onTimeUpdate={onTimeUpdate}
          onError={() => setAudioError(`Failed to load audio (src: ${audioUrl?.slice(0, 50)}…)`)}
          controls
          className="w-full h-10 rounded-lg"
          preload="auto"
        />
        {audioError && (
          <p className="mt-1 text-xs text-red-500">{audioError}</p>
        )}
        {!audioUrl && (
          <p className="mt-1 text-xs text-red-500 font-bold">⚠ No audio URL — upload or record audio before analysis</p>
        )}
      </div>

      {/* Sheet music display */}
      <div
        ref={scrollRef}
        className="overflow-y-auto max-h-[500px] rounded-xl border border-gray-200 bg-white p-2"
      >
        {!osmdReady && !loadError && (
          <div className="flex items-center justify-center py-12 text-gray-400 text-sm gap-2">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            Rendering sheet music…
          </div>
        )}
        {loadError && (
          <div className="py-8 text-center text-sm text-red-600">
            Failed to render sheet: {loadError}
          </div>
        )}
        <div style={{ position: "relative" }}>
          <div ref={containerRef} className="osmd-container" />
          <div
            ref={highlightRef}
            style={{
              display: "none",
              position: "absolute",
              backgroundColor: "rgba(79, 70, 229, 0.2)",
              border: "2px solid rgba(79, 70, 229, 0.5)",
              borderRadius: "4px",
              pointerEvents: "none",
              transition: "left 0.2s, top 0.2s, width 0.2s",
              zIndex: 10,
            }}
          />
        </div>
      </div>
    </div>
  );
}
