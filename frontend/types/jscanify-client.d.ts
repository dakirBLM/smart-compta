/**
 * Types for the browser build of jscanify (imported as "jscanify/client").
 * The bare "jscanify" specifier resolves to a Node-only build (canvas/jsdom)
 * and must never be imported in client code.
 */
declare module "jscanify/client" {
  interface Point {
    x: number;
    y: number;
  }

  interface CornerPoints {
    topLeftCorner?: Point;
    topRightCorner?: Point;
    bottomLeftCorner?: Point;
    bottomRightCorner?: Point;
  }

  /** Requires the global `cv` (opencv.js) to be loaded and initialized. */
  export default class jscanify {
    findPaperContour(img: unknown): unknown;
    getCornerPoints(contour: unknown): CornerPoints;
    highlightPaper(
      image: HTMLCanvasElement | HTMLImageElement,
      options?: { color?: string; thickness?: number }
    ): HTMLCanvasElement;
    extractPaper(
      image: HTMLCanvasElement | HTMLImageElement,
      resultWidth: number,
      resultHeight: number,
      cornerPoints?: CornerPoints
    ): HTMLCanvasElement | null;
  }
}
