"use client";

import { Check, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadDocumentScanner, ScannerLibs } from "@/lib/opencv-loader";
import { Spinner } from "./ui";

type Point = { x: number; y: number };
type Corners = [Point, Point, Point, Point]; // TL, TR, BR, BL

/**
 * CamScanner-style adjustment step. Runs automatic paper detection (opencv.js
 * via jscanify) on the captured photo to find the page's 4 corners, then ALWAYS
 * lets the user fine-tune them by dragging — exactly like CamScanner, where
 * auto-detect proposes and the human confirms. On confirm, the quadrilateral
 * is perspective-warped (flattened) into a clean rectangular scan.
 */
export function CornerAdjust({
  file,
  onDone,
  onRetake,
  onCancel,
}: {
  file: File;
  onDone: (file: File) => void;
  onRetake: () => void;
  onCancel: () => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const libsRef = useRef<ScannerLibs | null>(null);
  const scannerRef = useRef<InstanceType<ScannerLibs["JScanify"]> | null>(null);
  const dragIndex = useRef<number>(-1);

  const [imgUrl, setImgUrl] = useState<string>("");
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  // Corners in NATURAL image coordinates.
  const [corners, setCorners] = useState<Corners | null>(null);
  const [detecting, setDetecting] = useState(true);
  const [autoFound, setAutoFound] = useState(false);
  const [warping, setWarping] = useState(false);
  const [cvFailed, setCvFailed] = useState(false);
  // Displayed size of the <img> (object-contain box), for coord mapping.
  const [display, setDisplay] = useState<{ w: number; h: number; left: number; top: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImgUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const defaultCorners = useCallback((w: number, h: number): Corners => {
    const mx = w * 0.06;
    const my = h * 0.06;
    return [
      { x: mx, y: my },
      { x: w - mx, y: my },
      { x: w - mx, y: h - my },
      { x: mx, y: h - my },
    ];
  }, []);

  /** Track how the object-contain image maps into its container. */
  const measure = useCallback(() => {
    const img = imgRef.current;
    const box = boxRef.current;
    if (!img || !box || !natural) return;
    const bw = box.clientWidth;
    const bh = box.clientHeight;
    const scale = Math.min(bw / natural.w, bh / natural.h);
    const w = natural.w * scale;
    const h = natural.h * scale;
    setDisplay({ w, h, left: (bw - w) / 2, top: (bh - h) / 2 });
  }, [natural]);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  /** Image loaded → draw full-res copy to a canvas, then run auto-detection. */
  async function handleImgLoad() {
    const img = imgRef.current;
    if (!img) return;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    setNatural({ w, h });

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")?.drawImage(img, 0, 0);
    sourceCanvasRef.current = canvas;

    try {
      const libs = await loadDocumentScanner();
      libsRef.current = libs;
      scannerRef.current = new libs.JScanify();

      // Detect on a downscaled copy (fast + stabler Canny), scale corners back.
      const MAX_SIDE = 800;
      const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
      let detectCanvas = canvas;
      if (scale < 1) {
        detectCanvas = document.createElement("canvas");
        detectCanvas.width = Math.round(w * scale);
        detectCanvas.height = Math.round(h * scale);
        detectCanvas.getContext("2d")?.drawImage(img, 0, 0, detectCanvas.width, detectCanvas.height);
      }

      const cv = libs.cv;
      const mat = cv.imread(detectCanvas);
      let contour: any = null;
      try {
        contour = scannerRef.current.findPaperContour(mat);
        if (contour) {
          const pts = scannerRef.current.getCornerPoints(contour);
          const { topLeftCorner: tl, topRightCorner: tr, bottomRightCorner: br, bottomLeftCorner: bl } = pts;
          if (tl && tr && br && bl) {
            const up = (p: Point): Point => ({ x: p.x / scale, y: p.y / scale });
            const quad: Corners = [up(tl), up(tr), up(br), up(bl)];
            // Sanity: reject degenerate detections (< 12% of the image area).
            if (quadArea(quad) > w * h * 0.12) {
              setCorners(quad);
              setAutoFound(true);
            }
          }
        }
      } finally {
        contour?.delete?.();
        mat.delete();
      }
    } catch {
      // opencv failed to load — manual corners still work, warp will fall back.
      setCvFailed(true);
    } finally {
      setCorners((c) => c ?? defaultCorners(w, h));
      setDetecting(false);
      // measure once the layout has settled
      requestAnimationFrame(measure);
    }
  }

  // ---- dragging ----------------------------------------------------------
  const toDisplay = useCallback(
    (p: Point): Point => {
      if (!display || !natural) return p;
      const s = display.w / natural.w;
      return { x: display.left + p.x * s, y: display.top + p.y * s };
    },
    [display, natural]
  );

  const toNatural = useCallback(
    (clientX: number, clientY: number): Point => {
      const box = boxRef.current;
      if (!box || !display || !natural) return { x: 0, y: 0 };
      const rect = box.getBoundingClientRect();
      const s = natural.w / display.w;
      const x = (clientX - rect.left - display.left) * s;
      const y = (clientY - rect.top - display.top) * s;
      return {
        x: Math.max(0, Math.min(natural.w, x)),
        y: Math.max(0, Math.min(natural.h, y)),
      };
    },
    [display, natural]
  );

  function startDrag(i: number) {
    return (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      dragIndex.current = i;
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (dragIndex.current < 0) return;
    const p = toNatural(e.clientX, e.clientY);
    setCorners((c) => {
      if (!c) return c;
      const next = [...c] as Corners;
      next[dragIndex.current] = p;
      return next;
    });
  }

  function endDrag() {
    dragIndex.current = -1;
  }

  // ---- confirm: perspective warp -----------------------------------------
  async function confirm() {
    const src = sourceCanvasRef.current;
    if (!src || !corners || warping) return;
    setWarping(true);
    try {
      const [tl, tr, br, bl] = corners;
      // Output size from the quad's real edge lengths (keeps proportions).
      const outW = Math.round(Math.max(dist(tl, tr), dist(bl, br)));
      const outH = Math.round(Math.max(dist(tl, bl), dist(tr, br)));

      let outCanvas: HTMLCanvasElement | null = null;
      if (scannerRef.current && libsRef.current && outW > 20 && outH > 20) {
        outCanvas = scannerRef.current.extractPaper(src, outW, outH, {
          topLeftCorner: tl,
          topRightCorner: tr,
          bottomRightCorner: br,
          bottomLeftCorner: bl,
        });
      }
      // Fallback if opencv never loaded: crop the quad's bounding box (no warp).
      if (!outCanvas) {
        const minX = Math.min(tl.x, tr.x, br.x, bl.x);
        const minY = Math.min(tl.y, tr.y, br.y, bl.y);
        const maxX = Math.max(tl.x, tr.x, br.x, bl.x);
        const maxY = Math.max(tl.y, tr.y, br.y, bl.y);
        outCanvas = document.createElement("canvas");
        outCanvas.width = Math.max(1, Math.round(maxX - minX));
        outCanvas.height = Math.max(1, Math.round(maxY - minY));
        outCanvas
          .getContext("2d")
          ?.drawImage(src, minX, minY, outCanvas.width, outCanvas.height, 0, 0, outCanvas.width, outCanvas.height);
      }

      outCanvas.toBlob(
        (blob) => {
          setWarping(false);
          if (!blob) return;
          onDone(new File([blob], `scan-${Date.now()}.jpg`, { type: "image/jpeg" }));
        },
        "image/jpeg",
        0.92
      );
    } catch {
      setWarping(false);
    }
  }

  const displayCorners = useMemo(
    () => (corners && display ? corners.map(toDisplay) : null),
    [corners, display, toDisplay]
  );

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black">
      <p className="px-4 pb-1 pt-4 text-center text-sm font-medium text-white">
        {detecting
          ? "Détection du document…"
          : autoFound
            ? "Document détecté — ajustez les coins si nécessaire"
            : cvFailed
              ? "Détection indisponible — placez les coins manuellement"
              : "Document non détecté — placez les coins sur la facture"}
      </p>

      <div
        ref={boxRef}
        className="relative mx-3 mb-2 flex-1 touch-none overflow-hidden"
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {imgUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={imgRef}
            src={imgUrl}
            alt="capture"
            onLoad={handleImgLoad}
            className="h-full w-full select-none object-contain"
            draggable={false}
          />
        )}

        {detecting && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <Spinner className="h-8 w-8 text-white" />
          </div>
        )}

        {displayCorners && !detecting && (
          <svg className="pointer-events-none absolute inset-0 h-full w-full">
            <polygon
              points={displayCorners.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="rgba(34,197,94,0.12)"
              stroke="#22C55E"
              strokeWidth={2}
            />
            {/* edge midpoint ticks help see the quad on busy backgrounds */}
            {displayCorners.map((p, i) => {
              const q = displayCorners[(i + 1) % 4];
              return (
                <line
                  key={i}
                  x1={(p.x + q.x) / 2 - 6}
                  y1={(p.y + q.y) / 2}
                  x2={(p.x + q.x) / 2 + 6}
                  y2={(p.y + q.y) / 2}
                  stroke="#22C55E"
                  strokeWidth={3}
                />
              );
            })}
          </svg>
        )}

        {displayCorners &&
          !detecting &&
          displayCorners.map((p, i) => (
            <div
              key={i}
              onPointerDown={startDrag(i)}
              className="absolute z-10 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none items-center justify-center"
              style={{ left: p.x, top: p.y }}
            >
              <span className="h-5 w-5 rounded-full border-2 border-white bg-success shadow-lg" />
            </div>
          ))}
      </div>

      <div className="flex items-center justify-between bg-black px-8 py-4">
        <button
          onClick={onCancel}
          className="rounded-full p-3 text-white/80 hover:bg-white/10"
          aria-label="Annuler"
        >
          <X size={24} />
        </button>
        <button
          onClick={onRetake}
          className="flex items-center gap-2 rounded-full px-4 py-2 text-sm text-white/80 hover:bg-white/10"
        >
          <RotateCcw size={18} /> Reprendre
        </button>
        <button
          onClick={confirm}
          disabled={detecting || warping || !corners}
          aria-label="Valider le scan"
          className="flex h-14 w-14 items-center justify-center rounded-full bg-success text-white shadow-lg disabled:opacity-40"
        >
          {warping ? <Spinner className="h-6 w-6" /> : <Check size={26} />}
        </button>
      </div>
    </div>
  );
}

function dist(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Shoelace area of the quadrilateral. */
function quadArea([a, b, c, d]: Corners) {
  return (
    Math.abs(
      a.x * b.y - b.x * a.y +
        (b.x * c.y - c.x * b.y) +
        (c.x * d.y - d.x * c.y) +
        (d.x * a.y - a.x * d.y)
    ) / 2
  );
}
