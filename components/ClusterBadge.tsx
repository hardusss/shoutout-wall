import { IS_DEVNET } from "@/lib/config";

/** Small badge so nobody mistakes a devnet wall for the real thing. */
export function ClusterBadge({ className = "" }: { className?: string }) {
  if (!IS_DEVNET) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full border border-paper/60 px-[0.7em] py-[0.15em] font-medium text-paper ${className}`}
    >
      Devnet
    </span>
  );
}
