"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useShoppingCart } from "use-shopping-cart";
import { Check, Loader2, LocateFixed, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatKes } from "@/app/lib/rails/payment-rail/money";
import { isServiceablePoint, parseLatLngInput } from "@/app/lib/rails/itafika/geo";

type Phase = "idle" | "initiating" | "awaiting" | "success" | "failed";
type Coords = { lat: number; lng: number };
type GeoStatus = "idle" | "locating" | "located";
type Quote = { available: boolean; price_minor?: number; distance_meters?: number };

const COUNTDOWN_SECONDS = 90;
const POLL_MS = 3000;
const REDIRECT_MS = 1100;
const LABEL_MIN = 3;

// Countdown ring geometry.
const RING_R = 42;
const RING_C = 2 * Math.PI * RING_R;

export default function KipkirenPayCheckout() {
  const router = useRouter();
  const { cartDetails, totalPrice, cartCount, clearCart, handleCartClick } = useShoppingCart();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [seconds, setSeconds] = useState(COUNTDOWN_SECONDS);

  // Delivery (geocoded shipping destination): a rider-readable label + a map pin (GPS or pasted).
  const [label, setLabel] = useState("");
  const [coords, setCoords] = useState<Coords | null>(null);
  const [geoStatus, setGeoStatus] = useState<GeoStatus>("idle");
  const [geoError, setGeoError] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualText, setManualText] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  // Human-readable place name for the pin (e.g. "Kilimani, Nairobi"), shown instead of raw
  // coordinates. Display-only — the exact lat/lng are still what the rider is dispatched to.
  const [placeName, setPlaceName] = useState<string | null>(null);
  const [placeLoading, setPlaceLoading] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const redirectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Stable per-attempt id: kept across an immediate retry (e.g. a slow/timed-out STK push, so the
  // server short-circuits to the same charge instead of pushing twice) and only regenerated after a
  // definitive decline (a genuinely new charge is then wanted).
  const attemptIdRef = useRef<string | null>(null);

  function stopPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
    pollRef.current = null;
    tickRef.current = null;
  }

  useEffect(() => {
    return () => {
      stopPolling();
      if (redirectRef.current) clearTimeout(redirectRef.current);
    };
  }, []);

  useEffect(() => {
    if (phase === "awaiting" && seconds === 0) {
      stopPolling();
      setError("We didn't get a confirmation in time. If you paid, your order will update shortly - otherwise try again.");
      setPhase("failed");
    }
  }, [phase, seconds]);

  // Best-effort delivery-fee estimate whenever the pin changes. Informational only — it is NOT
  // added to the amount charged (KP-16 delivery-fee charging is observe-only at MVP).
  useEffect(() => {
    if (!coords) {
      setQuote(null);
      return;
    }
    const ctrl = new AbortController();
    setQuote(null);
    (async () => {
      try {
        const res = await fetch("/api/checkout/delivery-quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ destination: { lat: coords.lat, lng: coords.lng } }),
          signal: ctrl.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (!ctrl.signal.aborted && res.ok) setQuote(data as Quote);
      } catch {
        /* best-effort — a failed quote just shows the calm fallback line */
      }
    })();
    return () => ctrl.abort();
  }, [coords]);

  // Reverse-geocode the pin to a readable place name for display (falls back to a neutral
  // "Location pinned" if it can't be resolved — never blocks checkout).
  useEffect(() => {
    if (!coords) {
      setPlaceName(null);
      setPlaceLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setPlaceName(null);
    setPlaceLoading(true);
    (async () => {
      try {
        const res = await fetch("/api/checkout/reverse-geocode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ destination: { lat: coords.lat, lng: coords.lng } }),
          signal: ctrl.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (!ctrl.signal.aborted && res.ok && typeof data.name === "string") setPlaceName(data.name);
      } catch {
        /* best-effort — the pin chip just shows "Location pinned" */
      } finally {
        if (!ctrl.signal.aborted) setPlaceLoading(false);
      }
    })();
    return () => ctrl.abort();
  }, [coords]);

  const total = Math.round(totalPrice ?? 0);
  const phoneClean = phone.replace(/[\s-]/g, "");
  const phoneValid = /^\+?\d{9,15}$/.test(phoneClean);
  const nameValid = name.trim().length >= 2;
  const labelValid = label.trim().length >= LABEL_MIN;
  const destValid = coords !== null && labelValid;
  const showPhoneHint = phone.length > 0 && !phoneValid;
  const canPay = (cartCount ?? 0) > 0 && phase !== "initiating" && phoneValid && nameValid && destValid;

  function useMyLocation() {
    setGeoError(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoError("Location isn't available on this device — paste a map pin instead.");
      setManualOpen(true);
      return;
    }
    setGeoStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setGeoStatus("idle");
        if (!isServiceablePoint(next.lat, next.lng)) {
          setGeoError("That location is outside our delivery area (Kenya). Paste a map pin instead.");
          setManualOpen(true);
          return;
        }
        setCoords(next);
      },
      (err) => {
        setGeoStatus("idle");
        setManualOpen(true);
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission was blocked — paste a map pin instead."
            : "Couldn't get your location — paste a map pin instead.",
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }

  function applyManual() {
    setGeoError(null);
    const parsed = parseLatLngInput(manualText);
    if (!parsed || !isServiceablePoint(parsed.lat, parsed.lng)) {
      setGeoError("Enter a Kenyan map pin as “lat, lng” or paste a Google Maps link.");
      return;
    }
    setCoords(parsed);
    setManualOpen(false);
    setManualText("");
  }

  function clearPin() {
    setCoords(null);
    setQuote(null);
    setGeoError(null);
    setManualText("");
    setManualOpen(false);
  }

  async function start() {
    setError(null);
    setPhase("initiating");
    if (!attemptIdRef.current) attemptIdRef.current = crypto.randomUUID();
    const items = Object.values(cartDetails ?? {}).map((e) => ({ id: e.id, quantity: e.quantity }));
    const shipping_destination = coords ? { lat: coords.lat, lng: coords.lng, label: label.trim() } : null;
    try {
      const res = await fetch("/api/checkout/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, phone, name, shipping_destination, checkout_attempt_id: attemptIdRef.current }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not start payment.");
        setPhase("failed");
        return;
      }
      beginPolling(String(data.charge_id));
    } catch {
      setError("Network error. Please try again.");
      setPhase("failed");
    }
  }

  function beginPolling(chargeId: string) {
    setPhase("awaiting");
    setSeconds(COUNTDOWN_SECONDS);
    tickRef.current = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/checkout/status?charge_id=${encodeURIComponent(chargeId)}`);
        const data = await res.json().catch(() => ({}));
        const status = String(data.status ?? "").toUpperCase();
        if (status === "COMPLETED" || status === "PAID") {
          stopPolling();
          clearCart();
          setPhase("success");
          redirectRef.current = setTimeout(() => {
            handleCartClick();
            router.push("/success");
          }, REDIRECT_MS);
        } else if (status === "FAILED") {
          stopPolling();
          attemptIdRef.current = null; // declined - a retry should start a fresh charge
          setError("Payment failed or was declined. Please try again.");
          setPhase("failed");
        }
      } catch {
        /* transient - keep polling until the countdown ends */
      }
    }, POLL_MS);
  }

  // --- Awaiting: STK-push prompt with a depleting countdown ring ---
  if (phase === "awaiting") {
    const remaining = seconds / COUNTDOWN_SECONDS;
    return (
      <div className="flex flex-col items-center text-center motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-300 motion-safe:ease-out">
        <div className="relative h-24 w-24">
          <svg viewBox="0 0 96 96" className="h-24 w-24 -rotate-90">
            <circle cx="48" cy="48" r={RING_R} fill="none" stroke="hsl(var(--muted))" strokeWidth="6" />
            <circle
              cx="48"
              cy="48"
              r={RING_R}
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={RING_C}
              strokeDashoffset={RING_C * (1 - remaining)}
              style={{ transition: "stroke-dashoffset 1000ms linear" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center" aria-hidden>
            <span className="text-2xl font-semibold tabular-nums text-foreground">{seconds}</span>
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">sec</span>
          </div>
        </div>
        <p className="mt-4 text-sm font-semibold text-foreground" role="status" aria-live="polite">
          Check your phone for the M-Pesa prompt
        </p>
        <p className="mt-1 text-sm text-muted-foreground">Enter your PIN to pay {formatKes(total)}</p>
        <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          Waiting for confirmation
        </div>
      </div>
    );
  }

  // --- Success: brief confirmation before redirecting ---
  if (phase === "success") {
    return (
      <div className="flex flex-col items-center text-center motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-300">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-300 motion-safe:ease-out">
          <Check className="h-7 w-7" />
        </div>
        <p className="mt-3 text-sm font-semibold text-foreground" role="status" aria-live="polite">
          Payment confirmed
        </p>
        <p className="mt-1 text-sm text-muted-foreground">Taking you to your order</p>
      </div>
    );
  }

  // --- Form: idle / initiating / failed ---
  return (
    <div className="space-y-3 text-left">
      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-200"
        >
          {error}
        </p>
      )}

      {/* Delivery address — geocoded shipping destination for last-mile dispatch */}
      <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" />
          Delivery address
        </div>
        <textarea
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          rows={2}
          maxLength={200}
          autoComplete="shipping street-address"
          placeholder="Estate / building, house or door no., town, nearest landmark"
          aria-label="Delivery address"
          className="flex w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />

        {coords ? (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-xs"
          >
            <span className="inline-flex min-w-0 items-center gap-1.5 font-medium text-foreground">
              <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
              {placeLoading ? (
                <span className="inline-flex items-center gap-1.5 font-normal text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin motion-safe:[animation-duration:0.7s]" />
                  Finding address…
                </span>
              ) : (
                <span className="truncate">{placeName ?? "Location pinned"}</span>
              )}
            </span>
            <button
              type="button"
              onClick={clearPin}
              className="shrink-0 font-medium text-primary transition-colors hover:text-primary/80"
            >
              Change
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={useMyLocation}
              disabled={geoStatus === "locating"}
              aria-busy={geoStatus === "locating"}
            >
              {geoStatus === "locating" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin motion-safe:[animation-duration:0.7s]" />
                  Locating
                </>
              ) : (
                <>
                  <LocateFixed className="h-4 w-4" />
                  Use my current location
                </>
              )}
            </Button>
            <button
              type="button"
              onClick={() => setManualOpen((o) => !o)}
              className="text-xs font-medium text-primary transition-colors hover:text-primary/80"
            >
              {manualOpen ? "Hide map pin" : "or paste a map pin"}
            </button>
          </div>
        )}

        {!coords && manualOpen && (
          <div className="flex items-center gap-2">
            <Input
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              placeholder="-1.2921, 36.8219 or a Google Maps link"
              aria-label="Map pin coordinates"
              className="h-9 text-xs"
            />
            <Button type="button" variant="secondary" size="sm" onClick={applyManual} disabled={manualText.trim().length === 0}>
              Apply
            </Button>
          </div>
        )}

        {geoError && (
          <p role="alert" className="text-xs text-destructive motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150">
            {geoError}
          </p>
        )}
        {coords && !labelValid && (
          <p role="status" aria-live="polite" className="text-xs text-muted-foreground">
            Add the building/house and a landmark so the rider can find you.
          </p>
        )}
      </div>

      <div className="space-y-1">
        <Input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="M-Pesa phone, e.g. +254700000000"
          aria-label="M-Pesa phone"
          aria-invalid={showPhoneHint || undefined}
        />
        {showPhoneHint && (
          <p className="px-1 text-xs text-destructive motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150">
            Enter a valid phone, e.g. +254700000000
          </p>
        )}
      </div>
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoComplete="name"
        placeholder="Full name"
        aria-label="Full name"
      />

      {/* Delivery-fee estimate — informational, billed separately on delivery (not part of the M-Pesa charge) */}
      {coords && quote && (
        <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
          {quote.available && typeof quote.price_minor === "number" && Number.isInteger(quote.price_minor) ? (
            <>
              <span>Delivery (est.){typeof quote.distance_meters === "number" ? ` · ${(quote.distance_meters / 1000).toFixed(1)} km` : ""}</span>
              <span className="tabular-nums">{formatKes(quote.price_minor)} · on delivery</span>
            </>
          ) : (
            <>
              <span>Delivery fee</span>
              <span>calculated at dispatch</span>
            </>
          )}
        </div>
      )}

      <Button onClick={start} disabled={!canPay} className="w-full">
        {phase === "initiating" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin motion-safe:[animation-duration:0.7s]" />
            Starting
          </>
        ) : (
          `Pay ${formatKes(total)} with M-Pesa`
        )}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        You&apos;ll get an STK push on your phone. Returning customers are recognized automatically.
      </p>
    </div>
  );
}
