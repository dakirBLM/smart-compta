"use client";

import { Camera, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "./ui";

/**
 * In-app guided document camera. Shows the live camera with a document frame
 * so the user aligns the invoice, then captures and CROPS to that frame — so
 * you get the paper, not a whole-scene photo. Falls back to the native file
 * input when the camera isn't available (desktop without webcam, denied perms).
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

  useEffect(() => {
    let active = true;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })
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
    };
  }, []);

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    // Crop a centered A4-portrait region (the guide frame) ≈ the paper.
    const frameH = vh * 0.9;
    const frameW = Math.min(vw * 0.9, frameH / 1.414);
    const sx = (vw - frameW) / 2;
    const sy = (vh - frameH) / 2;
    const canvas = document.createElement("canvas");
    canvas.width = frameW;
    canvas.height = frameH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, sx, sy, frameW, frameH, 0, 0, frameW, frameH);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        streamRef.current?.getTracks().forEach((t) => t.stop());
        onCapture(new File([blob], `scan-${Date.now()}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.9
    );
  }

  function onFallback(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) onCapture(f);
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
              /* contain: the whole frame is visible, so the guide rectangle
                 matches the centered region we crop on capture */
              className="h-full w-full object-contain"
            />
            {/* Document guide frame */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div
                className="relative rounded-lg border-2 border-white/80 shadow-[0_0_0_100vmax_rgba(0,0,0,0.45)]"
                style={{ width: "86%", maxWidth: 520, aspectRatio: "1 / 1.414" }}
              >
                {/* corner accents */}
                {["-top-0.5 -left-0.5 border-t-4 border-l-4",
                  "-top-0.5 -right-0.5 border-t-4 border-r-4",
                  "-bottom-0.5 -left-0.5 border-b-4 border-l-4",
                  "-bottom-0.5 -right-0.5 border-b-4 border-r-4"].map((c, i) => (
                  <span key={i} className={`absolute h-6 w-6 border-success ${c}`} />
                ))}
              </div>
            </div>
            <p className="absolute inset-x-0 top-5 text-center text-sm font-medium text-white">
              Alignez la facture dans le cadre
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
        <button onClick={onClose} className="rounded-full p-3 text-white/80 hover:bg-white/10" aria-label="Fermer">
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
          aria-label="Reprendre / importer"
        >
          <RotateCcw size={24} />
        </button>
      </div>
    </div>
  );
}
