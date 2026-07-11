"use client";

import { Camera, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { preloadDocumentScanner } from "@/lib/opencv-loader";
import { CornerAdjust } from "./CornerAdjust";
import { Button } from "./ui";

/**
 * In-app document scanner, CamScanner-style:
 * 1. Live camera with a light guide frame (visual aid only).
 * 2. Capture the FULL frame at native resolution.
 * 3. CornerAdjust: automatic paper detection (opencv.js + jscanify) proposes
 *    the page's 4 corners; the user can drag-adjust; confirming applies a
 *    perspective warp that flattens the page into a clean rectangular scan.
 * Falls back to the native camera input when getUserMedia isn't available.
 */
export function CameraCapture({
  onCapture,
  onClose,
}: {
  onCapture: (file: File) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fallbackRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [captured, setCaptured] = useState<File | null>(null);

  // Start downloading/initializing opencv.js while the user frames the shot,
  // so detection is (usually) instant by the time they hit capture.
  useEffect(() => {
    preloadDocumentScanner();
  }, []);

  useEffect(() => {
    // Pause the stream while adjusting corners; resume on retake.
    if (captured) return;
    let active = true;
    navigator.mediaDevices
      ?.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      })
      .then((stream) => {
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setReady(true);
      })
      .catch(() =>
        setError(
          "Impossible d'accéder à la caméra. Autorisez l'accès ou importez un fichier."
        )
      );
    return () => {
      active = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [captured]);

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    // Full frame — the auto-detection in CornerAdjust finds the paper, so we
    // no longer crop to a fixed guide rectangle.
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setCaptured(new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.95
    );
  }

  function onFallback(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    // Native camera photos also go through detection + corner adjustment.
    if (f) setCaptured(f);
  }

  function finish(file: File) {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    onCapture(file);
  }

  if (captured) {
    return (
      <CornerAdjust
        file={captured}
        onDone={finish}
        onRetake={() => setCaptured(null)}
        onCancel={onClose}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black">
      <input
        ref={fallbackRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onFallback}
      />

      <div className="relative flex-1 overflow-hidden">
        {!error ? (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-contain"
            />
            {/* Light guide frame — a framing aid; actual page edges are
                auto-detected after capture. */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div
                className="relative rounded-lg border-2 border-dashed border-white/50"
                style={{ width: "86%", maxWidth: 520, aspectRatio: "1 / 1.414" }}
              />
            </div>
            <p className="absolute inset-x-0 top-5 text-center text-sm font-medium text-white">
              Cadrez la facture — les bords seront détectés automatiquement
            </p>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center text-white">
            <p className="text-sm text-white/80">{error}</p>
            <Button variant="outline" onClick={() => fallbackRef.current?.click()}>
              <Camera size={16} /> Utiliser la caméra du téléphone
            </Button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between bg-black px-8 py-5">
        <button
          onClick={onClose}
          className="rounded-full p-3 text-white/80 hover:bg-white/10"
          aria-label="Fermer"
        >
          <X size={24} />
        </button>
        {!error && (
          <button
            onClick={capture}
            disabled={!ready}
            aria-label="Capturer"
            className="h-16 w-16 rounded-full border-4 border-white bg-white/20 disabled:opacity-40"
          />
        )}
        <button
          onClick={() => fallbackRef.current?.click()}
          className="rounded-full p-3 text-white/80 hover:bg-white/10"
          aria-label="Importer une photo"
        >
          <RotateCcw size={24} />
        </button>
      </div>
    </div>
  );
}
