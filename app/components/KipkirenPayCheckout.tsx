"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useShoppingCart } from "use-shopping-cart";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatKes } from "@/app/lib/rails/payment-rail/money";

type Phase = "idle" | "initiating" | "awaiting" | "success" | "failed";

const COUNTDOWN_SECONDS = 90;
const POLL_MS = 3000;
const REDIRECT_MS = 1100;

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
      setError("We didn't get a confirmation in time. If you paid, your order will update shortly — otherwise try again.");
      setPhase("failed");
    }
  }, [phase, seconds]);

  const total = Math.round(totalPrice ?? 0);
  const phoneClean = phone.replace(/[\s-]/g, "");
  const phoneValid = /^\+?\d{9,15}$/.test(phoneClean);
  const nameValid = name.trim().length >= 2;
  const showPhoneHint = phone.length > 0 && !phoneValid;
  const canPay = (cartCount ?? 0) > 0 && phase !== "initiating" && phoneValid && nameValid;

  async function start() {
    setError(null);
    setPhase("initiating");
    if (!attemptIdRef.current) attemptIdRef.current = crypto.randomUUID();
    const items = Object.values(cartDetails ?? {}).map((e) => ({ id: e.id, quantity: e.quantity }));
    try {
      const res = await fetch("/api/checkout/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, phone, name, checkout_attempt_id: attemptIdRef.current }),
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
          attemptIdRef.current = null; // declined — a retry should start a fresh charge
          setError("Payment failed or was declined. Please try again.");
          setPhase("failed");
        }
      } catch {
        /* transient — keep polling until the countdown ends */
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
            <span className="text-2xl font-semibold tabular-nums text-gray-900">{seconds}</span>
            <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">sec</span>
          </div>
        </div>
        <p className="mt-4 text-sm font-semibold text-gray-900" role="status" aria-live="polite">
          Check your phone for the M-Pesa prompt
        </p>
        <p className="mt-1 text-sm text-gray-500">Enter your PIN to pay {formatKes(total)}</p>
        <div className="mt-3 flex items-center gap-1.5 text-xs text-gray-400">
          <span className="h-1.5 w-1.5 rounded-full bg-primary motion-safe:animate-pulse" />
          Waiting for confirmation…
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
        <p className="mt-3 text-sm font-semibold text-gray-900" role="status" aria-live="polite">
          Payment confirmed
        </p>
        <p className="mt-1 text-sm text-gray-500">Taking you to your order…</p>
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
      <Button onClick={start} disabled={!canPay} className="w-full">
        {phase === "initiating" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin motion-safe:[animation-duration:0.7s]" />
            Starting…
          </>
        ) : (
          `Pay ${formatKes(total)} with M-Pesa`
        )}
      </Button>
      <p className="text-center text-xs text-gray-400">
        You&apos;ll get an STK push on your phone. Returning customers are recognized automatically.
      </p>
    </div>
  );
}
