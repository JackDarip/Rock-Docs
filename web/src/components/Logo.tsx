import { PRODUCT_NAME } from "@/config/brand";

export function Logo({ light = false, compact = false }: { light?: boolean; compact?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="8" fill="#FF6B00" />
        <path d="M5 23 L13 13 L18 18 L27 8" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 26 H27" stroke="#fff" strokeOpacity=".55" strokeWidth="2" strokeLinecap="round" />
      </svg>
      {!compact && <span className={`font-display text-2xl font-extrabold tracking-wide ${light ? "text-white" : "text-night"}`}>{PRODUCT_NAME}</span>}
    </div>
  );
}
