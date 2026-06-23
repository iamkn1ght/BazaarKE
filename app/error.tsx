"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error(error);
    }, [error]);

    return (
        <div className="bg-white">
            <div className="mx-auto max-w-xl px-4 py-24 sm:px-6 sm:py-32 text-center">
                <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                    Something went wrong
                </h1>
                <p className="mt-4 text-base text-gray-600">
                    An unexpected error occurred. Try again, or head back to the home page.
                </p>
                <div className="mt-10 flex justify-center gap-4">
                    <Button onClick={reset}>Try again</Button>
                    <Button variant="outline" asChild>
                        <Link href="/">Go home</Link>
                    </Button>
                </div>
            </div>
        </div>
    );
}
