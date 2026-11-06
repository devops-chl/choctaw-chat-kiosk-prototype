import Anthropic from "@anthropic-ai/sdk";
import { allVenues, categories, publicVenuesByIds, venueById } from "./catalog";
import { checkAvailability, getVenue, searchMenu, searchVenues } from "./search";
import type { ChatMessage, ChatResponse, Surface } from "./types";

const MAX_STEPS = 6;
const MAX_CARDS = 3;
const MAIN_PHONE = "888-652-4628";

// Models that accept the server-side refusal fallback (`fallbacks: "default"`).
const FALLBACK_MODELS = new Set(["claude-sonnet-5-5", "claude-opus-5-5", "claude-opus-5", "claude-fable-5-1"]);

export function modelId(): string {
  return process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
}

// ---------- Tools ----------

const TOOLS: Anthropic.Tool[] = [
  {
    name: "search_venues",
    description:
      "Keyword search over Durant dining venues (name, blurb, tags, location, page text). Returns up to 8 compact results. Use for cuisine, vibe, or need-based questions (e.g. 'steak', 'quick', 'late night').",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Keywords from the guest's request." },
        category: {
          type: "string",
          enum: categories(),
          description: "Optional exact category filter.",
        },
      },
    },
  },
  {
    name: "get_venue",
    description:
      "Full details for one venue: hours, location, menu links, reservation and order-ahead links, page text, and menuStatus (whether menu text is synced).",
    input_schema: {
      type: "object",
      properties: { id: { type: "string", description: "Venue id from the catalog." } },
      required: ["id"],
    },
  },
  {
    name: "search_menu",
    description:
      "Search synced menu text for dishes or ingredients. If menu text has not been synced it returns a note; then do not guess dishes, offer the menu PDFs instead.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Dish, ingredient, or menu section." },
        venue_id: { type: "string", description: "Optional venue id to restrict the search." },
      },
      required: ["query"],
    },
  },
  {
    name: "check_availability",
    description:
      "DEMO DATA ONLY. Checks table availability for a venue that takes online reservations. Returns available true/false and alternative times. Always tell the guest this is a demo and that booking is finished on SevenRooms via the QR code or Book a table button.",
    input_schema: {
      type: "object",
      properties: {
        venue_id: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD, America/Chicago. Use today if unspecified." },
        time: { type: "string", description: "Requested time, e.g. '7pm' or '19:00'." },
        party_size: { type: "integer", minimum: 1 },
      },
      required: ["venue_id", "date", "time", "party_size"],
    },
  },
  {
    name: "show_venues",
    description:
      "UI directive: shows these venues as cards to the guest (max 3, most relevant first). Call it whenever your reply discusses specific venues.",
    input_schema: {
      type: "object",
      properties: {
        venue_ids: { type: "array", items: { type: "string" }, maxItems: MAX_CARDS },
      },
      required: ["venue_ids"],
    },
  },
];

type ToolState = { shown: string[] | null; touched: string[] };

function runTool(name: string, input: Record<string, unknown>, state: ToolState): unknown {
  const str = (k: string) => (typeof input[k] === "string" ? (input[k] as string) : undefined);
  const touch = (id?: string) => {
    if (id && venueById(id) && !state.touched.includes(id)) state.touched.push(id);
  };
  switch (name) {
    case "search_venues":
      return searchVenues(str("query"), str("category"));
    case "get_venue":
      touch(str("id"));
      return getVenue(str("id") ?? "");
    case "search_menu":
      return searchMenu(str("query") ?? "", str("venue_id"));
    case "check_availability": {
      touch(str("venue_id"));
      const size = Number(input.party_size);
      return checkAvailability(str("venue_id") ?? "", str("date") ?? "", str("time") ?? "", Number.isFinite(size) ? size : 2);
    }
    case "show_venues": {
      const raw = Array.isArray(input.venue_ids) ? input.venue_ids : [];
      const valid = raw.filter((id): id is string => typeof id === "string" && !!venueById(id));
      const unknown = raw.filter((id) => !valid.includes(id as string));
      state.shown = Array.from(new Set(valid)).slice(0, MAX_CARDS);
      return { shown: state.shown, unknownIds: unknown.length ? unknown : undefined };
    }
    default:
      throw new Error(`Unknown tool "${name}"`);
  }
}

// ---------- Prompt ----------

function catalogLines(): string {
  return allVenues()
    .map((v) => {
      const flags = [
        v.reservationUrl && "reservations",
        v.orderAheadUrl && "order-ahead",
        v.menus?.length && "menus",
        v.hours && `hours: ${v.hours}`,
      ]
        .filter(Boolean)
        .join(", ");
      return `${v.id} | ${v.name} | ${v.category} | ${v.location ?? "-"} | ${v.tags.join(", ")} | ${flags || "-"}`;
    })
    .join("\n");
}

