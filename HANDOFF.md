# Choctaw Chatbot Concierge: Build Handoff

This file briefs Claude Code on a demo we're building. Read it fully before writing code, then follow the build order in section 10. Save it in the project root as `HANDOFF.md`. Once the project is scaffolded, add a short `CLAUDE.md` that points back to this file.

## 1. What we're building

This is an AI dining concierge for **Choctaw Casino & Resort, Durant (OK)**. It has two surfaces that share one backend:

1. **Kiosk** (`/kiosk`): a portrait touchscreen on the casino floor. Guests type or speak questions about places to eat and drink, such as menus, hours, where a venue is, or booking a table. Answers show venue cards with photos. Each card has a **QR code**.
2. **Phone** (`/c/[token]`): scanning the QR code opens a mobile web chat that **continues the kiosk conversation**. It shows action buttons (Book a table, Order ahead, menu PDFs) and supports follow-up questions like "show me the menu", "where is it?", or "what else is similar if it's booked?".

The demo scope is **Durant dining only** (29 venues). Hotel, gaming, shows, and other properties come later.

## 2. Project location and setup

- Folder: `~/Documents/Choctaw Chatbot Concierge`
- It runs locally first. GitHub and Vercel get hooked up afterwards.
- Run `git init` at the start and commit after each phase in section 10.

## 3. Stack (pin these versions)

- Next.js 14.2.15 (App Router), React 18.3.1, TypeScript 5.5.4
- `@anthropic-ai/sdk` 0.39.0 for Claude with tool use
- `qrcode` 1.5.4 (+ `@types/qrcode`)
- For the sync script (dev dependencies): `cheerio` 1.0.0 and `pdf-parse` 1.1.1. Import pdf-parse as `pdf-parse/lib/pdf-parse.js` to avoid its debug-mode file read.
- Don't use a database for the demo. Data lives in JSON files under `data/`.
- Plain CSS with design tokens as CSS variables. No Tailwind, so it's easy to swap in Choctaw brand values later.

package.json scripts:
```json
"dev": "next dev -H 0.0.0.0",
"build": "next build",
"start": "next start",
"sync": "node scripts/sync.mjs"
```
`-H 0.0.0.0` is there so a phone on the same Wi-Fi can open the QR link during local testing.

### Environment (`.env.example`; real values go in `.env.local`, which is never committed)
```
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-5-5
# Address phones use to open QR links. Locally: your machine's Wi-Fi IP, e.g. http://192.168.1.42:3000
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```
Ask me for the API key setup. Never print, log, or commit the key.

## 4. Source site facts (already researched)

- The listing page is https://www.choctawcasinos.com/durant/eat-drink/. It has 29 venues in 6 groups: Fine Dining, Casual Dining, District Hall, Food Court, Bars & Lounges, and Dessert.
- The site runs on **WordPress** (`/wp-content/uploads/`). Try the REST API first (`/wp-json/wp/v2/pages?slug=...`). Fall back to HTML parsing if it's disabled.
- Venue detail pages follow one pattern (example: `/durant/eat-drink/1832-steakhouse/`):
  - an `h6` "Hours" heading followed by the hours text
  - menu links pointing to **PDFs** in `/wp-content/uploads/`
  - an `h6` "Reservations" heading with a "Book a table" link to **SevenRooms** (`https://www.sevenrooms.com/reservations/1832steakhouse`)
- Order-ahead for most casual venues goes to LuckyEats: https://durant-luckyeats.choctawcasinos.com/
- Main casino phone: 888-652-4628
- Only 1832 Steakhouse is confirmed to take online reservations. It's also the **only Fine Dining venue**, so "other fine dining options" has to be answered by matching tags (sit-down, steak, seafood). Salt & Stone (surf and turf, also in the Sky Casino) is the natural alternative.
- Venue images are hosted on the site's `wp-content/uploads`. Use those URLs with plain `<img>` (no `next/image` remote config needed for the demo).

## 5. Seed data: create `data/venues.json` from this

This was curated from the live listing page. `location` is set only where the site states it. `hours` is set only where known. Don't invent other fields.

