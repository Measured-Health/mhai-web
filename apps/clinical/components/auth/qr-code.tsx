"use client";
import QRCode from "qrcode";
import { useMemo } from "react";

/** An SVG QR code drawn from the matrix: no canvas, no network, no innerHTML. */
export function QrCode({ text, label }: { text: string; label: string }) {
  const { size, d } = useMemo(() => {
    const m = QRCode.create(text, { errorCorrectionLevel: "M" }).modules;
    let path = "";
    for (let r = 0; r < m.size; r++)
      for (let c = 0; c < m.size; c++)
        if (m.get(r, c)) path += `M${c + 4} ${r + 4}h1v1h-1z`;
    return { size: m.size + 8, d: path };
  }, [text]);
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      className="size-32 bg-white text-ink"
    >
      <path d={d} fill="currentColor" />
    </svg>
  );
}
