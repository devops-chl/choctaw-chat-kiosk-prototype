import type { Metadata } from "next";
import { Chat } from "@/components/Chat";

export const metadata: Metadata = {
  title: "Dining concierge · Choctaw Durant kiosk",
};

// No personal data is collected on the kiosk: the conversation lives only in
// this page's memory and is cleared on "Start over" or after 90s idle.
export default function KioskPage() {
  return <Chat surface="kiosk" />;
}
