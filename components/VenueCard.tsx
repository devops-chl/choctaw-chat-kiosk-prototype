"use client";

import type { PublicVenue, Surface } from "@/lib/types";
import { QrCode } from "./QrCode";

function qrLabel(v: PublicVenue): string {
  if (v.reservationUrl) return "Scan to book on your phone";
  if (v.orderAheadUrl) return "Scan to order ahead";
  return "Scan to take this with you";
}

export function VenueCard({
  venue,
  surface,
  handoffUrl,
}: {
  venue: PublicVenue;
  surface: Surface;
  /** Kiosk only: where the QR code sends the guest's phone. */
  handoffUrl?: string;
}) {
  const meta = [venue.category, venue.location].filter(Boolean).join(" · ");

  return (
    <article className={`card card--${surface}`} aria-label={venue.name}>
      <div className="card__body">
        {venue.image && (
          // Plain <img>: remote venue photos from the Choctaw site, no next/image config needed.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="card__img"
            src={venue.image}
            alt=""
            loading="lazy"
            onError={(e) => (e.currentTarget.style.display = "none")}
          />
        )}
        <div className="card__text">
          <h3 className="card__name">{venue.name}</h3>
          {meta && <p className="card__meta">{meta}</p>}
          <p className="card__blurb">{venue.blurb}</p>
          {venue.hours && (
            <p className="card__hours">
              <span className="card__label">Hours</span> {venue.hours}
            </p>
          )}
        </div>

        {surface === "phone" && (
          <div className="card__actions">
            {venue.reservationUrl && (
              <a className="btn btn--primary" href={venue.reservationUrl} target="_blank" rel="noopener noreferrer">
                Book a table
              </a>
            )}
            {venue.orderAheadUrl && (
              <a className="btn btn--primary" href={venue.orderAheadUrl} target="_blank" rel="noopener noreferrer">
                Order ahead
              </a>
            )}
            {venue.menus?.map((m) => (
              <a key={m.url} className="btn" href={m.url} target="_blank" rel="noopener noreferrer">
                {m.label}
              </a>
            ))}
            <a className="btn btn--ghost" href={venue.pageUrl} target="_blank" rel="noopener noreferrer">
              Venue page
            </a>
          </div>
        )}
      </div>

      {surface === "kiosk" && handoffUrl && (
        <div className="card__stub">
          <QrCode value={handoffUrl} label={`QR code: ${qrLabel(venue)} for ${venue.name}`} />
          <p className="card__stub-label">{qrLabel(venue)}</p>
        </div>
      )}
    </article>
  );
}