```json
[
  {
    "id": "1832-steakhouse",
    "name": "1832 Steakhouse",
    "category": "Fine Dining",
    "blurb": "Award-winning steak and seafood with scenic views, an extensive wine list, and private rooms for special occasions.",
    "pageUrl": "https://www.choctawcasinos.com/durant/eat-drink/1832-steakhouse/",
    "image": "https://www.choctawcasinos.com/wp-content/uploads/2021/12/966550-DUR-December-Webpics3.jpg",
    "tags": [
      "upscale",
      "sit-down",
      "steak",
      "seafood",
      "wine",
      "date night",
      "special occasion",
      "private rooms"
    ],
    "location": "Sky Casino",
    "hours": "Sun–Thu 5pm–10pm; Fri–Sat 5pm–11pm (hours may vary)",
    "menus": [
      {
        "label": "Main menu",
        "url": "https://www.choctawcasinos.com/wp-content/uploads/2025/01/1832-menu.pdf"
      },
      {
        "label": "Dessert menu",
        "url": "https://www.choctawcasinos.com/wp-content/uploads/2023/06/1628972-DUR-June-1832DessertMenuUpdate-Web_rev1.pdf"
      },
      {
        "label": "Beverage menu",
        "url": "https://www.choctawcasinos.com/wp-content/uploads/2026/05/1832-beverage.pdf"
      }
    ],
    "reservationUrl": "https://www.sevenrooms.com/reservations/1832steakhouse"
  },
  {
    "id": "salt-stone",
    "name": "Salt & Stone",
    "category": "Casual Dining",
    "blurb": "Surf and turf dishes made with fresh ingredients.",
    "pageUrl": "https://www.choctawcasinos.com/durant/eat-drink/salt-stone/",
    "image": "https://www.choctawcasinos.com/wp-content/uploads/2021/12/966550-DUR-December-Webpics9.jpg",
    "tags": [
      "sit-down",
      "steak",
      "seafood",
      "surf and turf"
    ],
    "location": "Sky Casino",
    "orderAheadUrl": "https://durant-luckyeats.choctawcasinos.com/"
  },
  {
    "id": "the-league",
    "name": "The League",
    "category": "Casual Dining",
    "blurb": "Sports bar for catching a game and grabbing a beer.",
    "pageUrl": "https://www.choctawcasinos.com/durant/things-to-do/the-league/",
    "image": "https://www.choctawcasinos.com/wp-content/uploads/2021/12/966550-DUR-December-Webpics13.jpg",
    "tags": [
      "sports bar",
      "beer",
      "games on TV"
    ],
    "location": "Sky Casino",
    "orderAheadUrl": "https://durant-luckyeats.choctawcasinos.com/"
  },
  {
    "id": "starbucks",
    "name": "Starbucks",
    "category": "Casual Dining",
    "blurb": "Starbucks coffee and espresso drinks.",
    "pageUrl": "https://www.choctawcasinos.com/durant/eat-drink/starbucks/",
    "image": "https://www.choctawcasinos.com/wp-content/uploads/2021/12/966550-DUR-December-Webpics5.jpg",
    "tags": [
      "coffee",
      "espresso",
      "quick"
    ],
    "orderAheadUrl": "https://durant-luckyeats.choctawcasinos.com/"
  },
  {
    "id": "guy-fieris",
    "name": "Guy Fieri's American Kitchen + Bar",
    "category": "Casual Dining",
    "blurb": "Bold American comfort food and bar favorites from Guy Fieri.",
    "pageUrl": "https://www.choctawcasinos.com/durant/eat-drink/guy-fieris/",
    "image": "https://www.choctawcasinos.com/wp-content/uploads/2021/08/guy-fieri.jpg",
    "tags": [
      "sit-down",
      "american",
      "burgers",
      "bar"
    ],
    "orderAheadUrl": "https://durant-luckyeats.choctawcasinos.com/"
  },
  {
    "id": "gilleys",
    "name": "Gilley's Durant",
    "category": "Casual Dining",
    "blurb": "Live performances, cold beer, and down-home cooking.",
    "pageUrl": "https://www.choctawcasinos.com/durant/eat-drink/gilleys/",
    "image": "https://www.choctawcasinos.com/wp-content/uploads/2022/07/line-dancing-boots_740x400.jpg",
    "tags": [
      "live music",
      "southern",
      "bar",
      "dancing"
    ],
    "orderAheadUrl": "https://durant-luckyeats.choctawcasinos.com/"
  },
  {
    "id": "grand-cafe",
    "name": "Grand Café",
    "category": "Casual Dining",
    "blurb": "American classics with international twists.",
    "pageUrl": "https://www.choctawcasinos.com/durant/eat-drink/grand-cafe/",
    "image": "https://www.choctawcasinos.com/wp-content/uploads/2021/12/966550-DUR-December-Webpics21.jpg",
    "tags": [
      "sit-down",
      "american",
      "sandwiches"
    ],
    "orderAheadUrl": "https://durant-luckyeats.choctawcasinos.com/"
  },
  {
    "id": "butterfields-buffet",
    "name": "Butterfields Buffet",
    "category": "Casual Dining",
    "blurb": "Buffet ranging from Tex-Mex to Southern-style comfort food.",
    "pageUrl": "https://www.choctawcasinos.com/durant/eat-drink/butterfields-buffet/",
    "image": "https://www.choctawcasinos.com/wp-content/uploads/2025/04/butterfields-buffet740x400.jpg",
    "tags": [
      "buffet",
      "tex-mex",
      "southern",
      "groups"
    ]
  },
  {
    "id": "bamboo-noodle-bar",
    "name": "Bamboo Noodle Bar",
    "category": "Casual Dining",
    "blurb": "Asian cuisine favorites in one place.",
    "pageUrl": "https://www.choctawcasinos.com/durant/eat-drink/bamboo-noodle-bar/",
    "image": "https://www.choctawcasinos.com/wp-content/uploads/2021/08/bamboo.jpg",
    "tags": [
      "asian",
      "noodles"
    ],
    "orderAheadUrl": "https://durant-luckyeats.choctawcasinos.com/"
  },
  {
    "id": "velvet-taco",
    "name": "Velvet Taco",
    "category": "District Hall",
    "blurb": "Creative, anything-goes tacos.",
    "pageUrl": "https://www.choctawcasinos.com/durant/eat-drink/velvet-taco/",
    "image": "https://www.choctawcasinos.com/wp-content/uploads/2023/04/1578602-DUR-April-DistrictFoodHallWebRUSH-Velvet-Taco-740x402-1.jpg",
    "tags": [
      "tacos",
      "quick",
      "food hall"
    ],
    "location": "District Hall",
    "orderAheadUrl": "https://durant-luckyeats.choctawcasinos.com/"
  },
  {
    "id": "italia-kitchen",
    "name": "Italia Kitchen",
    "category": "District Hall",
    "blurb": "Italian cuisine made with fresh ingredients.",
    "pageUrl": "https://www.choctawcasinos.com/italia-kitchen/",
    "image": "https://www.choctawcasinos.com/wp-content/uploads/2023/04/1578602-DUR-April-DistrictFoodHallWebRUSH-ItaliaKitchen-740x402-1.jpg",
    "tags": [
      "italian",
      "quick",
      "food hall"
    ],
    "location": "District Hall",
    "orderAheadUrl": "https://durant-luckyeats.choctawcasinos.com/"
  },
  {
    "id": "south-hot-chicken",
    "name": "South Hot Chicken",
    "category": "District Hall",
    "blurb": "Hand-breaded chicken with a spicy kick.",
    "pageUrl": "https://www.choctawcasinos.com/south-hot-chicken/",
    "image": "https://www.choctawcasinos.com/wp-content/uploads/2023/04/1578602-DUR-April-DistrictFoodHallWebRUSH-South-740x402-1.jpg",
    "tags": [
      "chicken",
      "spicy",
      "quick",
      "food hall"
    ],
    "location": "District Hall",
    "orderAheadUrl": "https://durant-luckyeats.choctawcasinos.com/"
  },
  {
    "id": "the-pit",
    "name": "The Pit",
    "category": "District Hall",
    "blurb": "Barbecue.",
    "pageUrl": "https://www.choctawcasinos.com/durant/eat-drink/the-pit/",
    "image": "https://www.choctawcasinos.com/wp-content/uploads/2023/04/1578602-DUR-April-DistrictFoodHallWebRUSH-ThePit-740x402-1.jpg",
    "tags": [
      "bbq",
      "quick",
      "food hall"
    ],
    "location": "District Hall",
    "orderAheadUrl": "https://durant-luckyeats.choctawcasinos.com/"
  },
  {
    "id": "slushd",
    "name": "Slush'D Frozen Daiquiris",
    "category": "District Hall",
    "blurb": "Specialty frozen drinks in a variety of flavors.",
    "pageUrl": "https://www.choctawcasinos.com/slushd-frozen-daiquiris/",
    "image": "https://www.choctawcasinos.com/wp-content/uploads/2023/04/1578602-DUR-April-DistrictFoodHallWebRUSH-SlushD-740x402-1.jpg",
    "tags": [
      "frozen drinks",
      "daiquiris",
      "cocktails"
    ],
    "location": "District Hall"
  },
  {
    "id": "cinnabon",
    "name": "Cinnabon",
    "category": "Food Court",
    "blurb": "Cinnamon rolls and sweet treats.",
    "pageUrl": "https://www.choctawcasinos.com/durant/eat-drink/cinnabon/",
    "image": "https://www.choctawcasinos.com/wp-content/uploads/2022/10/1290857-FB-DUR-Sep-CinnabonComingSoon-740X400.jpg",
    "tags": [
      "dessert",
      "cinnamon rolls",
      "quick"
    ],
    "location": "Food Court",
    "orderAheadUrl": "https://durant-luckyeats.choctawcasinos.com/"
  },
  {
    "id": "carvel",
    "name": "Carvel",
    "category": "Food Court",
    "blurb": "Classic soft-serve ice cream.",
    "pageUrl": "https://www.choctawcasinos.com/durant/eat-drink/carvel/",
    "image": "https://www.choctawcasinos.com/wp-content/uploads/2025/03/carvel740x400.jpg",
    "tags": [
      "dessert",
      "ice cream",
      "quick"
    ],
    "location": "Food Court",
    "orderAheadUrl": "https://durant-luckyeats.choctawcasinos.com/"
  },
  {
    "id": "smashburger",
    "name": "Smashburger",
    "category": "Food Court",
    "blurb": "Smashed burgers.",
    "pageUrl": "https://www.choctawcasinos.com/durant/eat-drink/smashburger/",
    "image": "https://www.choctawcasinos.com/wp-content/uploads/2021/08/smashburger.jpg",
    "tags": [
      "burgers",
      "quick"
    ],
    "location": "Food Court",
    "orderAheadUrl": "https://durant-luckyeats.choctawcasinos.com/"
  },
  {
    "id": "papa-johns",
    "name": "Papa John's Pizza",
    "category": "Food Court",
    "blurb": "Pizza.",
    "pageUrl": "https://www.choctawcasinos.com/durant/eat-drink/papa-johns-pizza/",
    "image": "https://www.choctawcasinos.com/wp-content/uploads/2021/08/papa-johns.jpg",
    "tags": [
      "pizza",
      "quick"
    ],
    "location": "Food Court",
    "orderAheadUrl": "https://durant-luckyeats.choctawcasinos.com/"
  },
  {
    "id": "krispy-krunchy",
    "name": "Krispy Krunchy Chicken",
    "category": "Food Court",
    "blurb": "Cajun-style chicken and honey butter biscuits.",
    "pageUrl": "https://www.choctawcasinos.com/durant/eat-drink/krispy-krunchy-chicken/",
    "image": "https://www.choctawcasinos.com/wp-content/uploads/2021/08/krispy-krunchy-chicken.jpg",
    "tags": [
      "chicken",
      "cajun",
      "biscuits",
      "quick"
    ],
    "location": "Food Court",
    "orderAheadUrl": "https://durant-luckyeats.choctawcasinos.com/"
  },
  {
    "id": "prizm-lounge",
    "name": "Prizm Lounge",
    "category": "Bars & Lounges",
    "blurb": "World-class bar and lounge in the heart of the Sky Casino.",
    "pageUrl": "https://www.choctawcasinos.com/durant/eat-drink/prizm-lounge/",
    "image": "https://www.choctawcasinos.com/wp-content/uploads/2021/12/966550-DUR-December-Webpics27.jpg",
    "tags": [
      "lounge",
      "cocktails",
      "upscale"
    ],
    "location": "Sky Casino"
  },
  {
    "id": "lobby-bar",
    "name": "Lobby Bar",
    "category": "Bars & Lounges",
    "blurb": "A see-and-be-seen bar.",
    "pageUrl": "https://www.choctawcasinos.com/durant/eat-drink/lobby-bar/",
    "image": "https://www.choctawcasinos.com/wp-content/uploads/2021/12/966550-DUR-December-Webpics35.jpg",
    "tags": [
      "bar",
      "cocktails"
    ]
  },
  {
    "id": "the-reserve",
    "name": "The Reserve",
    "category": "Bars & Lounges",
    "blurb": "Artisan cocktail bar with an upscale feel.",
    "pageUrl": "https://www.choctawcasinos.com/durant/eat-drink/the-reserve/",
    "image": "https://www.choctawcasinos.com/wp-content/uploads/2021/12/966550-DUR-December-Webpics23.jpg",
    "tags": [
      "cocktails",
      "upscale",
      "craft cocktails"
    ]
  },
  {
    "id": "onyx-bar",
    "name": "Onyx Bar",
    "category": "Bars & Lounges",
    "blurb": "Bar in the High Limits area.",
    "pageUrl": "https://www.choctawcasinos.com/durant/eat-drink/onyx-bar/",
    "image": "https://www.choctawcasinos.com/wp-content/uploads/2021/12/966550-DUR-December-Webpics31.jpg",
    "tags": [
      "bar",
      "high limits"
    ],
    "location": "Sky Casino (High Limits)"
  },
  {
    "id": "mason-jar-bar",
    "name": "Mason Jar Bar",
    "category": "Bars & Lounges",
    "blurb": "Bar at the heart of the Link Casino.",
    "pageUrl": "https://www.choctawcasinos.com/durant/eat-drink/mason-jar-bar/",
    "image": "https://www.choctawcasinos.com/wp-content/uploads/2021/08/mason-jar.jpg",
    "tags": [
      "bar"
    ],
    "location": "Link Casino"
  },
  {
    "id": "red-river-lounge",
    "name": "Red River Lounge",
    "category": "Bars & Lounges",
    "blurb": "Full-service bar.",
    "pageUrl": "https://www.choctawcasinos.com/durant/eat-drink/red-river-lounge/",
    "image": "https://www.choctawcasinos.com/wp-content/uploads/2021/08/red-river.jpg",
    "tags": [
      "bar"
    ]
  },
  {
    "id": "tailgaters-lounge",
    "name": "Tailgater's Lounge",
    "category": "Bars & Lounges",
    "blurb": "Bar and lounge in The District.",
    "pageUrl": "https://www.choctawcasinos.com/durant/eat-drink/tailgaters-lounge/",
    "image": "https://www.choctawcasinos.com/wp-content/uploads/2021/08/tailgater.jpg",
    "tags": [
      "bar",
      "lounge"
    ],
    "location": "The District"
  },
  {
    "id": "platinum-high-limit",
    "name": "Platinum High Limit Lounge",
    "category": "Bars & Lounges",
    "blurb": "Premium bar with elite service.",
    "pageUrl": "https://www.choctawcasinos.com/durant/eat-drink/platinum-high-limit-lounge/",
    "image": "https://www.choctawcasinos.com/wp-content/uploads/2021/08/high-limits.jpg",
    "tags": [
      "bar",
      "premium",
      "high limits"
    ]
  },
  {
    "id": "north-brew",
    "name": "North Brew",
    "category": "Bars & Lounges",
    "blurb": "Walk-through spot for your favorite brew.",
    "pageUrl": "https://www.choctawcasinos.com/durant/eat-drink/north-brew/",
    "image": "https://www.choctawcasinos.com/wp-content/uploads/2021/08/north-brew.jpg",
    "tags": [
      "beer",
      "quick"
    ]
  },
  {
    "id": "grand-bakery",
    "name": "Grand Bakery",
    "category": "Dessert",
    "blurb": "Bakery open 24 hours.",
    "pageUrl": "https://www.choctawcasinos.com/durant/eat-drink/grand-bakery-2/",
    "image": "https://www.choctawcasinos.com/wp-content/uploads/2021/12/966550-DUR-December-Webpics38.jpg",
    "tags": [
      "dessert",
      "bakery",
      "24 hours",
      "late night"
    ],
    "hours": "Open 24 hours"
  }
]
```

