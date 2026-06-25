import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { client, urlFor } from "../lib/sanity";

const categories = [
  { name: "Electronics", href: "/Electronics" },
  { name: "Kitchenware", href: "/Kitchenware" },
  { name: "Furniture", href: "/Furniture" },
  { name: "Accessories", href: "/Accessories" },
];

async function getData() {
  const query = "*[_type == 'heroImage'] {image1, image2}";
  return client.fetch(query);
}

export default async function Hero() {
  const data = await getData();
  const { image1, image2 } = data?.[0] ?? {};

  return (
    <section className="container-x">
      <div className="grid items-center gap-10 pt-10 pb-12 lg:grid-cols-12 lg:gap-12 lg:pt-16">
        {/* Copy */}
        <div className="lg:col-span-5">
          <h1 className="text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            Your everyday store.
          </h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-muted-foreground md:text-lg">
            Hand-picked electronics, kitchenware, furniture and accessories, delivered across Kenya.
          </p>
          <div className="mt-8 flex items-center gap-6">
            <Button asChild size="lg">
              <Link href="/all">Shop all</Link>
            </Button>
            <Link
              href="/all"
              className="group inline-flex items-center gap-1.5 text-sm font-medium text-foreground"
            >
              New arrivals
              <ArrowRight className="h-4 w-4 transition-transform duration-200 ease-soft group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>

        {/* Images */}
        <div className="lg:col-span-7">
          <div className="grid grid-cols-2 gap-4 sm:gap-6">
            <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-muted">
              {image1 && (
                <Image
                  src={urlFor(image1).width(800).height(1000).url()}
                  alt=""
                  fill
                  priority
                  sizes="(min-width: 1024px) 30vw, 45vw"
                  className="object-cover"
                />
              )}
            </div>
            <div className="relative mt-8 aspect-[3/4] overflow-hidden rounded-2xl bg-muted sm:mt-12">
              {image2 && (
                <Image
                  src={urlFor(image2).width(800).height(1000).url()}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 30vw, 45vw"
                  className="object-cover"
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Category strip */}
      <div className="border-t border-border py-6">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Shop by category</span>
          {categories.map((c) => (
            <Link
              key={c.name}
              href={c.href}
              className="text-sm font-medium text-foreground transition-colors hover:text-primary"
            >
              {c.name}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
