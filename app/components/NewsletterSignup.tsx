"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";

/**
 * Footer email capture. UI stub — wire to a real provider (Todoku marketing tenant / mailing list)
 * before launch. Stores nothing locally; just acknowledges a valid address.
 */
export default function NewsletterSignup() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return;
    setDone(true);
    setEmail("");
  }

  if (done) {
    return <p className="text-sm text-neutral-300">You are on the list. Watch your inbox.</p>;
  }

  return (
    <form onSubmit={submit} className="flex max-w-sm items-center gap-2">
      <Input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        type="email"
        placeholder="Email address"
        aria-label="Email address"
        className="h-10 border-neutral-700 bg-transparent text-neutral-100 placeholder:text-neutral-500 focus-visible:ring-neutral-500"
      />
      <button
        type="submit"
        aria-label="Subscribe"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-white text-neutral-900 transition-transform duration-150 ease-out active:scale-95"
      >
        <ArrowRight className="h-4 w-4" />
      </button>
    </form>
  );
}
