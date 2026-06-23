"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useShoppingCart } from "use-shopping-cart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatKes } from "@/app/lib/rails/payment-rail/money";

type Phase = "idle" | "initiating" | "awaiting" | "failed";

const COUNTDOWN_SECONDS = 90;
const POLL_MS = 3000;

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

  function stopTimers() {
    if (pollRef.current) clearInterval(pollRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
    pollRef.current = null;
    tickRef.current = null;
  }

  useEffect(() => () => stopTimers(), []);

  useEffect(() => {
    if (phase === "awaiting" && seconds === 0) {
      stopTimers();
      setError("We didn't get a confirmation in time. If you paid, your order will update shortly — otherwise try again.");
      setPhase("failed");
    }
  }, [phase, seconds]);

  const total = Math.round(totalPrice ?? 0);
  const disabled = (cartCount ?? 0) === 0;

  async function start() {
    setError(null);
    setPhase("initiating");
    const items = Object.values(cartDetails ?? {}).map((e) => ({ id: e.id, quantity: e.quantity }));
    try {
      const res = await fetch("/api/checkout/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, phone, name }),
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
          stopTimers();
          clearCart();
          handleCartClick();
          router.push("/success");
        } else if (status === "FAILED") {
          stopTimers();
          setError("Payment failed or was declined. Please try again.");
          setPhase("failed");
        }
      } catch {
        /* transient — keep polling until the countdown ends */
      }
    }, POLL_MS);
  }

  if (phase === "awaiting") {
    return (
      <div className="text-center">
        <p className="text-sm font-medium text-gray-900">Check your phone for the M-Pesa prompt</p>
        <p className="mt-1 text-sm text-gray-500">Enter your M-Pesa PIN to pay {formatKes(total)}.</p>
        <p className="mt-3 text-2xl font-semibold text-primary tabular-nums">{seconds}s</p>
        <p className="mt-1 text-xs text-gray-400">Waiting for confirmation…</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 text-left">
      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      <Input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="M-Pesa phone, e.g. +254700000000"
        inputMode="tel"
        aria-label="M-Pesa phone"
      />
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Full name"
        autoComplete="name"
        aria-label="Full name"
      />
      <Button onClick={start} disabled={disabled || phase === "initiating"} className="w-full">
        {phase === "initiating" ? "Starting…" : `Pay ${formatKes(total)} with M-Pesa`}
      </Button>
      <p className="text-center text-xs text-gray-400">
        You&apos;ll get an STK push on your phone. Returning customers are recognized automatically.
      </p>
    </div>
  );
}
