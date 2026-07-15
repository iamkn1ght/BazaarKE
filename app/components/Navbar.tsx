"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, ShoppingBag } from "lucide-react";
import { useShoppingCart } from "use-shopping-cart";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import ThemeToggle from "./ThemeToggle";
import Logo from "./Logo";

const links = [
  { name: "All", href: "/all" },
  { name: "Electronics", href: "/Electronics" },
  { name: "Kitchenware", href: "/Kitchenware" },
  { name: "Furniture", href: "/Furniture" },
  { name: "Accessories", href: "/Accessories" },
];

export default function Navbar() {
  const pathname = usePathname();
  const { handleCartClick, cartCount } = useShoppingCart();
  const [menuOpen, setMenuOpen] = useState(false);
  const count = cartCount ?? 0;

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="container-x flex h-16 items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="-ml-1 inline-flex h-9 w-9 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link href="/" aria-label="BazaarKE home" className="text-xl font-bold tracking-tight text-foreground md:text-2xl">
            <Logo />
          </Link>
        </div>

        <nav className="hidden items-center gap-8 lg:flex">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`text-[13px] font-medium uppercase tracking-wide transition-colors ${
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {link.name}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-1">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => handleCartClick()}
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted"
            aria-label={`Cart, ${count} item${count === 1 ? "" : "s"}`}
          >
            <ShoppingBag className="h-5 w-5" />
            {count > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                {count}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-[80vw] sm:max-w-sm">
          <SheetHeader>
            <SheetTitle className="text-left">Menu</SheetTitle>
          </SheetHeader>
          <nav className="mt-8 flex flex-col">
            {links.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className={`border-b border-border py-4 text-base font-medium transition-colors ${
                    active ? "text-primary" : "text-foreground hover:text-primary"
                  }`}
                >
                  {link.name}
                </Link>
              );
            })}
            <div className="mt-6 flex flex-col gap-3 text-sm">
              <Link href="/signup" onClick={() => setMenuOpen(false)} className="text-muted-foreground hover:text-foreground">
                Create account
              </Link>
              <Link href="/login" onClick={() => setMenuOpen(false)} className="text-muted-foreground hover:text-foreground">
                Sign in
              </Link>
            </div>
          </nav>
        </SheetContent>
      </Sheet>
    </header>
  );
}
