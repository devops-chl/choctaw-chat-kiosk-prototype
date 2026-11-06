import seed from "@/data/venues.json";
import syncedRaw from "@/data/synced.json";
import menusRaw from "@/data/menus.json";
import type { MenuText, PublicVenue, SyncedVenue, Venue } from "./types";

// Static imports so the data is bundled for Vercel. Re-run `npm run sync`
// and restart the dev server to pick up new synced data.
const synced = syncedRaw as Record<string, SyncedVenue>;
const menuTexts = menusRaw as Record<string, MenuText[]>;

function nonEmpty<T>(value: T | undefined | null): value is T {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/** Seed data merged with synced data. Synced values win when non-empty. */
function merge(base: Venue): Venue {
  const s = synced[base.id];
  if (!s) return base;
  return {
    ...base,
    hours: nonEmpty(s.hours) ? s.hours : base.hours,
    menus: nonEmpty(s.menus) ? s.menus : base.menus,
    reservationUrl: nonEmpty(s.reservationUrl) ? s.reservationUrl : base.reservationUrl,
    details: nonEmpty(s.details) ? s.details : base.details,
  };
}

const VENUES: Venue[] = (seed as Venue[]).map(merge);
const BY_ID = new Map(VENUES.map((v) => [v.id, v]));

export function allVenues(): Venue[] {
  return VENUES;
}

export function venueById(id: string): Venue | undefined {
  return BY_ID.get(id);
}

export function categories(): string[] {
  return Array.from(new Set(VENUES.map((v) => v.category)));
}

/** Synced menu text for a venue (empty if the sync hasn't run or failed). */
export function menuTextFor(id: string): MenuText[] {
  return (menuTexts[id] ?? []).filter((m) => nonEmpty(m.text));
}

export function hasAnyMenuText(): boolean {
  return Object.values(menuTexts).some((list) => list?.some((m) => nonEmpty(m.text)));
}

/** Strip server-only fields before anything goes to the browser. */
export function toPublic(v: Venue): PublicVenue {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { details, ...rest } = v;
  return rest;
}

export function publicVenuesByIds(ids: string[]): PublicVenue[] {
  return ids.map((id) => BY_ID.get(id)).filter((v): v is Venue => !!v).map(toPublic);
}
