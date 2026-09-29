"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateCompany } from "@/app/actions/setup";
import { PRODUCT_NAME } from "@/config/brand";

export function EmailMethodPicker({ current, readOnly, companyName }: { current: string; readOnly: boolean; companyName: string }) {
  const [m, setM] = useState(current);
  const router = useRouter();
  const options = [
    { key: "PLATFORM", title: `${PRODUCT_NAME} sending`, tag: "Default · works now",
      body: `Sent from our verified domain as "${companyName} via ${PRODUCT_NAME}". Replies go straight to the estimator.`,
      pros: "No setup. Good deliverability.", cons: "Suppliers see our domain in the From line." },
    { key: "DOMAIN", title: "Your company domain", tag: "Needs DNS",
      body: "Sent from your own address, like bids@yourcompany.com.", pros: "Looks 100% like you.", cons: "Someone must add a few DNS records." },
    { key: "CONNECTED", title: "Connect my email", tag: "Google / Microsoft",
      body: "Each estimator connects their own mailbox. RFQs appear in their Sent folder.", pros: "Most personal; full history in Outlook/Gmail.", cons: "Provider daily sending limits apply." },
  ];
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {options.map((o) => (
        <button key={o.key} disabled={readOnly} aria-pressed={m === o.key} onClick={async () => { setM(o.key); await updateCompany("emailMethod", o.key); router.refresh(); }}
          className={`card p-5 text-left transition ${m === o.key ? "border-brand ring-2 ring-brand/30" : "hover:border-mist"}`}>
          <div className="text-xs font-semibold uppercase text-brand">{o.tag}</div>
          <div className="text-xl font-bold">{o.title}</div>
          <p className="mt-1 text-sm text-muted">{o.body}</p>
          <p className="mt-2 text-xs"><strong className="text-ok">+</strong> {o.pros}</p>
          <p className="text-xs"><strong className="text-warn">−</strong> {o.cons}</p>
        </button>
      ))}
    </div>
  );
}
