"use client";

/**
 * TEMPORARY diagnostic page (dev-only) — exercises the exact production code
 * path of the document scanner: opencv-loader + webpack import of
 * jscanify/client + detection + warp, on a synthetic scene.
 */
import { useEffect, useState } from "react";
import { loadDocumentScanner } from "@/lib/opencv-loader";

const GT = [
  { x: 180, y: 90 },
  { x: 640, y: 130 },
  { x: 600, y: 520 },
  { x: 140, y: 470 },
];

export default function ScanTest() {
  const [out, setOut] = useState("running…");

  useEffect(() => {
    (async () => {
      const stage = (s: string) => {
        document.title = "STAGE:" + s;
        setOut("stage: " + s);
      };
      const report = (o: unknown) => {
        const s = JSON.stringify(o, null, 2);
        setOut(s);
        document.title = "RESULT:" + JSON.stringify(o);
      };
      stage("mounted");
      try {
        const scene = document.createElement("canvas");
        scene.width = 800;
        scene.height = 600;
        const ctx = scene.getContext("2d")!;
        ctx.fillStyle = "#3a3f45";
        ctx.fillRect(0, 0, 800, 600);
        ctx.fillStyle = "#f5f5f0";
        ctx.beginPath();
        ctx.moveTo(GT[0].x, GT[0].y);
        for (let i = 1; i < 4; i++) ctx.lineTo(GT[i].x, GT[i].y);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#888";
        ctx.lineWidth = 3;
        for (let i = 0; i < 10; i++) {
          ctx.beginPath();
          ctx.moveTo(220, 150 + i * 34);
          ctx.lineTo(560, 158 + i * 34);
          ctx.stroke();
        }

        const t0 = Date.now();
        stage("loading-cv");
        const libs = await loadDocumentScanner();
        stage("cv-ready-instantiating");
        const scanner = new libs.JScanify();
        stage("detecting");
        const mat = libs.cv.imread(scene);
        const contour: any = scanner.findPaperContour(mat);
        if (!contour) return report({ ok: false, stage: "no-contour" });
        const pts = scanner.getCornerPoints(contour);
        const found = [
          pts.topLeftCorner,
          pts.topRightCorner,
          pts.bottomRightCorner,
          pts.bottomLeftCorner,
        ];
        if (found.some((p) => !p)) return report({ ok: false, stage: "missing-corners" });
        const errs = found.map((p, i) => Math.hypot(p!.x - GT[i].x, p!.y - GT[i].y));
        const warped = scanner.extractPaper(scene, 400, 560, {
          topLeftCorner: found[0]!,
          topRightCorner: found[1]!,
          bottomRightCorner: found[2]!,
          bottomLeftCorner: found[3]!,
        });
        contour.delete?.();
        mat.delete();
        report({
          ok: Math.max(...errs) < 25 && !!warped,
          stage: "done",
          maxCornerError: Math.round(Math.max(...errs) * 10) / 10,
          warpedSize: warped ? { w: warped.width, h: warped.height } : null,
          totalMs: Date.now() - t0,
        });
      } catch (e) {
        report({ ok: false, stage: "error", error: String((e as Error)?.message ?? e) });
      }
    })();
  }, []);

  return <pre id="out">{out}</pre>;
}
