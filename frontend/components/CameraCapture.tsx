"use client";

import { Camera, RotateCcw, X, Zap, ZapOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { loadDocumentScanner, preloadDocumentScanner, ScannerLibs } from "@/lib/opencv-loader";
import { CornerAdjust } from "./CornerAdjust";
import { Button } from "./ui";

type Point = { x: number; y: number };

// Live-detection tuning (frames are downscaled before detection to stay
// smooth on mid-range phones).
const TICK_MS = 180; // ~5-6 detections/sec
const DETECT_MAX_SIDE = 420;
const MIN_AREA_RATIO = 0.12; // quad must cover >= 12% of the frame
const STABLE_TICKS = 7; // ~1.3s of holding steady triggers auto-capture
const MOVE_THRESHOLD_RATIO = 0.02; // corners may drift <= 2% of frame/tick
const AUTO_COOLDOWN_MS = 1500; // grace period after (re)entering the camera

/**
 * In-app document scanner, CamScanner-style, with LIVE detection:
 * 1. The camera feed is analyzed continuously (opencv.js + jscanify on
 *    downscaled frames): the detected page outline is drawn over the video.
 * 2. Auto mode: hold the phone steady over the document for ~1.5s and the
 *    photo is captured automatically — no button press needed.
 * 3. The captured full-res frame then goes through CornerAdjust (auto corners
 *    + drag refinement + perspective flatten) before being returned.
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
  const videoBoxRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fallbackRef = useRef<HTMLInputElement>(null);

  const libsRef = useRef<ScannerLibs | null>(null);
  const scannerRef = useRef<InstanceType<ScannerLibs["JScanify"]> | null>(null);
  const procCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const busyRef = useRef(false);
  const prevCornersRef = useRef<Point[] | null>(null);
  const stableCountRef = useRef(0);
  const armedAtRef = useRef(0); // timestamp when auto-capture became allowed
  const firedRef = useRef(false);

  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [captured, setCaptured] = useState<File | null>(null);
  const [liveQuad, setLiveQuad] = useState<Point[] | null>(null); // display coords
  const [stableProgress, setStableProgress] = useState(0); // 0..1
  const [autoMode, setAutoMode] = useState(true);
  const [liveReady, setLiveReady] = useState(false);

  // Load the CV engine as soon as the scanner opens; live detection starts
  // the moment it's ready (usually before the user has even framed the shot,
  // thanks to long-term caching of opencv.js).
  useEffect(() => {
    preloadDocumentScanner();
    let mounted = true;
    loadDocumentScanner()
      .then((libs) => {
        if (!mounted) return;
        libsRef.current = libs;
        scannerRef.current = new libs.JScanify();
        setLiveReady(true);
      })
      .catch(() => {
        /* live overlay unavailable — manual capture still works */
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    // Pause the stream while adjusting corners; resume on retake.
    if (captured) return;
    let active = true;
    firedRef.current = false;
    stableCountRef.current = 0;
    prevCornersRef.current = null;
    armedAtRef.current = Date.now() + AUTO_COOLDOWN_MS;
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

  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || firedRef.current) return;
    firedRef.current = true;
    // Full frame — CornerAdjust re-runs detection at full resolution.
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      firedRef.current = false;
      return;
    }
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          firedRef.current = false;
          return;
        }
        setLiveQuad(null);
        setStableProgress(0);
        setCaptured(new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.95
    );
  }, []);

  // ---- live detection loop ------------------------------------------------
  useEffect(() => {
    if (!liveReady || captured || error) return;
    const timer = setInterval(() => {
      const video = videoRef.current;
      const box = videoBoxRef.current;
      const libs = libsRef.current;
      const scanner = scannerRef.current;
      if (busyRef.current || !video || !video.videoWidth || !box || !libs || !scanner) return;
      busyRef.current = true;
      try {
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        const scale = Math.min(1, DETECT_MAX_SIDE / Math.max(vw, vh));
        const pw = Math.round(vw * scale);
        const ph = Math.round(vh * scale);
        let proc = procCanvasRef.current;
        if (!proc) {
          proc = document.createElement("canvas");
          procCanvasRef.current = proc;
        }
        if (proc.width !== pw || proc.height !== ph) {
          proc.width = pw;
          proc.height = ph;
        }
        const ctx = proc.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, pw, ph);

        const cv = libs.cv;
        const mat = cv.imread(proc);
        let contour: any = null;
        let quadVideo: Point[] | null = null;
        try {
          contour = scanner.findPaperContour(mat);
          if (contour) {
            const pts = scanner.getCornerPoints(contour);
            const { topLeftCorner: tl, topRightCorner: tr, bottomRightCorner: br, bottomLeftCorner: bl } = pts;
            if (tl && tr && br && bl) {
              const quadProc = [tl, tr, br, bl];
              if (polyArea(quadProc) >= pw * ph * MIN_AREA_RATIO) {
                quadVideo = quadProc.map((p) => ({ x: p.x / scale, y: p.y / scale }));
              }
            }
          }
        } finally {
          contour?.delete?.();
          mat.delete();
        }

        if (!quadVideo) {
          prevCornersRef.current = null;
          stableCountRef.current = 0;
          setLiveQuad(null);
          setStableProgress(0);
          return;
        }

        // ---- stability tracking (for the auto-shutter) ----
        const prev = prevCornersRef.current;
        const moveLimit = Math.max(vw, vh) * MOVE_THRESHOLD_RATIO;
        if (
          prev &&
          quadVideo.every((p, i) => Math.hypot(p.x - prev[i].x, p.y - prev[i].y) <= moveLimit)
        ) {
          stableCountRef.current += 1;
        } else {
          stableCountRef.current = 0;
        }
        prevCornersRef.current = quadVideo;

        // ---- map video coords -> displayed coords (object-contain) ----
        const bw = box.clientWidth;
        const bh = box.clientHeight;
        const s = Math.min(bw / vw, bh / vh);
        const offX = (bw - vw * s) / 2;
        const offY = (bh - vh * s) / 2;
        setLiveQuad(quadVideo.map((p) => ({ x: offX + p.x * s, y: offY + p.y * s })));

        const progress = Math.min(1, stableCountRef.current / STABLE_TICKS);
        setStableProgress(autoMode ? progress : 0);

        if (
          autoMode &&
          stableCountRef.current >= STABLE_TICKS &&
          Date.now() >= armedAtRef.current &&
          !firedRef.current
        ) {
          capture();
        }
      } finally {
        busyRef.current = false;
      }
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [liveReady, captured, error, autoMode, capture]);

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

  const statusText = error
    ? ""
    : !liveReady
      ? "Cadrez la facture — chargement de la détection…"
      : liveQuad
        ? autoMode
          ? stableProgress > 0
            ? "Ne bougez plus…"
            : "Document détecté — maintenez stable"
          : "Document détecté"
        : "Recherche du document…";

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

      <div ref={videoBoxRef} className="relative flex-1 overflow-hidden">
        {!error ? (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-contain"
            />

            {/* Live detected page outline */}
            {liveQuad && (
              <svg className="pointer-events-none absolute inset-0 h-full w-full">
                <polygon
                  points={liveQuad.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill={
                    stableProgress >= 1
                      ? "rgba(34,197,94,0.30)"
                      : "rgba(34,197,94,0.14)"
                  }
                  stroke="#22C55E"
                  strokeWidth={3}
                />
              </svg>
            )}

            {/* Auto-capture progress */}
            {autoMode && stableProgress > 0 && (
              <div className="absolute inset-x-10 top-14">
                <div className="h-1.5 overflow-hidden rounded-full bg-white/25">
                  <div
                    className="h-full rounded-full bg-success transition-[width] duration-150"
                    style={{ width: `${Math.round(stableProgress * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {statusText && (
              <p className="absolute inset-x-0 top-5 text-center text-sm font-medium text-white drop-shadow">
                {statusText}
              </p>
            )}

            {/* Auto-shutter toggle */}
            <button
              onClick={() => setAutoMode((a) => !a)}
              className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5 text-xs font-medium text-white"
              aria-label="Capture automatique"
            >
              {autoMode ? <Zap size={14} className="text-success" /> : <ZapOff size={14} />}
              Auto {autoMode ? "ON" : "OFF"}
            </button>
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
            className="relative h-16 w-16 rounded-full border-4 border-white bg-white/20 disabled:opacity-40"
          >
            {/* shutter fills up as the auto-capture arms */}
            {autoMode && stableProgress > 0 && (
              <span
                className="absolute inset-1 rounded-full bg-success/70 transition-transform duration-150"
                style={{ transform: `scale(${stableProgress})` }}
              />
            )}
          </button>
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

/** Shoelace polygon area. */
function polyArea(pts: Point[]) {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) / 2;
}
