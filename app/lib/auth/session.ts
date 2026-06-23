import "server-only";
import { cookies } from "next/headers";

/**
 * Minimal customer session for anonymous-express auth (CHAMIA-AUTH).
 * Stores the Identiti account_uuid + customer JWT in an httpOnly cookie. The full
 * server-authoritative cart hydration (Sanity cart doc keyed by account_uuid) is a
 * Week-2 follow-up — the cart stays client-only (use-shopping-cart shouldPersist) until then.
 */

const SESSION_COOKIE = "ua_session";

export interface UASession {
  account_uuid: string;
  token: string;
}

export async function getSession(): Promise<UASession | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<UASession>;
    if (parsed.account_uuid && parsed.token) {
      return { account_uuid: parsed.account_uuid, token: parsed.token };
    }
    return null;
  } catch {
    return null;
  }
}

export async function setSession(session: UASession, maxAgeSeconds: number): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, JSON.stringify(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.max(0, Math.floor(maxAgeSeconds)),
  });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
