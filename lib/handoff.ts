/**
 * Kiosk → phone handoff. The QR code carries a small, non-personal snapshot
 * in the URL itself, so the demo needs no database.
 *
 * Production note: replace the token with a short random id stored in Redis
 * (Upstash) with a 24-hour expiry, for smaller QR codes and full history.
 */
export type Handoff = {
  v: string[]; // venue ids, max 4
  q?: string; // last question, ≤140 chars
  a?: string; // last answer, ≤320 chars
};

const MAX_VENUES = 4;
const MAX_Q = 140;
const MAX_A = 320;

function clip(s: string | undefined, max: number): string | undefined {
  if (!s) return undefined;
  const t = s.trim();
  if (!t) return undefined;
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + "…";
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(token: string): Uint8Array {
  const b64 = token.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function encodeHandoff(h: Handoff): string {
  const payload: Handoff = { v: h.v.slice(0, MAX_VENUES) };
  const q = clip(h.q, MAX_Q);
  const a = clip(h.a, MAX_A);
  if (q) payload.q = q;
  if (a) payload.a = a;
  return toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
}

/** Returns null for anything malformed; callers fall back to an empty chat. */
export function decodeHandoff(token: string): Handoff | null {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(fromBase64Url(token)));
    if (!parsed || !Array.isArray(parsed.v)) return null;
    const v = parsed.v.filter((x: unknown): x is string => typeof x === "string").slice(0, MAX_VENUES);
    return {
      v,
      q: typeof parsed.q === "string" ? clip(parsed.q, MAX_Q) : undefined,
      a: typeof parsed.a === "string" ? clip(parsed.a, MAX_A) : undefined,
    };
  } catch {
    return null;
  }
}

export function handoffUrl(h: Handoff, origin?: string): string {
  const base = (process.env.NEXT_PUBLIC_BASE_URL || origin || "").replace(/\/+$/, "");
  return `${base}/c/${encodeHandoff(h)}`;
}
