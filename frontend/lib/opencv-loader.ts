"use client";

/**
 * Lazy-loads the self-hosted opencv.js (public/opencv/opencv.js, ~10MB) plus
 * the browser build of jscanify (imported from the "jscanify/client" subpath
 * — NOT the bare "jscanify" specifier, whose package "main" points at a
 * Node-only build that pulls in `canvas`/`jsdom` and must never reach the
 * client bundle).
 *
 * Used exclusively by the document scanner (CameraCapture/CornerAdjust), so
 * this multi-MB payload is only fetched when a user actually opens the
 * scanner — never part of the main app bundle. The browser caches the file
 * long-term (see the Cache-Control header for /opencv/opencv.js in
 * next.config.js), so it's a one-time download per device.
 */

export interface ScannerLibs {
  cv: any;
  JScanify: new () => {
    findPaperContour(img: any): any;
    getCornerPoints(contour: any): {
      topLeftCorner?: { x: number; y: number };
      topRightCorner?: { x: number; y: number };
      bottomLeftCorner?: { x: number; y: number };
      bottomRightCorner?: { x: number; y: number };
    };
    highlightPaper(image: HTMLCanvasElement | HTMLImageElement, options?: any): HTMLCanvasElement;
    extractPaper(
      image: HTMLCanvasElement | HTMLImageElement,
      resultWidth: number,
      resultHeight: number,
      cornerPoints?: Record<string, { x: number; y: number }>
    ): HTMLCanvasElement | null;
  };
}

let cached: Promise<ScannerLibs> | null = null;

const SCRIPT_ID = "opencv-js";
const LOAD_TIMEOUT_MS = 20_000;

function waitForCvRuntime(cv: any): Promise<any> {
  return new Promise((resolve, reject) => {
    if (cv?.Mat) return resolve(cv); // already initialized (rare, fast reload)

    let settled = false;
    const finish = (value: any, err?: unknown) => {
      if (settled) return;
      settled = true;
      clearInterval(poll);
      clearTimeout(timer);
      err ? reject(err) : resolve(value);
    };

    // Newer opencv.js builds export `cv` as a thenable that resolves once the
    // WASM runtime is ready.
    if (cv && typeof cv.then === "function") {
      cv.then((resolved: any) => finish(resolved)).catch((e: unknown) => finish(null, e));
    }
    // Classic emscripten callback — must be set even if the promise path
    // above also fires; whichever resolves first wins via `settled`.
    try {
      cv.onRuntimeInitialized = () => finish(cv);
    } catch {
      /* cv may be a frozen thenable in some builds; ignore */
    }
    // Defensive poll in case neither hook fires (older/newer build mismatch).
    const poll = setInterval(() => {
      if ((window as any).cv?.Mat) finish((window as any).cv);
    }, 150);
    const timer = setTimeout(
      () => finish(null, new Error("Délai dépassé lors du chargement d'opencv.js")),
      LOAD_TIMEOUT_MS
    );
  });
}

export function loadDocumentScanner(): Promise<ScannerLibs> {
  if (cached) return cached;

  cached = new Promise<ScannerLibs>((resolve, reject) => {
    const w = window as any;

    function afterCvReady(cv: any) {
      import("jscanify/client")
        .then((mod: any) => {
          const JScanify = mod.default ?? mod;
          resolve({ cv, JScanify });
        })
        .catch(reject);
    }

    if (w.cv?.Mat) {
      afterCvReady(w.cv);
      return;
    }

    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      waitForCvRuntime(w.cv).then(afterCvReady).catch(reject);
      return;
    }

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = "/opencv/opencv.js";
    script.async = true;
    script.onload = () => waitForCvRuntime(w.cv).then(afterCvReady).catch(reject);
    script.onerror = () => reject(new Error("Impossible de charger opencv.js"));
    document.body.appendChild(script);
  }).catch((err) => {
    // Don't poison the cache on failure — allow a retry on the next call
    // (e.g. transient network issue), and let callers fall back gracefully.
    cached = null;
    throw err;
  });

  return cached;
}

/** Fire-and-forget preload — call as soon as the scanner UI mounts so the
 * download/init happens while the user is framing their shot. */
export function preloadDocumentScanner() {
  loadDocumentScanner().catch(() => {
    /* swallowed: CornerAdjust retries and degrades gracefully if this fails */
  });
}
