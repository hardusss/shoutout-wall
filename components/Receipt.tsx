import type { CSSProperties } from "react";
import { formatSol, seededRandom, shortAddress } from "@/lib/format";
import { countChars } from "@/lib/protocol";

export type ReceiptSize = "preview" | "wall" | "print";

type ReceiptProps = {
  message: string;
  /** Full sender address; null shows a placeholder. */
  sender: string | null;
  time: string;
  lamports: number;
  size: ReceiptSize;
  /** Stable seed (the signature) for the hand-pinned tilt and shadow. */
  seed: string;
  tilt?: boolean;
  placeholder?: boolean;
  className?: string;
};

/** Receipt width in characters: short messages make narrow strips, long ones wide strips. */
function columnsFor(length: number, size: ReceiptSize): number {
  if (size === "print") return Math.min(24, Math.max(9, Math.round(3 + Math.sqrt(length) * 2)));
  if (size === "preview") return Math.min(24, Math.max(13, Math.round(5 + Math.sqrt(length) * 1.9)));
  return Math.min(26, Math.max(12, Math.round(4 + Math.sqrt(length) * 2.05)));
}

/** Message size for the big printer receipt; at least 2.75rem (44px on 1080p). */
function printFontSize(length: number): string {
  if (length <= 24) return "4.5rem";
  if (length <= 60) return "3.75rem";
  if (length <= 90) return "3.25rem";
  return "2.875rem";
}

export function Receipt({
  message,
  sender,
  time,
  lamports,
  size,
  seed,
  tilt = true,
  placeholder = false,
  className,
}: ReceiptProps) {
  const length = countChars(message);
  const random = seededRandom(seed);
  const style = {
    "--cols": columnsFor(length, size),
    "--tilt": tilt ? `${(random() * 3 - 1.5).toFixed(2)}deg` : "0deg",
    "--stamp-tilt": `${(-16 + random() * 12).toFixed(1)}deg`,
    "--shadow-y": `${(0.4 + random() * 0.5).toFixed(2)}rem`,
    "--shadow-blur": `${(0.7 + random() * 0.7).toFixed(2)}rem`,
    "--shadow-alpha": (0.22 + random() * 0.16).toFixed(2),
    // The receipt in the printer hangs closer to the room than the pinned ones.
    ...(size === "print"
      ? { "--msg": printFontSize(length), "--shadow-y": "1.25rem", "--shadow-blur": "2.5rem", "--shadow-alpha": "0.42" }
      : null),
  } as CSSProperties;

  const amount = formatSol(lamports);

  return (
    <div className={`receipt ${className ?? ""}`} data-size={size} style={style}>
      <div className="paper">
        <p className="receipt-message" data-placeholder={placeholder || undefined}>
          {message}
        </p>
        <div className="receipt-rule" aria-hidden="true" />
        <div className="receipt-meta">
          <div className="receipt-meta-text">
            <span>{sender ? shortAddress(sender) : "Your wallet"}</span>
            <span>{time}</span>
          </div>
          <div className="stamp" role="img" aria-label={`Tip ${amount} SOL`}>
            <span className="stamp-amount" data-long={amount.length > 5 || undefined}>
              {amount}
            </span>
            <span className="stamp-unit">SOL</span>
          </div>
        </div>
      </div>
    </div>
  );
}
