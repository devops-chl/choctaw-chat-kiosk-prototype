import { allVenues, hasAnyMenuText, menuTextFor, venueById } from "./catalog";
import type { Venue } from "./types";

const MAIN_PHONE = "888-652-4628";

const STOPWORDS = new Set(
  "a an and any are at be can do for from get give good great have i in is it me my of on or place places some something somewhere the there to tonight want what where which with you your".split(
    " ",
  ),
);

// Small synonym map so everyday phrasing lands on catalog tags.
const SYNONYMS: Record<string, string[]> = {
  steak: ["steakhouse", "surf and turf"],
  steaks: ["steak"],
  late: ["late night", "24 hours"],
  night: ["late night"],
  grab: ["quick"],
  go: ["quick"],
  fast: ["quick"],
  drink: ["bar", "cocktails", "beer"],
  drinks: ["bar", "cocktails", "beer"],
  cocktail: ["cocktails"],
  sweet: ["dessert"],
  sweets: ["dessert"],
  breakfast: ["coffee", "bakery"],
  sports: ["sports bar"],
  music: ["live music"],
  fancy: ["upscale"],
  romantic: ["date night"],
  burger: ["burgers"],
  noodle: ["noodles"],
  taco: ["tacos"],
  barbecue: ["bbq"],
  fish: ["seafood"],
};

function tokens(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9&'\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w));
  const out = new Set(words);
  for (const w of words) for (const s of SYNONYMS[w] ?? []) out.add(s);
  return Array.from(out);
}

function scoreVenue(v: Venue, terms: string[]): number {
  const name = v.name.toLowerCase();
  const tags = v.tags.map((t) => t.toLowerCase());
  const category = v.category.toLowerCase();
  const blurb = v.blurb.toLowerCase();
  const location = (v.location ?? "").toLowerCase();
  const details = (v.details ?? "").toLowerCase();
  let score = 0;
  for (const t of terms) {
    if (name.includes(t)) score += 4;
    if (tags.some((tag) => tag === t)) score += 4;
    else if (tags.some((tag) => tag.includes(t))) score += 2;
    if (category.includes(t)) score += 2;
    if (blurb.includes(t)) score += 1;
    if (location.includes(t)) score += 1;
    if (details.includes(t)) score += 0.5;
  }
  return score;
}

/** Compact venue line for tool results. */
export function compact(v: Venue) {
  return {
    id: v.id,
    name: v.name,
    category: v.category,
    location: v.location ?? null,
    tags: v.tags,
    hours: v.hours ?? null,
    takesOnlineReservations: !!v.reservationUrl,
    orderAhead: !!v.orderAheadUrl,
    menuCount: v.menus?.length ?? 0,
  };
}

export function searchVenues(query?: string, category?: string) {
  let pool = allVenues();
  if (category) {
    const c = category.toLowerCase();
    pool = pool.filter((v) => v.category.toLowerCase() === c);
  }
  const terms = query ? tokens(query) : [];
  if (terms.length === 0) {
    return { results: pool.slice(0, 8).map(compact), total: pool.length };
  }
  const ranked = pool
    .map((v) => ({ v, score: scoreVenue(v, terms) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  return {
    results: ranked.map((r) => compact(r.v)),
    total: ranked.length,
    note: ranked.length === 0 ? "No keyword matches. Try a broader query or a category." : undefined,
  };
}

export function getVenue(id: string) {
  const v = venueById(id);
  if (!v) return { error: `Unknown venue id "${id}".` };
  const synced = menuTextFor(id);
  const menuStatus = synced.length
    ? "synced: menu text available via search_menu"
    : v.menus?.length
      ? "pdf-only: menu text not synced; link the PDFs, do not describe dishes"
      : "none: no menu on file; point to the venue page";
  return {
    ...compact(v),
    blurb: v.blurb,
    pageUrl: v.pageUrl,
    phone: v.phone ?? null,
    mainCasinoPhone: MAIN_PHONE,
    menus: v.menus ?? [],
    reservationUrl: v.reservationUrl ?? null,
    orderAheadUrl: v.orderAheadUrl ?? null,
    details: v.details ?? null,
    menuStatus,
  };
}

export function searchMenu(query: string, venueId?: string) {
  if (!hasAnyMenuText() || (venueId && menuTextFor(venueId).length === 0)) {
    const v = venueId ? venueById(venueId) : undefined;
    return {
      matches: [],
      note:
        "Menu text has not been synced for this venue. Do not guess or describe dishes or prices. Offer the menu PDF links or the venue page instead.",
      menus: v?.menus ?? [],
      pageUrl: v?.pageUrl ?? null,
    };
  }
  const terms = tokens(query);
  const ids = venueId ? [venueId] : allVenues().map((v) => v.id);
  const matches: { venue_id: string; menu: string; line: string }[] = [];
  for (const id of ids) {
    for (const menu of menuTextFor(id)) {
      for (const line of menu.text.split("\n")) {
        const l = line.trim();
        if (!l) continue;
        const lower = l.toLowerCase();
        if (terms.length === 0 || terms.some((t) => lower.includes(t))) {
          matches.push({ venue_id: id, menu: menu.label, line: l });
          if (matches.length >= 40) return { matches, truncated: true };
        }
      }
    }
  }
  return {
    matches,
    note: matches.length ? undefined : "No menu lines matched. Do not guess; offer the menu PDFs.",
  };
}

/** Parse "7pm", "7:30 PM", "19:00", "7" (assumes evening) into minutes after midnight. */
export function parseTime(input: string): number | null {
  const m = input.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const ampm = m[3]?.replace(/\./g, "");
  if (h > 23 || min > 59) return null;
  if (ampm === "pm" && h < 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
  if (!ampm && h >= 1 && h <= 11) h += 12; // dinner context: "7" means 7pm
  return h * 60 + min;
}

function fmt(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

/**
 * DEMO MOCK: not real availability. There is no SevenRooms integration yet.
 * For 1832 Steakhouse, 6:00–8:30 PM is always "booked" and the alternatives
 * are 5:15, 8:45, and 9:15 PM. Every response carries `demo: true`.
 */
export function checkAvailability(venueId: string, date: string, time: string, partySize: number) {
  const base = { demo: true as const, disclaimer: "Demo data, not live availability." };
  const v = venueById(venueId);
  if (!v) return { ...base, error: `Unknown venue id "${venueId}".` };
  if (!v.reservationUrl) {
    return {
      ...base,
      venue_id: v.id,
      takesOnlineReservations: false,
      note: `${v.name} does not take online reservations. Suggest walking in, or calling ${v.phone ?? `the casino at ${MAIN_PHONE}`}.`,
    };
  }
  const minutes = parseTime(time);
  if (minutes === null) {
    return { ...base, venue_id: v.id, error: `Could not read the time "${time}". Ask the guest for a time like 7pm.` };
  }
  const requested = fmt(minutes);
  const common = {
    ...base,
    venue_id: v.id,
    date,
    party_size: partySize,
    requested_time: requested,
    venue_hours: v.hours ?? null,
    reservationUrl: v.reservationUrl,
  };
  if (partySize > 8) {
    return {
      ...common,
      available: false,
      note: `Parties over 8 should call ${v.phone ?? MAIN_PHONE} to book.`,
    };
  }
  if (v.id === "1832-steakhouse" && minutes >= 18 * 60 && minutes <= 20 * 60 + 30) {
    return {
      ...common,
      available: false,
      alternatives: ["5:15 PM", "8:45 PM", "9:15 PM"],
    };
  }
  return { ...common, available: true };
}