Also create `data/synced.json` and `data/menus.json`, each containing `{}`. The sync script fills them in.

Types (`lib/types.ts`):
```ts
type MenuLink = { label: string; url: string };
type Venue = {
  id: string; name: string; category: string; blurb: string; pageUrl: string;
  image?: string; tags: string[]; location?: string; hours?: string; phone?: string;
  menus?: MenuLink[]; reservationUrl?: string; orderAheadUrl?: string;
  details?: string; // scraped page text, server-only
};
type Surface = "kiosk" | "phone";
```

## 6. Data pipeline: `scripts/sync.mjs`

This is the "scraping" piece, run locally with `npm run sync`. It's a small version of the production ingestion job.

For each venue in `data/venues.json`:
1. Fetch `pageUrl` (or the WP REST equivalent). Send a polite user agent and wait about 1s between requests.
2. Extract the hours (text after the `h6` "Hours"), PDF menu links (each anchor's label and href), any SevenRooms link, and the main content text (cleaned, about 3,000 characters max). Write these to `data/synced.json` as `{ [id]: { hours, menus, reservationUrl, details } }`.
3. Download each menu PDF, extract the text with pdf-parse, and normalize whitespace while keeping line breaks. Write to `data/menus.json` as `{ [id]: [{ label, url, text }] }`.
4. Log a summary: venues synced, menus parsed, and failures. A failure on one venue shouldn't stop the run.

`lib/catalog.ts` merges `venues.json` with `synced.json`. Synced values win when they're non-empty. Keep `details` server-side only, and strip it before sending venues to the browser.

## 7. Concierge backend

`app/api/chat/route.ts` (Node runtime) takes `POST { surface, messages: [{role, content}] }` and returns `{ reply, venues: Venue[] }`.
- Return a clear 500 error if `ANTHROPIC_API_KEY` is missing.
- Keep the last 16 messages. Make sure the conversation starts with a user turn and ends with one.

`lib/concierge.ts` runs a Claude tool-use loop with at most 6 steps. Tools:

| Tool | Purpose |
|---|---|
| `search_venues(query?, category?)` | Keyword match over name, blurb, tags, location, and details. Returns up to 8 compact results. |
| `get_venue(id)` | Full details, plus `menuStatus` saying whether menu text has been synced. |
| `search_menu(query, venue_id?)` | Searches `menus.json` lines. If nothing is synced, it returns a note telling the model not to guess. |
| `check_availability(venue_id, date, time, party_size)` | **Demo mock.** For 1832, 6:00–8:30pm is "booked" and the alternatives are 5:15, 8:45, and 9:15 PM. Every response has `demo: true`. |
| `show_venues(venue_ids[])` | A UI directive, max 3. These ids become the cards the guest sees. |

The system prompt must cover these points:
- The role (Durant dining concierge), today's date in America/Chicago time, and which surface the guest is on.
- Kiosk answers are 2–3 short sentences and point to the QR code for booking, ordering, or full menus. Phone answers can be slightly longer.
- **Only state facts from the catalog or tool results.** Never invent dishes, prices, hours, dress codes, or phone numbers. If something is missing, point to the venue page or 888-652-4628.
- Always call `show_venues` when discussing specific venues.
- Availability comes from demo data. When a time is booked, offer alternative times and a similar venue matched by tags.
- Mention that "hours may vary" when it's relevant.
- Out of scope (hotel, gaming, shows): say it's coming soon and suggest the front desk.
- No markdown headings or tables in replies.
- Include a compact catalog in the prompt, one line per venue: `id | name | category | location | tags | flags`.

## 8. Kiosk to phone handoff

The demo needs no database. The QR code encodes a small, non-personal snapshot in the URL:
```ts
type Handoff = { v: string[] /* venue ids, max 4 */; q?: string /* last question, ≤140 chars */; a?: string /* last answer, ≤320 chars */ };
// token = base64url(JSON) using TextEncoder (Unicode-safe); URL = `${NEXT_PUBLIC_BASE_URL || origin}/c/${token}`
```
The phone page decodes the token. It seeds the chat with the question and answer, rebuilds the venue cards from the ids, and shows a "Picked up from the kiosk" note. If decoding fails, it shows the normal empty phone chat.

**Production note (don't build yet):** replace the token with a short random id stored in Redis (Upstash) with a 24-hour expiry. That makes the QR codes smaller and keeps the full history.

## 9. UI requirements

**Kiosk (`/kiosk`)**, designed for portrait 1080×1920 and also usable on a laptop:
- A header with "Choctaw Durant" and "Dining concierge", plus a "Start over" button once a chat has started.
- A welcome state with 4 suggestion chips: "Where can I get a great steak tonight?", "Book 1832 Steakhouse for two at 7pm", "Something quick I can grab and go", "What's open late?"
- Large type and big touch targets (at least 56px). The input and the Ask button stay pinned to the bottom.
- A **Speak** button using the Web Speech API, shown only when the browser supports it.
- Venue cards show a photo, name, category and location, the blurb, and hours. On the right is a **ticket-stub QR panel** (a perforated dashed divider) labeled by intent: "Scan to book on your phone", "Scan to order ahead", or "Scan to take this with you".
- An idle reset clears the conversation after 90s with no touches.
- No personal data is collected on the kiosk.

**Phone (`/c/[token]`):**
- The same chat component with `surface="phone"`.
- Cards show buttons instead of a QR code: Book a table (SevenRooms), Order ahead (LuckyEats), one button per menu PDF, and Venue page.
- Suggestion chips: "Show me the menu", "Where is it located?", "What else is similar if it's booked?"

**Landing (`/`):** a simple page linking to `/kiosk` and a sample phone link, for demo navigation.

**Styling:** we'll match choctawcasinos.com's look, but the brand tokens aren't in hand yet. Put every color and font in `:root` variables in `app/globals.css`, with a comment saying to replace them with Choctaw brand values. Use these placeholder tokens:
- Night `#141A33` (background, a nod to the Sky Tower), Panel `#1F2747`, Line `#2E3760`
- Brass `#C8A250` (primary accent and buttons), Ivory `#F4EFE4` (text), Mist `#A3ABC6` (secondary text)
- Display font: Marcellus. Body font: Figtree. Load both via a Google Fonts `<link>` in the layout, not `next/font`.
- Use sentence case everywhere. Show visible focus states, respect `prefers-reduced-motion`, and keep the typing indicator as the only ambient animation.

Ask me for screenshots or a brand guide before the final styling pass.

## 10. Build order (commit after each)

1. Scaffold the project, config, `.env.example`, `.gitignore`, and the data files from section 5. Confirm `npm run dev` serves a page.
2. Build `lib/types.ts`, `lib/catalog.ts`, `lib/search.ts` (the search helpers and the availability mock), and `lib/handoff.ts`.
3. Build `lib/concierge.ts` and the `/api/chat` route. Test with curl: "Where can I get a steak?" should return 1832 and/or Salt & Stone in `venues`.
4. Build the `Chat`, `VenueCard`, and `QrCode` components, then the `/kiosk` page.
5. Build the `/c/[token]` phone page and the handoff. Test it by scanning from a real phone on the same Wi-Fi, with `NEXT_PUBLIC_BASE_URL` set to the machine's local IP.
6. Write `scripts/sync.mjs` and run it against the live site. Report what parsed and what failed.
7. Do the styling pass with brand tokens, plus a README covering setup, the sync step, local phone testing, and Vercel deployment notes.

## 11. Acceptance checks (the demo script)

1. Kiosk: "Where can I get a great steak tonight?" → a short answer and a 1832 card with a QR code.
2. Kiosk: "Book it for two at 7pm" → it says 7pm is taken (demo), offers 5:15, 8:45, or 9:15 PM, may suggest Salt & Stone, and points to the QR code.
3. Scan the QR code → the phone opens with the same question, answer, and cards, plus a Book a table button that goes to SevenRooms.
4. Phone: "Show me the menu" → it uses synced menu text if available, otherwise it links the menu PDFs. It never makes up dishes.
5. Phone: "Where is it?" → "Sky Casino", with hours and the note that they may vary.
6. Kiosk left idle for 90s → it resets to the welcome screen.
7. Ask about hotel check-in → the bot politely says that's out of scope.

## 12. Guardrails

- Never commit `.env.local` or any key.
- The demo uses Choctaw's trademarks and content. When it's deployed to Vercel, turn on **Deployment Protection** (password or Vercel login) so it isn't public.
- Mock availability must stay clearly labeled as demo data, both in code comments and in the tool output.
- Keep scraping polite: low request rate, run on demand only, and respect robots.txt.

## 13. Later phases (out of scope now)

- Live availability through the SevenRooms API. This requires the client's SevenRooms partner or API access.
- A persistent store: Postgres with pgvector for menus, Redis for handoff sessions, and a WordPress publish webhook to trigger the sync.
- More amenities (Stay, RV Park, Things to Do, Movies, Live Entertainment, Promotions) and more properties (Pocola, Grant, Hochatown, and others).
- Wayfinding (floor and nearest entrance per venue), analytics on QR scans, and Spanish language support.
