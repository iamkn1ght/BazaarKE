import Link from "next/link";
import { Facebook, Instagram, Twitter } from "lucide-react";
import NewsletterSignup from "./NewsletterSignup";

type FooterLink = { name: string; href: string };

const shop: FooterLink[] = [
  { name: "All products", href: "/all" },
  { name: "Electronics", href: "/Electronics" },
  { name: "Kitchenware", href: "/Kitchenware" },
  { name: "Furniture", href: "/Furniture" },
  { name: "Accessories", href: "/Accessories" },
];
const account: FooterLink[] = [
  { name: "Sign in", href: "/login" },
  { name: "Create account", href: "/signup" },
];
const help: FooterLink[] = [
  { name: "Shipping & delivery", href: "#" },
  { name: "Returns", href: "#" },
  { name: "Contact", href: "#" },
];

function Column({ title, links }: { title: string; links: FooterLink[] }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">{title}</h3>
      <ul className="mt-4 space-y-3">
        {links.map((l) => (
          <li key={l.name}>
            <Link href={l.href} className="text-sm text-neutral-300 transition-colors hover:text-white">
              {l.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-24 bg-neutral-950 text-neutral-100">
      <div className="container-x py-16">
        <div className="grid gap-12 lg:grid-cols-2">
          <div className="max-w-md">
            <Link href="/" className="text-2xl font-bold tracking-tight">
              Bazaar<span className="text-primary">KE</span>
            </Link>
            <p className="mt-4 text-sm leading-relaxed text-neutral-400">
              Hand-picked electronics, kitchenware, furniture and accessories. Pay with M-Pesa, delivered across Kenya.
            </p>
            <p className="mt-6 text-xs font-semibold uppercase tracking-wider text-neutral-400">
              Get first access to new arrivals
            </p>
            <div className="mt-3">
              <NewsletterSignup />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            <Column title="Shop" links={shop} />
            <Column title="Account" links={account} />
            <Column title="Help" links={help} />
          </div>
        </div>
      </div>
      <div className="border-t border-neutral-800">
        <div className="container-x flex flex-col items-center justify-between gap-4 py-6 sm:flex-row">
          <p className="text-xs text-neutral-500">© {year} BazaarKE. Pay with M-Pesa.</p>
          <div className="flex items-center gap-4 text-neutral-400">
            <Link href="#" aria-label="Instagram" className="transition-colors hover:text-white">
              <Instagram className="h-5 w-5" />
            </Link>
            <Link href="#" aria-label="X" className="transition-colors hover:text-white">
              <Twitter className="h-5 w-5" />
            </Link>
            <Link href="#" aria-label="Facebook" className="transition-colors hover:text-white">
              <Facebook className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
