"use server";

import { redirect } from "next/navigation";
import { randomUUID } from "crypto";
import { createCustomer, issueCustomerToken } from "@/app/lib/rails/identiti";
import { clearSession, setSession } from "./session";

const E164 = /^\+\d{7,15}$/;

/**
 * Anonymous-express signup: create an Identiti customer, issue the customer JWT, set the session.
 * Errors redirect back to /signup?error=... (no client-state hooks — works on React 18).
 * NEVER stores the raw MSISDN: phone is passed to Identiti only; app_correlation is an opaque UUID.
 */
export async function signUpAction(formData: FormData): Promise<void> {
  const nameFirst = String(formData.get("name_first") ?? "").trim();
  const nameLast = String(formData.get("name_last") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const marketing = formData.get("marketing_consent") === "on";

  if (!nameFirst || !nameLast || !phone) {
    redirect("/signup?error=" + encodeURIComponent("First name, last name, and phone are required."));
  }
  if (!E164.test(phone)) {
    redirect("/signup?error=" + encodeURIComponent("Phone must be E.164 format, e.g. +254700000005."));
  }

  try {
    const customer = await createCustomer({
      phone,
      name_first: nameFirst,
      name_last: nameLast,
      app_correlation: `unique_accessories_${randomUUID()}`,
      consent: {
        dpa_consent: true,
        kyc_consent: true,
        marketing_consent: marketing,
        captured_at: new Date().toISOString(),
        captured_via: "app_onboarding",
      },
    });
    const token = await issueCustomerToken(customer.account_uuid);
    await setSession({ account_uuid: customer.account_uuid, token: token.token }, token.expires_in);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sign up failed. Please try again.";
    redirect("/signup?error=" + encodeURIComponent(message));
  }

  redirect("/");
}

/**
 * Phone login is OTP-based and depends on the Identiti customer-token factor contract, which is
 * still being finalized (see OPERATOR_REQUEST_IDENTITI.md — customer-token / aud=hakken design ask).
 * Until that lands, this routes back with a notice rather than faking authentication.
 */
export async function loginAction(): Promise<void> {
  redirect(
    "/login?notice=" +
      encodeURIComponent("Phone login via one-time code is being finalized. Please create an account to continue."),
  );
}

export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect("/");
}
