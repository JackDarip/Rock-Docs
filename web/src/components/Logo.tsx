import { PRODUCT_NAME } from "@/config/brand";

/** Rocket mark on an orange tile, plus the product name. */
export function RocketMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#FF6B00" />
      <g transform="rotate(45 16 16)">
        <path d="M16 5c3.2 2.6 4.6 6.4 4.6 10.6V21h-9.2v-5.4C11.4 11.4 12.8 7.6 16 5z" fill="#fff" />
        <circle cx="16" cy="13" r="2" fill="#FF6B00" />
        <path d="M11.4 17.5 8.6 21.5V23h2.8zM20.6 17.5l2.8 4V23h-2.8z" fill="#fff" fillOpacity=".75" />
        <path d="M13.6 22.5h4.8L16 27.5z" fill="#06122B" fillOpacity=".55" />
      </g>
    </svg>
  );
}

export function Logo({ light = false, compact = false }: { light?: boolean; compact?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <RocketMark />
      {!compact && <span className={`font-display text-2xl font-extrabold tracking-wide ${light ? "text-white" : "text-night"}`}>{PRODUCT_NAME}</span>}
    </div>
  );
}
