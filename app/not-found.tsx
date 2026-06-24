import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
    return (
        <div className="bg-background">
            <div className="mx-auto max-w-xl px-4 py-24 sm:px-6 sm:py-32 text-center">
                <p className="text-sm font-semibold text-primary">404</p>
                <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                    Page not found
                </h1>
                <p className="mt-4 text-base text-muted-foreground">
                    The page you&apos;re looking for doesn&apos;t exist or was moved.
                </p>
                <div className="mt-10 flex justify-center gap-4">
                    <Button asChild>
                        <Link href="/">Go home</Link>
                    </Button>
                    <Button variant="outline" asChild>
                        <Link href="/all">Browse products</Link>
                    </Button>
                </div>
            </div>
        </div>
    );
}
