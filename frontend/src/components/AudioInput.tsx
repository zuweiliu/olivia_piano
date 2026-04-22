import React, { useRef, useState } from "react";
import axios from "axios";
import {
  Mic,
  MicOff,
  Square,
  Upload,
  FileAudio,
  Loader2,
  Download,
} from "lucide-react";
import { RefNote } from "../types";
import { analyze } from "../api";
import type { AnalysisReport } from "../types";

interface Props {
  refNotes: RefNote[] | null;
  onReport: (report: AnalysisReport) => void;
  onAudioReady?: (url: string) => void;
}

const AUDIO_ACCEPT = ".wav,.mp3,.m4a,.aac,.ogg,.flac,.webm,.mp4,.aiff";

export default function AudioInput({ refNotes, onReport, onAudioReady }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const [tab, setTab] = useState<"upload" | "record">("upload");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const disabled = !refNotes;

  async function startRecording() {
    setError(null);
    setRecordedBlob(null);
    setRecordedUrl(null);
    setSeconds(0);
    chunksRef.current = [];

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Microphone access denied. Please allow microphone in browser settings.");
      return;
    }

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/mp4")
      ? "audio/mp4"
      : "audio/webm";

    const recorder = new MediaRecorder(stream, { mimeType });
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      setRecordedBlob(blob);
      const url = URL.createObjectURL(blob);
      setRecordedUrl(url);
      onAudioReady?.(url);
      stream.getTracks().forEach((t) => t.stop());
    };

    recorder.start(100);
    setRecording(true);
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  }

  async function runAnalysis() {
    if (!refNotes) return;
    setError(null);
    setLoading(true);

    let blob: Blob;
    let filename: string;

    if (tab === "upload" && audioFile) {
      blob = audioFile;
      filename = audioFile.name;
    } else if (tab === "record" && recordedBlob) {
      blob = recordedBlob;
      const ext = recordedBlob.type.includes("mp4") ? "m4a" : "webm";
      filename = `recording.${ext}`;
    } else {
      setError("Please upload or record audio first.");
      setLoading(false);
      return;
    }

    try {
      const report = await analyze(refNotes, blob, filename);
      onReport(report);
    } catch (e: unknown) {
      let msg = "Analysis failed. Please try again.";
      if (axios.isAxiosError(e)) {
        msg = e.response?.data?.detail ?? e.message ?? msg;
      } else if (e instanceof Error) {
        msg = e.message;
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  const hasAudio =
    (tab === "upload" && !!audioFile) || (tab === "record" && !!recordedBlob);

  return (
    <div
      className={`rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-opacity ${
        disabled ? "opacity-50" : ""
      }`}
    >
      <div className="mb-4 flex items-center gap-2">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-full ${
            disabled ? "bg-gray-100" : "bg-indigo-100"
          }`}
        >
          <span className={`text-sm font-bold ${disabled ? "text-gray-400" : "text-indigo-600"}`}>
            2
          </span>
        </div>
        <h2 className="text-lg font-semibold text-gray-800">Provide Audio</h2>
        {disabled && (
          <span className="ml-auto text-xs text-gray-400">Complete step 1 first</span>
        )}
      </div>

      <div className="mb-4 flex rounded-lg bg-gray-100 p-1">
        <button
          className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
            tab === "upload"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
          onClick={() => setTab("upload")}
          disabled={disabled}
        >
          Upload Recording
        </button>
        <button
          className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
            tab === "record"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
          onClick={() => setTab("record")}
          disabled={disabled}
        >
          Record from Mic
        </button>
      </div>

      {tab === "upload" && (
        <div>
          <div
            className="cursor-pointer rounded-xl border-2 border-dashed border-gray-300 p-6 text-center hover:border-indigo-300 hover:bg-gray-50"
            onClick={() => !disabled && fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={AUDIO_ACCEPT}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setAudioFile(f);
                  onAudioReady?.(URL.createObjectURL(f));
                }
              }}
            />
            {audioFile ? (
              <div className="flex flex-col items-center gap-2">
                <FileAudio className="h-8 w-8 text-indigo-400" />
                <p className="text-sm font-medium text-gray-700">{audioFile.name}</p>
                <p className="text-xs text-gray-400">
                  {(audioFile.size / 1024 / 1024).toFixed(1)} MB
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-8 w-8 text-gray-300" />
                <p className="text-sm text-gray-500">
                  Drop audio file or <span className="text-indigo-600">browse</span>
                </p>
                <p className="text-xs text-gray-400">M4A · MP3 · WAV · AAC · WEBM</p>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "record" && (
        <div className="flex flex-col items-center gap-4 py-4">
          {!recording && !recordedBlob && (
            <button
              onClick={startRecording}
              disabled={disabled}
              className="flex h-20 w-20 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg hover:bg-indigo-700 disabled:opacity-50 active:scale-95 transition-transform"
            >
              <Mic className="h-8 w-8" />
            </button>
          )}

          {recording && (
            <>
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-500 text-white shadow-lg animate-pulse">
                <MicOff className="h-8 w-8" />
              </div>
              <p className="text-sm font-medium text-red-600">
                Recording… {String(Math.floor(seconds / 60)).padStart(2, "0")}:
                {String(seconds % 60).padStart(2, "0")}
              </p>
              <button
                onClick={stopRecording}
                className="flex items-center gap-2 rounded-lg bg-gray-800 px-4 py-2 text-sm text-white hover:bg-gray-700"
              >
                <Square className="h-4 w-4" />
                Stop Recording
              </button>
            </>
          )}

          {recordedBlob && recordedUrl && !recording && (
            <div className="w-full space-y-3">
              <audio controls src={recordedUrl} className="w-full" />
              <p className="text-center text-xs text-gray-500">
                {(recordedBlob.size / 1024).toFixed(0)} KB ·{" "}
                {String(Math.floor(seconds / 60)).padStart(2, "0")}:
                {String(seconds % 60).padStart(2, "0")}
              </p>
              <button
                onClick={() => {
                  const ext = recordedBlob.type.includes("mp4") ? "m4a" : "webm";
                  const a = document.createElement("a");
                  a.href = recordedUrl;
                  a.download = `recording-${new Date().toISOString().slice(0,19).replace(/[:T]/g, "-")}.${ext}`;
                  a.click();
                }}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-green-50 border border-green-200 py-2 text-sm font-medium text-green-700 hover:bg-green-100"
              >
                <Download className="h-4 w-4" />
                Save recording — re-upload next time instead of playing again
              </button>
              <button
                onClick={startRecording}
                className="w-full rounded-lg border border-gray-300 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                Re-record
              </button>
            </div>
          )}

          {!recording && !recordedBlob && (
            <p className="text-xs text-gray-400">
              Tap the button above and start playing
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <button
        onClick={runAnalysis}
        disabled={disabled || !hasAudio || loading}
        className="mt-4 w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Analyzing…
          </span>
        ) : (
          "Analyze Playing"
        )}
      </button>
    </div>
  );
}
