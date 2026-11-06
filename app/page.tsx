import Link from "next/link";
import { encodeHandoff } from "@/lib/handoff";

// Demo navigation only.
const SAMPLE = encodeHandoff({
  v: ["1832-steakhouse", "salt-stone"],
  q: "Where can I get a great steak tonight?",
  a: "For a special steak night, try 1832 Steakhouse in Sky Casino. For something more casual, Salt & Stone also serves steak and surf and turf.",
});

export default function Home() {
  return (
    <main style={{ maxWidth: 560, margin: "0 auto", padding: "64px 16px" }}>
      <p style={{ color: "var(--brass)", fontFamily: "var(--font-display)", fontSize: 22, margin: 0 }}>
        Choctaw Durant
      </p>
      <h1 style={{ marginTop: 4 }}>Dining concierge demo</h1>
      <p style={{ color: "var(--mist)" }}>Two surfaces, one concierge.</p>
      <ul style={{ lineHeight: 2.2, paddingLeft: 20 }}>
        <li>
          <Link href="/kiosk">Kiosk</Link> <span style={{ color: "var(--mist)" }}>(portrait touchscreen)</span>
        </li>
        <li>
          <Link href={`/c/${SAMPLE}`}>Sample phone handoff</Link>{" "}
          <span style={{ color: "var(--mist)" }}>(what a QR scan opens)</span>
        </li>
      </ul>
    </main>
  );
}
