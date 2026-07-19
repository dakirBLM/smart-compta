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
 *
 * Robustness notes (learned the hard way):
 * - emscripten's legacy `Module.then` is a FAKE thenable (no .catch; chaining
 *   its return value throws). Never treat `cv` as a real Promise.
 * - Don't depend on the <script> load event: readiness is detected by POLLING
 *   for `window.cv.Mat` from the moment the script tag is inserted, with one
 *   global deadline covering download + eval + WASM init. onload/
 *   onRuntimeInitialized are used only as accelerators when they do fire.
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
// Covers download + parse/eval + WASM init. Generous for slow mobile networks;
// the UI degrades to manual corners if it expires.
const TOTAL_DEADLINE_MS = 120_000;
const POLL_MS = 200;

function ensureScriptTag(onError: (e: Error) => void) {
  if (document.getElementById(SCRIPT_ID)) return;
  const script = document.createElement("script");
  script.id = SCRIPT_ID;
  script.src = "/opencv/opencv.js";
  script.async = true;
  script.onerror = () => onError(new Error("Impossible de charger opencv.js"));
  document.body.appendChild(script);
}

function waitForCv(): Promise<{ cv: any }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (value: { cv: any } | null, err?: unknown) => {
      if (settled) return;
      settled = true;
      clearInterval(poll);
      clearTimeout(timer);
      err ? reject(err) : resolve(value!);
    };

    // Pure polling — deliberately NO onRuntimeInitialized hook. And CRITICAL:
    // the module's legacy fake `then` must NEVER flow through Promise
    // resolution — resolving/awaiting a thenable makes JS call value.then()
    // to assimilate it, and emscripten's fake then returns the module itself,
    // producing an INFINITE assimilation loop that hard-locks the main thread
    // (diagnosed via Debugger.pause: stack frozen inside Module.then). So we
    // delete the fake `then` and resolve with a wrapper object.
    const check = () => {
      const g = (window as any).cv;
      if (g?.Mat) {
        try {
          delete g.then;
        } catch {
          /* sealed module — the wrapper below still protects us */
        }
        finish({ cv: g });
        return true;
      }
      return false;
    };

    ensureScriptTag((e) => finish(null, e));
    if (check()) return;
    const poll = setInterval(check, POLL_MS);
    const timer = setTimeout(
      () =>
        finish(
          null,
          new Error(
            "Le moteur de détection n'a pas pu s'initialiser (connexion lente ?). Réessayez."
          )
        ),
      TOTAL_DEADLINE_MS
    );
  });
}

export function loadDocumentScanner(): Promise<ScannerLibs> {
  if (cached) return cached;

  cached = (async () => {
    const { cv } = await waitForCv(); // wrapped: raw module must not be awaited
    const mod: any = await import("jscanify/client");
    const JScanify = mod.default ?? mod;
    if (typeof JScanify !== "function") {
      throw new Error("jscanify n'a pas pu être chargé.");
    }
    return { cv, JScanify };
  })().catch((err) => {
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
