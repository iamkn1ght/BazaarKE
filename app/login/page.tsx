import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loginAction } from "@/app/lib/auth/actions";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to Unique Accessories.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const { notice } = await searchParams;

  return (
    <div className="bg-background">
      <div className="mx-auto max-w-md px-4 py-16 sm:px-6 sm:py-24">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Sign in</h1>
        <p className="mt-2 text-sm text-muted-foreground">Enter your phone to receive a one-time code.</p>

        {notice && (
          <p className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{notice}</p>
        )}

        <form action={loginAction} className="mt-8 space-y-4">
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-foreground">Phone (E.164)</label>
            <Input id="phone" name="phone" required placeholder="+254700000000" className="mt-1" inputMode="tel" />
          </div>
          <Button type="submit" className="w-full">Send code</Button>
        </form>

        <p className="mt-6 text-sm text-muted-foreground">
          New here?{" "}
          <Link href="/signup" className="font-medium text-primary hover:text-primary/80">Create an account</Link>
        </p>
      </div>
    </div>
  );
}
