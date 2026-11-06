"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { handoffUrl } from "@/lib/handoff";
import type { ChatResponse, PublicVenue, Surface, UiTurn } from "@/lib/types";
import { VenueCard } from "./VenueCard";
import "./concierge.css";

const IDLE_MS = 90_000;

const SUGGESTIONS: Record<Surface, string[]> = {
  kiosk: [
    "Where can I get a great steak tonight?",
    "Book 1832 Steakhouse for two at 7pm",
    "Something quick I can grab and go",
    "What's open late?",
  ],
  phone: ["Show me the menu", "Where is it located?", "What else is similar if it's booked?"],
};

// Minimal typing for the Web Speech API (not in TypeScript's DOM lib).
type SpeechRec = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  abort: () => void;
};
type SpeechRecCtor = new () => SpeechRec;

function speechCtor(): SpeechRecCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechRecCtor; webkitSpeechRecognition?: SpeechRecCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

let nextId = 0;
const newId = () => `t${Date.now().toString(36)}${(nextId++).toString(36)}`;

export function Chat({
  surface,
  initialTurns = [],
  note,
}: {
  surface: Surface;
  initialTurns?: UiTurn[];
  /** Small banner above the conversation, e.g. "Picked up from the kiosk". */
  note?: string;
}) {
  const [turns, setTurns] = useState<UiTurn[]>(initialTurns);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [canSpeak, setCanSpeak] = useState(false);
  const [listening, setListening] = useState(false);
  const [origin, setOrigin] = useState("");

  const session = useRef(0); // bumped on reset so late responses are dropped
  const abort = useRef<AbortController | null>(null);
  const recognizer = useRef<SpeechRec | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const idleTimer = useRef<number | undefined>(undefined);

  const started = turns.length > 0;

  useEffect(() => {
    setCanSpeak(!!speechCtor());
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [turns, loading]);

  const reset = useCallback(() => {
    session.current++;
    abort.current?.abort();
    recognizer.current?.abort();
    setTurns([]);
    setInput("");
    setLoading(false);
    setListening(false);
  }, []);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || loading) return;

      const userTurn: UiTurn = { id: newId(), role: "user", content: text };
      const history = [...turns.filter((t) => !t.error), userTurn];
      setTurns((t) => [...t.filter((x) => !x.error), userTurn]);
      setInput("");
      setLoading(true);

      const mySession = session.current;
      const controller = new AbortController();
      abort.current = controller;

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ surface, messages: history.map(({ role, content }) => ({ role, content })) }),
          signal: controller.signal,
        });
        const data = (await res.json().catch(() => ({}))) as Partial<ChatResponse> & { error?: string };
        if (!res.ok || typeof data.reply !== "string") throw new Error(data.error || "Something went wrong.");
        if (mySession !== session.current) return;
        setTurns((t) => [...t, { id: newId(), role: "assistant", content: data.reply!, venues: data.venues ?? [] }]);
      } catch (err) {
        if (controller.signal.aborted || mySession !== session.current) return;
        const msg = err instanceof Error ? err.message : "Something went wrong.";
        setTurns((t) => [...t, { id: newId(), role: "assistant", content: `${msg} Please try again.`, error: true }]);
      } finally {
        if (mySession === session.current) setLoading(false);
      }
    },
    [loading, turns, surface],
  );

  // Kiosk: reset after 90s without a touch (an arriving answer also re-arms it).
  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(() => {
    if (surface !== "kiosk") return;
    const arm = () => {
      window.clearTimeout(idleTimer.current);
      idleTimer.current = window.setTimeout(reset, IDLE_MS);
    };
    const events = ["pointerdown", "keydown", "touchstart", "wheel"] as const;
    events.forEach((e) => window.addEventListener(e, arm, { passive: true }));
    arm();
    return () => {
      window.clearTimeout(idleTimer.current);
      events.forEach((e) => window.removeEventListener(e, arm));
    };
  }, [surface, reset, turns.length]);

  function toggleListening() {
    if (listening) {
      recognizer.current?.abort();
      setListening(false);
      return;
    }
    const Ctor = speechCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    let finalText = "";
    rec.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      setInput(text);
      if (e.results[e.results.length - 1].isFinal) finalText = text;
    };
    rec.onend = () => {
      setListening(false);
      recognizer.current = null;
      if (finalText) sendRef.current(finalText);
    };
    rec.onerror = () => setListening(false);
    recognizer.current = rec;
    setListening(true);
    rec.start();
  }

  function cardUrl(venue: PublicVenue, venues: PublicVenue[], turnIndex: number): string {
    // The QR carries this card's venue first, plus the rest of the answer's cards.
    const question = [...turns.slice(0, turnIndex)].reverse().find((t) => t.role === "user")?.content;
    const ids = [venue.id, ...venues.map((v) => v.id).filter((id) => id !== venue.id)];
    return handoffUrl({ v: ids, q: question, a: turns[turnIndex].content }, origin);
  }

  const suggestions = SUGGESTIONS[surface];
  const showFollowUps = surface === "phone" && started && !loading;

  return (
    <div className={`chat chat--${surface}`}>
      <header className="chat__header">
        <div className="chat__brand">
          <span className="chat__property">Choctaw Durant</span>
          <span className="chat__title">Dining concierge</span>
        </div>
        {surface === "kiosk" && started && (
          <button type="button" className="btn btn--ghost" onClick={reset}>
            Start over
          </button>
        )}
      </header>

      <main className="chat__scroll" aria-live="polite">
        <div className="chat__inner">
          {note && <p className="chat__note">{note}</p>}

          {!started && (
            <section className="welcome">
              <h1 className="welcome__title">
                {surface === "kiosk" ? "Hungry? Thirsty? Ask me anything." : "Ask about places to eat and drink"}
              </h1>
              <p className="welcome__sub">
                {surface === "kiosk"
                  ? "Menus, hours, where to find a spot, or booking a table. Tap a question or type your own."
                  : "Menus, hours, locations, and booking at Choctaw Durant."}
              </p>
              <div className="chips">
                {suggestions.map((s) => (
                  <button key={s} type="button" className="chip" onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </section>
          )}

          {turns.map((t, i) => (
            <div key={t.id} className={`turn turn--${t.role}${t.error ? " turn--error" : ""}`}>
              <p className="bubble">{t.content}</p>
              {t.venues && t.venues.length > 0 && (
                <div className="cards">
                  {t.venues.map((v) => (
                    <VenueCard
                      key={v.id}
                      venue={v}
                      surface={surface}
                      handoffUrl={surface === "kiosk" && origin ? cardUrl(v, t.venues!, i) : undefined}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="turn turn--assistant">
              <p className="bubble typing" aria-label="Concierge is typing">
                <span />
                <span />
                <span />
              </p>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </main>

      <footer className="chat__footer">
        <div className="chat__inner">
          {showFollowUps && (
            <div className="chips chips--row">
              {suggestions.map((s) => (
                <button key={s} type="button" className="chip" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}
          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <label htmlFor={`ask-${surface}`} className="visually-hidden">
              Your question
            </label>
            <input
              id={`ask-${surface}`}
              className="composer__input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={listening ? "Listening…" : "Ask about food and drinks"}
              autoComplete="off"
              enterKeyHint="send"
              maxLength={500}
            />
            {canSpeak && (
              <button
                type="button"
                className={`btn btn--ghost composer__speak${listening ? " is-listening" : ""}`}
                onClick={toggleListening}
                aria-pressed={listening}
              >
                {listening ? "Stop" : "Speak"}
              </button>
            )}
            <button type="submit" className="btn btn--primary" disabled={loading || !input.trim()}>
              Ask
            </button>
          </form>
        </div>
      </footer>
    </div>
  );
}
