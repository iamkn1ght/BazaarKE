import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata = {
    title: "Order Confirmed — Unique Accessories",
    description: "Thanks for your purchase!",
};

export default function SuccessPage() {
    return (
        <div className="bg-white">
            <div className="mx-auto max-w-xl px-4 py-24 sm:px-6 sm:py-32 text-center">
                <CheckCircle2 className="mx-auto h-16 w-16 text-primary" />
                <h1 className="mt-6 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                    Thanks for your order!
                </h1>
                <p className="mt-4 text-base text-gray-600">
                    Your payment was successful. You&apos;ll receive a confirmation email shortly with your order details.
                </p>
                <div className="mt-10 flex justify-center gap-4">
                    <Button asChild>
                        <Link href="/">Continue shopping</Link>
                    </Button>
                </div>
            </div>
        </div>
    );
}
