"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { markNotificationsRead } from "@/app/actions/send";

export function MarkAllRead() {
  const [pending, start] = useTransition();
  const router = useRouter();
  return <button className="btn btn-secondary btn-sm" disabled={pending} onClick={() => start(async () => { await markNotificationsRead("all"); router.refresh(); })}>Mark all as read</button>;
}
