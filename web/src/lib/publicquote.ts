import { prisma, tenantDb } from "./db";
import { companyForHost } from "./tenant";
import type { RfqLine } from "./rfq";

/**
 * Resolve a supplier's no-login quote link. The token must belong to the
 * tenant that owns the host it's opened on, and must not be expired, so a
 * link can't be replayed against another company's subdomain.
 */
export async function resolveQuoteLink(host: string | null, token: string) {
  const company = await companyForHost(host);
  if (!company || !token || token.length < 20) return { error: "not_found" as const };
  const recipient = await prisma.rfqRecipient.findUnique({ where: { token } });
  if (!recipient || recipient.companyId !== company.id) return { error: "not_found" as const };
  if (recipient.tokenExpiresAt < new Date()) return { error: "expired" as const, company };
  const db = tenantDb(company.id);
  const rfq = await db.rfq.findUnique({ where: { id: recipient.rfqId } });
  if (!rfq) return { error: "not_found" as const };
  const project = await db.project.findUnique({ where: { id: rfq.projectId } });
  return { company, recipient, rfq, project, lines: (rfq.lines ?? []) as RfqLine[], db };
}
