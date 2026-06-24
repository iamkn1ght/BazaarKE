import Link from "next/link";
import { XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata = {
    title: "Checkout Cancelled | BazaarKE",
    description: "Your checkout was cancelled.",
};

export default function CancelPage() {
    return (
        <div className="bg-background">
            <div className="mx-auto max-w-xl px-4 py-24 sm:px-6 sm:py-32 text-center">
                <XCircle className="mx-auto h-16 w-16 text-red-500" />
                <h1 className="mt-6 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                    Checkout cancelled
                </h1>
                <p className="mt-4 text-base text-muted-foreground">
                    No payment was taken. Your cart is still saved - finish checking out whenever you&apos;re ready.
                </p>
                <div className="mt-10 flex justify-center gap-4">
                    <Button asChild>
                        <Link href="/">Back to shop</Link>
                    </Button>
                </div>
            </div>
        </div>
    );
}
