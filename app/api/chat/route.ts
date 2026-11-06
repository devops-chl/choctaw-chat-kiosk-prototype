import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { runConcierge } from "@/lib/concierge";
import type { ChatMessage, Surface } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_HISTORY = 16;
const MAX_CHARS = 2000;

function sanitize(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const msgs = raw
    .filter(
      (m): m is ChatMessage =>
        !!m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim().length > 0,
    )
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, MAX_CHARS) }))
    .slice(-MAX_HISTORY);
  // Must start with a user turn.
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  return msgs;
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Server is missing ANTHROPIC_API_KEY. Add it to .env.local and restart." },
      { status: 500 },
    );
  }

  let body: { surface?: unknown; messages?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const surface: Surface = body.surface === "phone" ? "phone" : "kiosk";
  const messages = sanitize(body.messages);
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "Conversation must end with a user message." }, { status: 400 });
  }

  try {
    const result = await runConcierge(surface, messages);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "The concierge is busy. Please try again in a moment." }, { status: 429 });
    }
    if (err instanceof Anthropic.AuthenticationError) {
      console.error("Anthropic authentication failed; check ANTHROPIC_API_KEY.");
      return NextResponse.json({ error: "Concierge is misconfigured." }, { status: 500 });
    }
    if (err instanceof Anthropic.APIError) {
      console.error(`Anthropic API error ${err.status}: ${err.message}`);
      return NextResponse.json({ error: "The concierge couldn't answer right now." }, { status: 502 });
    }
    console.error("Concierge error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
