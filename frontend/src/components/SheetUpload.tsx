import React, { useRef, useState } from "react";
import axios from "axios";
import { CheckCircle, Download, FileMusic, Loader2, Upload } from "lucide-react";
import { SheetParseResult } from "../types";
import { parseSheet } from "../api";

interface Props {
  onParsed: (result: SheetParseResult) => void;
}

const ACCEPTED = ".jpg,.jpeg,.png,.heic,.heif,.bmp,.tiff,.webp,.xml,.musicxml,.mxl";

export default function SheetUpload({ onParsed }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SheetParseResult | null>(null);

  const isImage = (name: string) =>
    /\.(jpg|jpeg|png|heic|heif|bmp|tiff|webp)$/i.test(name);

  function downloadMusicXML(b64: string, baseName: string) {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: "application/vnd.recordare.musicxml+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = baseName.replace(/\.[^.]+$/, "") + ".musicxml";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleFile(file: File) {
    setError(null);
    setResult(null);
    setFileName(file.name);

    if (isImage(file.name)) {
      setPreview(URL.createObjectURL(file));
    } else {
      setPreview(null);
    }

    setLoading(true);
    try {
      const res = await parseSheet(file);
      setResult(res);
      onParsed(res);
    } catch (e: unknown) {
      let msg = "Failed to parse sheet music.";
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

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100">
          <span className="text-sm font-bold text-indigo-600">1</span>
        </div>
        <h2 className="text-lg font-semibold text-gray-800">Upload Sheet Music</h2>
      </div>

      <p className="mb-4 text-sm text-gray-500">
        Take a photo of the sheet music with your iPhone, or export a MusicXML file from
        MuseScore / Sibelius.
      </p>

      <div
        className={`relative cursor-pointer rounded-xl border-2 border-dashed transition-colors ${
          dragging
            ? "border-indigo-400 bg-indigo-50"
            : "border-gray-300 hover:border-indigo-300 hover:bg-gray-50"
        }`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />

        {preview ? (
          <div className="p-3">
            <img
              src={preview}
              alt="Sheet music preview"
              className="mx-auto max-h-48 rounded-lg object-contain"
            />
            <p className="mt-2 text-center text-xs text-gray-400">{fileName}</p>
          </div>
        ) : fileName && !isImage(fileName) ? (
          <div className="flex flex-col items-center gap-2 py-10">
            <FileMusic className="h-10 w-10 text-indigo-400" />
            <p className="text-sm font-medium text-gray-700">{fileName}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-10">
            <Upload className="h-10 w-10 text-gray-300" />
            <div className="text-center">
              <p className="text-sm font-medium text-gray-600">
                Drop file here or <span className="text-indigo-600">browse</span>
              </p>
              <p className="mt-1 text-xs text-gray-400">
                JPG · PNG · HEIC (photo) &nbsp;|&nbsp; MusicXML · MXL (export)
              </p>
            </div>
          </div>
        )}
      </div>

      {loading && (
        <div className="mt-4 flex items-center gap-2 text-sm text-indigo-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Parsing sheet music with OMR… this takes 1–3 minutes for a full page</span>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-4 rounded-lg bg-green-50 p-3">
          <div className="flex items-center gap-2 text-sm text-green-700">
            <CheckCircle className="h-4 w-4 flex-shrink-0" />
            <span>{result.summary}</span>
          </div>
          {result.musicxml_b64 && (
            <button
              onClick={() => downloadMusicXML(result.musicxml_b64!, fileName ?? "sheet")}
              className="mt-2 flex items-center gap-1.5 rounded-lg bg-green-100 px-3 py-1.5 text-xs font-medium text-green-800 hover:bg-green-200 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Download MusicXML — upload this next time for instant results
            </button>
          )}
        </div>
      )}

      <div className="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-700">
        <strong>Photo tips:</strong> Well-lit · Straight-on (no angle) · No shadows · Full page visible
      </div>
    </div>
  );
}
