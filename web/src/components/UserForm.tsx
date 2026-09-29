"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createUser } from "@/app/actions/setup";

export function UserForm() {
  const [msg, setMsg] = useState("");
  const router = useRouter();
  return (
    <form className="space-y-3" action={async (fd) => { const r = await createUser(fd); setMsg(r.ok ? "Added ✓ Share the password with them securely." : `⚠ ${r.error}`); if (r.ok) router.refresh(); }}>
      <div><label className="label">Name</label><input name="name" className="input" required /></div>
      <div><label className="label">Email</label><input name="email" type="email" className="input" required /></div>
      <div><label className="label">Phone</label><input name="phone" className="input" /></div>
      <div><label className="label">Role</label><select name="role" className="input"><option value="ESTIMATOR">Estimator</option><option value="ADMIN">Admin</option></select></div>
      <div><label className="label">Temporary password</label><input name="password" type="text" minLength={10} className="input" required /></div>
      <button className="btn btn-primary">Add teammate</button>
      {msg && <p className="text-sm text-muted">{msg}</p>}
    </form>
  );
}
