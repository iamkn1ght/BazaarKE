"use client";

import { useState } from "react";
import Image from "next/image";
import type { SanityImageSource } from "@sanity/image-url/lib/types/types";
import { urlFor } from "../lib/sanity";

interface iAppProps {
    images: SanityImageSource[];
}

export default function ImageGallery({ images }: iAppProps) {
    const [bigImage, setImage] = useState<SanityImageSource>(images[0]);

    const handleSmallImageClick = (image: SanityImageSource) => {
        setImage(image);
    };

    return (
        <div className="grid gap-4 lg:grid-cols-5">
            {/* Small Images Section */}
            <div className="order-last flex gap-4 lg:order-none lg:flex-col">
                {images.map((image, idx) => (
                    <div
                        key={idx}
                        className="overflow-hidden rounded-lg bg-gray-100"
                    >
                        <Image
                            src={urlFor(image).url()}
                            width={200}
                            height={200}
                            alt="photo"
                            className="h-full w-full object-cover object-center cursor-pointer"
                            onClick={() => handleSmallImageClick(image)}
                        />
                    </div>
                ))}
            </div>

            {/* Big Image Section */}
            <div className="relative overflow-hidden rounded-lg bg-gray-100 lg:col-span-4">
                <Image
                    src={urlFor(bigImage).url()}
                    alt="photo"
                    width={500}
                    height={500}
                    className="h-full w-full object-cover object-center"
                />
            </div>
        </div>
    );
}