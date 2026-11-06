# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Source of truth

`HANDOFF.md` is the full build brief: scope, seed data, tool specs, UI requirements, the phased build order (section 10), and the acceptance demo script (section 11). Read it before starting any phase. This file only summarizes it. If they disagree, `HANDOFF.md` wins.

Status: phases 1–2 (scaffold, lib helpers) are done. Commit after each phase in section 10, and update this line as phases land.

## What this is

A demo AI dining concierge for Choctaw Casino & Resort, Durant. It covers the 29 Durant dining venues only. It is a Next.js 14 App Router app with two surfaces on one backend:
- `/kiosk`: a portrait touchscreen (1080×1920). Venue cards carry a QR code.
- `/c/[token]`: a phone chat that continues the kiosk conversation from the QR code. Cards show action buttons instead of QR codes.
- `/`: a landing page with demo links.

## Commands

```
npm run dev     # next dev -H 0.0.0.0 (so phones on the same Wi-Fi can open QR links)
npm run build
npm run sync    # node scripts/sync.mjs: scrapes live venue pages and menu PDFs into data/
```
There is no test suite. Test `/api/chat` with curl, for example `POST {"surface":"kiosk","messages":[{"role":"user","content":"Where can I get a steak?"}]}`. The reply should include 1832 Steakhouse and/or Salt & Stone in `venues`.

Environment (`.env.local`, never committed): `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`), and `NEXT_PUBLIC_BASE_URL`. For phone testing, set `NEXT_PUBLIC_BASE_URL` to the machine's Wi-Fi IP. Ask the user to set up the key. Never print or log it.

## Architecture

- **Data, no database:** `data/venues.json` holds the curated seed data from HANDOFF section 5. `data/synced.json` and `data/menus.json` are written by `npm run sync`. `lib/catalog.ts` merges seed and synced data, and non-empty synced values win. The scraped `details` field is server-only and must be stripped before venues reach the browser.
- **Concierge:** `app/api/chat/route.ts` uses the Node runtime and returns `{ reply, venues }`. It keeps the last 16 messages, which must start and end on a user turn. It calls `lib/concierge.ts`, a Claude tool-use loop of at most 6 steps with these tools: `search_venues`, `get_venue`, `search_menu`, `check_availability`, and `show_venues`. `show_venues` is a UI directive: its ids (max 3) become the cards the guest sees. The system prompt carries a compact catalog, one line per venue.
- **Availability is a mock:** this lives in `lib/search.ts`. For 1832, 6:00–8:30pm is "booked" and the alternatives are 5:15, 8:45, and 9:15 PM. Every response has `demo: true`, and code comments must also say it is demo data.
- **Kiosk to phone handoff (`lib/handoff.ts`):** there is no server state. The QR URL is `/c/<base64url(JSON {v, q?, a?})>`, with at most 4 venue ids, `q` up to 140 characters, and `a` up to 320 characters. Encode with TextEncoder so Unicode is safe. If decoding fails, the phone page falls back to an empty chat.
- **Shared `Chat` component** takes a `surface` prop (`"kiosk"` or `"phone"`). Surface-specific behavior: idle reset after 90s, Web Speech button when supported, QR ticket-stub panel versus action buttons.

## Rules that are easy to get wrong

- Pin versions: next 14.2.15, react 18.3.1, typescript 5.5.4, @anthropic-ai/sdk 0.39.0, and qrcode 1.5.4. Dev dependencies: cheerio 1.0.0 and pdf-parse 1.1.1. Import pdf-parse as `pdf-parse/lib/pdf-parse.js`.
- Use plain CSS only, with no Tailwind. Every color and font is a `:root` variable in `app/globals.css`, because these are placeholders for Choctaw brand values. Load the fonts (Marcellus and Figtree) with a Google Fonts `<link>`, not `next/font`. Use plain `<img>` for remote venue images. Use sentence case. The typing indicator is the only ambient animation.
- Use only facts from the catalog or tool results. Never invent dishes, prices, hours, or phone numbers. Fall back to the venue page or 888-652-4628.
- Don't add fields to `venues.json` that the site doesn't state.
- Keep scraping polite: wait about 1s between requests, run only on demand, and respect robots.txt. One venue failing must not stop the run.
- The kiosk must not collect personal data. Any Vercel deployment needs Deployment Protection turned on.
- Before the final styling pass, ask the user for brand screenshots or a brand guide.
