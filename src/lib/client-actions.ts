"use client";

/**
 * POSTs JSON to one of our API routes. On failure it announces the server's message (picked up
 * by <ErrorToaster/>) and resolves false, so optimistic UI can roll back instead of silently
 * showing a change that never happened.
 */
export async function postOrReport(url: string, body: unknown): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) return true;
    const data = await res.json().catch(() => ({}));
    reportError(data.error ?? "That didn't save — please try again.");
  } catch {
    reportError("Couldn't reach Verity — check your connection and try again.");
  }
  return false;
}

/** Like postOrReport, but hands back the response body on success (null on failure). */
export async function postJson<T = Record<string, unknown>>(url: string, body: unknown): Promise<T | null> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return data as T;
    reportError(data.error ?? "That didn't save — please try again.");
  } catch {
    reportError("Couldn't reach Verity — check your connection and try again.");
  }
  return null;
}

export function reportError(message: string) {
  window.dispatchEvent(new CustomEvent("verity:error", { detail: message }));
}
