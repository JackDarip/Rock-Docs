/** Versioned URL for a company's logo, so a new upload shows everywhere at once. */
export function logoUrl(c: { logoPath: string | null; updatedAt: Date | string }) {
  return c.logoPath ? `/api/logo?v=${new Date(c.updatedAt).getTime()}` : null;
}
