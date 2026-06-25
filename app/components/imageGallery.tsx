"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { X } from "lucide-react";
import type { SanityImageSource } from "@sanity/image-url/lib/types/types";
import { urlFor } from "../lib/sanity";

interface iAppProps {
  images: SanityImageSource[];
}

export default function ImageGallery({ images }: iAppProps) {
  const [bigImage, setBigImage] = useState<SanityImageSource>(images[0]);
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoom(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [zoom]);

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      {/* Thumbnails */}
      <div className="order-last flex gap-4 lg:order-none lg:flex-col">
        {images.map((image, idx) => {
          const active = image === bigImage;
          return (
            <button
              key={idx}
              type="button"
              onClick={() => setBigImage(image)}
              aria-label={`View image ${idx + 1}`}
              className={`overflow-hidden rounded-lg bg-muted ring-2 transition ${
                active ? "ring-primary" : "ring-transparent hover:ring-border"
              }`}
            >
              <Image
                src={urlFor(image).width(200).height(200).url()}
                width={200}
                height={200}
                alt=""
                className="h-full w-full cursor-pointer object-cover object-center"
              />
            </button>
          );
        })}
      </div>

      {/* Big image (click to zoom) */}
      <div className="lg:col-span-4">
        <button
          type="button"
          onClick={() => setZoom(true)}
          aria-label="Zoom image"
          className="group relative block aspect-square w-full overflow-hidden rounded-lg bg-muted"
        >
          <Image
            src={urlFor(bigImage).width(1000).height(1000).url()}
            fill
            sizes="(min-width: 1024px) 50vw, 100vw"
            alt="Product image"
            className="object-cover object-center transition-transform duration-500 ease-soft motion-safe:group-hover:scale-105"
          />
          <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-background/80 px-3 py-1 text-xs font-medium text-foreground opacity-0 backdrop-blur transition-opacity duration-200 group-hover:opacity-100">
            Click to zoom
          </span>
        </button>
      </div>

      {/* Lightbox */}
      {zoom && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Zoomed product image"
          onClick={() => setZoom(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
        >
          <button
            type="button"
            aria-label="Close"
            className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
          <div
            className="relative h-full max-h-[85vh] w-full max-w-4xl motion-safe:animate-in motion-safe:zoom-in-95 motion-safe:duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={urlFor(bigImage).width(1600).height(1600).url()}
              fill
              sizes="90vw"
              alt="Product image"
              className="object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}
