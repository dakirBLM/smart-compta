function isIos() {
  return (
    /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/** Save a file. iPhone Safari opens application/pdf blobs in its viewer and
 * ignores the download name, so those files are handed over as a generic download. */
export function saveBlob(blob: Blob, filename: string) {
  const file = isIos() ? new Blob([blob], { type: "application/octet-stream" }) : blob;
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 40_000);
}
