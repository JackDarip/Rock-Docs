// Single source of truth for product branding. Never hardcode the product
// name anywhere else: import PRODUCT_NAME / TAGLINE from here.

export const PRODUCT_NAME = "TrueGrade";
export const TAGLINE = "Estimates calibrated to your real costs.";
export const POWERED_BY = `Powered by ${PRODUCT_NAME}`;
export const PLATFORM_OWNER = "Answer AI";
export const PLATFORM_URL = "https://theanswerai.com";

// Platform palette, matched to theanswerai.com (see src/app/globals.css for the
// CSS tokens that the UI uses). Tenants override `accent` on their own PDFs and
// RFQ spreadsheets via Company.accentColor.
export const PLATFORM_COLORS = {
  night: "#06122B",
  navy950: "#0B1B33",
  navy900: "#122747",
  navy800: "#1A3560",
  navy700: "#234478",
  orange: "#FF6B00",
  orangeHi: "#FF8A33",
  orange600: "#EA580C",
  orange50: "#FFF7ED",
  mist: "#D3DEF2",
  slate900: "#0F172A",
  slate600: "#475569",
  slate400: "#94A3B8",
  slate100: "#F1F5F9",
  slate50: "#F8FAFC",
  amber: "#B45309",
  amberBg: "#FFFBEB",
  red: "#B91C1C",
} as const;
