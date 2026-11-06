import type { Metadata } from "next";
import { Chat } from "@/components/Chat";
import { publicVenuesByIds } from "@/lib/catalog";
import { decodeHandoff } from "@/lib/handoff";
import type { UiTurn } from "@/lib/types";

export const metadata: Metadata = {
  title: "Dining concierge · Choctaw Durant",
  robots: { index: false, follow: false },
};

/**
 * Phone surface. The QR token carries a small snapshot of the kiosk chat
 * (venue ids, last question, last answer). If it can't be decoded, this
 * falls back to an empty phone chat.
 */
export default function PhonePage({ params }: { params: { token: string } }) {
  const handoff = decodeHandoff(params.token);
  const venues = handoff ? publicVenuesByIds(handoff.v) : [];

  const turns: UiTurn[] = [];
  if (handoff?.q) turns.push({ id: "h-q", role: "user", content: handoff.q });
  if (handoff && (handoff.a || venues.length)) {
    turns.push({
      id: "h-a",
      role: "assistant",
      content: handoff.a ?? "Here's what you were looking at on the kiosk.",
      venues,
    });
  }

  return (
    <Chat
      surface="phone"
      initialTurns={turns}
      note={turns.length ? "Picked up from the kiosk. Ask a follow-up any time." : undefined}
    />
  );
}
