"use client";
import { useRef, useState } from "react";
import { changePassword } from "@/app/actions/account";

export function PasswordForm() {
  const [msg, setMsg] = useState("");
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} className="space-y-3" action={async (fd) => { const r = await changePassword(fd); setMsg(r.ok ? "Password changed ✓ Other devices were signed out." : `⚠ ${r.error}`); if (r.ok) form.current?.reset(); }}>
      <div><label className="label">Current password</label><input name="current" type="password" autoComplete="current-password" className="input" required /></div>
      <div><label className="label">New password</label><input name="next" type="password" autoComplete="new-password" minLength={10} className="input" required /></div>
      <div><label className="label">Confirm new password</label><input name="confirm" type="password" autoComplete="new-password" minLength={10} className="input" required /></div>
      <button className="btn btn-primary">Change password</button>
      {msg && <p className="text-sm text-muted">{msg}</p>}
    </form>
  );
}
