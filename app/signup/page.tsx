import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signUpAction } from "@/app/lib/auth/actions";

export const metadata: Metadata = {
  title: "Create account",
  description: "Create a Unique Accessories account.",
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="bg-background">
      <div className="mx-auto max-w-md px-4 py-16 sm:px-6 sm:py-24">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Create your account</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Checkout never requires an account - this is optional, for faster repeat orders and order updates.
        </p>

        {error && (
          <p className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        )}

        <form action={signUpAction} className="mt-8 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="name_first" className="block text-sm font-medium text-foreground">First name</label>
              <Input id="name_first" name="name_first" required className="mt-1" autoComplete="given-name" />
            </div>
            <div>
              <label htmlFor="name_last" className="block text-sm font-medium text-foreground">Last name</label>
              <Input id="name_last" name="name_last" required className="mt-1" autoComplete="family-name" />
            </div>
          </div>
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-foreground">Phone (E.164)</label>
            <Input id="phone" name="phone" required placeholder="+254700000000" className="mt-1" inputMode="tel" />
            <p className="mt-1 text-xs text-muted-foreground">Used for order updates via SMS. Stored securely by Identiti - never by this store.</p>
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" name="marketing_consent" className="h-4 w-4 rounded border-gray-300" />
            Send me occasional offers and restock alerts.
          </label>
          <Button type="submit" className="w-full">Create account</Button>
        </form>

        <p className="mt-6 text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary hover:text-primary/80">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
