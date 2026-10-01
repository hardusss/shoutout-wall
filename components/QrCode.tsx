import { useMemo } from "react";
import QRCode from "qrcode";

const QUIET_ZONE = 4;

/** QR code drawn as SVG paths: dark ink on thermal paper with a 4-module quiet zone. */
export function QrCode({ value, label, className }: { value: string; label: string; className?: string }) {
  const { size, path } = useMemo(() => {
    const qr = QRCode.create(value, { errorCorrectionLevel: "L" });
    const n = qr.modules.size;
    const data = qr.modules.data;
    let d = "";
    for (let y = 0; y < n; y++) {
      let x = 0;
      while (x < n) {
        if (!data[y * n + x]) {
          x++;
          continue;
        }
        const start = x;
        while (x < n && data[y * n + x]) x++;
        d += `M${start + QUIET_ZONE} ${y + QUIET_ZONE}h${x - start}v1h-${x - start}z`;
      }
    }
    return { size: n + QUIET_ZONE * 2, path: d };
  }, [value]);

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={label}
      className={className}
    >
      <rect width={size} height={size} fill="var(--color-paper)" />
      <path d={path} fill="var(--color-ink)" />
    </svg>
  );
}
