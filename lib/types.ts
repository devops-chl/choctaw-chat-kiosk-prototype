export type MenuLink = { label: string; url: string };

export type Venue = {
  id: string;
  name: string;
  category: string;
  blurb: string;
  pageUrl: string;
  image?: string;
  tags: string[];
  location?: string;
  hours?: string;
  phone?: string;
  menus?: MenuLink[];
  reservationUrl?: string;
  orderAheadUrl?: string;
  details?: string; // scraped page text, server-only
};

/** What the browser is allowed to see: never includes scraped `details`. */
export type PublicVenue = Omit<Venue, "details">;

export type Surface = "kiosk" | "phone";

export type ChatMessage = { role: "user" | "assistant"; content: string };

/** A turn as shown in the UI: assistant turns carry their venue cards. */
export type UiTurn = ChatMessage & { id: string; venues?: PublicVenue[]; error?: boolean };

export type ChatRequest = { surface: Surface; messages: ChatMessage[] };
export type ChatResponse = { reply: string; venues: PublicVenue[] };

/** Shape of data/synced.json (written by scripts/sync.mjs). */
export type SyncedVenue = {
  hours?: string;
  menus?: MenuLink[];
  reservationUrl?: string;
  details?: string;
};

/** Shape of data/menus.json (written by scripts/sync.mjs). */
export type MenuText = { label: string; url: string; text: string };
