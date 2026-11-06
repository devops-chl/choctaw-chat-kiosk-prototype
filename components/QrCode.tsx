"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

function token(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** Renders a URL as a QR image. Colors come from the --qr-dark / --qr-light tokens. */
export function QrCode({ value, size = 220, label }: { value: string; size?: number; label: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(value, {
      // Low error correction keeps the code less dense; handoff URLs can be long.
      errorCorrectionLevel: "L",
      margin: 2,
      width: size * 2, // crisp on high-DPI screens
      color: { dark: token("--qr-dark", "#141a33"), light: token("--qr-light", "#ffffff") },
    })
      .then((url) => alive && setSrc(url))
      .catch(() => alive && setSrc(null));
    return () => {
      alive = false;
    };
  }, [value, size]);

  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="qr" src={src} width={size} height={size} alt={label} />
  ) : (
    <div className="qr qr--pending" style={{ width: size, height: size }} aria-hidden="true" />
  );
}