// Stable across requests, so it's cached (tools + this block form the prefix).
const STABLE_PROMPT = `You are the dining concierge for Choctaw Casino & Resort in Durant, Oklahoma. You help guests find places to eat and drink at the Durant property, answer questions about menus, hours, and locations, and help them book a table or order ahead.

Facts and honesty:
- Only state facts that appear in the catalog below or in tool results. Never invent dishes, prices, hours, dress codes, phone numbers, or locations.
- If something isn't known, say so briefly and point to the venue page or the main casino line, ${MAIN_PHONE}.
- When you mention hours, quote them as listed (e.g. "Fri–Sat 5pm–11pm") rather than working out today's hours yourself, and add that hours may vary.
- Menus: use search_menu. If menu text isn't synced, don't describe dishes; offer the menu PDFs (on the phone they're buttons on the card; on the kiosk, the QR code).
- Only 1832 Steakhouse takes online reservations (SevenRooms). Most casual venues offer order-ahead via LuckyEats. Others are walk-in.

Availability:
- check_availability returns DEMO data, not live availability. Say so lightly (e.g. "in this demo").
- If a requested time is booked, offer the alternative times, and suggest a similar venue matched by tags (e.g. Salt & Stone for steak and seafood). Booking is finished on SevenRooms.

Cards:
- Always call show_venues with the venues you discuss (max 3, best first). These become the cards the guest sees. When the guest refers to "it" or "that place", keep showing that venue.

Scope:
- Durant dining only. For hotel, gaming, shows, or other properties, say that's coming soon to this concierge and suggest the front desk or ${MAIN_PHONE}.
- Don't ask for or store personal details.

Style:
- Warm, concise, plain sentences. Sentence case. No markdown headings, tables, or bold. Short lists are fine on the phone only.

Catalog (id | name | category | location | tags | flags):
${catalogLines()}`;

function todayInChicago(): string {
  const now = new Date();
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(now);
  const human = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(now);
  return `${human} (${date}), America/Chicago`;
}

function surfacePrompt(surface: Surface): string {
  const where =
    surface === "kiosk"
      ? "The guest is at a touchscreen kiosk on the casino floor, reading while standing. Reply in at most 3 short sentences (about 50 words), one paragraph, no follow-up offers unless needed. Kiosk cards have QR codes only, no buttons: point the guest to the QR code to book, order ahead, or see full menus on their phone. Don't paste URLs."
      : "The guest is on their phone (they may have scanned a QR code from the kiosk). Replies can be a little longer, up to about 5 sentences. Cards show buttons for Book a table, Order ahead, menu PDFs, and the venue page, so refer to those rather than pasting URLs.";
  return `Now: ${todayInChicago()}.\n${where}`;
}

// ---------- Loop ----------

let client: Anthropic | null = null;
function getClient(): Anthropic {
  // Lazy so a missing key surfaces as the route's clear 500, not an import crash.
  return (client ??= new Anthropic());
}

function textOf(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

export async function runConcierge(surface: Surface, history: ChatMessage[]): Promise<ChatResponse> {
  const model = modelId();
  const messages: Anthropic.MessageParam[] = history.map((m) => ({ role: m.role, content: m.content }));
  const state: ToolState = { shown: null, touched: [] };
  let reply = "";

  for (let step = 0; step < MAX_STEPS; step++) {
    // The pinned SDK (0.39) predates `output_config` and `fallbacks`, so they
    // are passed through as extra body fields.
    const extra: Record<string, unknown> = { output_config: { effort: "medium" } };
    const betas: string[] = [];
    if (FALLBACK_MODELS.has(model)) {
      extra.fallbacks = "default"; // re-run on a fallback model if a safety classifier declines
      betas.push("server-side-fallback-2026-07-01");
    }

    const response = (await getClient().beta.messages.create({
      model,
      max_tokens: 16000,
      system: [
        { type: "text", text: STABLE_PROMPT, cache_control: { type: "ephemeral" } },
        { type: "text", text: surfacePrompt(surface) },
      ],
      tools: TOOLS as Anthropic.Beta.BetaTool[],
      tool_choice: { type: "auto" },
      messages: messages as Anthropic.Beta.BetaMessageParam[],
      ...(betas.length ? { betas: betas as Anthropic.Beta.AnthropicBeta[] } : {}),
      ...extra,
    } as Anthropic.Beta.MessageCreateParamsNonStreaming)) as unknown as Anthropic.Message;

    const stop = response.stop_reason as string;
    if (stop === "refusal") {
      reply = `Sorry, I can't help with that here. For anything else, the team at ${MAIN_PHONE} can help.`;
      break;
    }

    // Send the full content back (incl. thinking blocks) so the loop stays valid.
    messages.push({ role: "assistant", content: response.content as Anthropic.ContentBlockParam[] });
    const text = textOf(response.content);
    if (text) reply = text;

    if (stop !== "tool_use") break;

    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const results: Anthropic.ToolResultBlockParam[] = toolUses.map((tu) => {
      try {
        const out = runTool(tu.name, (tu.input ?? {}) as Record<string, unknown>, state);
        return { type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(out) };
      } catch (err) {
        return {
          type: "tool_result",
          tool_use_id: tu.id,
          content: err instanceof Error ? err.message : "Tool failed",
          is_error: true,
        };
      }
    });
    // All results go back in a single user message.
    messages.push({ role: "user", content: results });

    if (step === MAX_STEPS - 1 && !reply) {
      reply = `I'm having trouble pulling that together. The venue pages or ${MAIN_PHONE} can help.`;
    }
  }

  // Safety net: if the model never called show_venues, show what it looked up.
  const ids = state.shown ?? state.touched.slice(0, MAX_CARDS);
  return {
    reply: reply || `Sorry, I didn't catch that. Could you ask again?`,
    venues: publicVenuesByIds(ids),
  };
}
