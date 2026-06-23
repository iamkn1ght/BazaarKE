import Image from "next/image";
import { client, urlFor } from "../lib/sanity";
import Link from "next/link";

async function getData() {
    const query = "*[_type == 'heroImage'] {image1, image2}"

    const data = await client.fetch(query);

    return data;
}

export default async function Hero() {
    const data = await getData()
    const { image1, image2 } = data[0] || {}; 
    return(
        <section className="mx-auto max-w-2xl px-4 sm:pb-6 lg:max-w-7xl lg:px-8">
            <div className="flex flex-wrap items-center justify-between md:flex-nowrap md:gap-8">
               
                <div className="w-full mb-6 md:mb-0 md:w-1/2">
                    <h1 className="mb-4 text-4xl font-bold text-black sm:text-5xl md:mb-8 md:text-6xl">
                        Your Everyday Store
                    </h1>
                    <p className="max-w-md leading-relaxed text-gray-500 xl:text-lg">
                        Discover high-quality products tailored to your needs.
                    </p>
                </div>


                {/* Images */}
                <div className="w-full flex gap-6 md:w-1/2">
                    {/* Image 1 */}
                    <div className="flex-1 overflow-hidden rounded-lg bg-gray-100 shadow-lg">
                        {image1 && (
                            <Image
                                src={urlFor(image1).url()}
                                alt="image1"
                                className="h-full w-full object-cover object-center md:h-50"
                                width={150} 
                                height={150}
                            />
                        )}
                    </div>

                    {/* Image 2 */}
                    <div className="flex-1 overflow-hidden rounded-lg bg-gray-100 shadow-lg">
                        {image2 && (
                            <Image
                                src={urlFor(image2).url()}
                                alt="image2"
                                className="h-full w-full object-cover object-center md:h-50"
                                width={150} 
                                height={150}
                            />
                        )}
                    </div>
                </div>
            </div>
                
            <div className="flex flex-col items-center justify-between gap-16 md:flex-row"> {/* Increased gap */}
    <div className="flex h-16 w-full divide-x overflow-hidden rounded-lg border md:w-auto"> {/* Adjusted width */}
        <Link
            href="/Electronics"
            className="flex w-full items-center justify-center px-4 text-gray-500 transition duration-100 hover:bg-gray-100 active:bg-gray-200 md:w-1/4"> {/* Added padding */}
            Electronics
        </Link>
        <Link
            href="/Kitchenware"
            className="flex w-full items-center justify-center px-4 text-gray-500 transition duration-100 hover:bg-gray-100 active:bg-gray-200 md:w-1/4"> {/* Added padding */}
            Kitchenware
        </Link>
        <Link
            href="/Furniture"
            className="flex w-full items-center justify-center px-4 text-gray-500 transition duration-100 hover:bg-gray-100 active:bg-gray-200 md:w-1/4"> {/* Added padding */}
            Furniture
        </Link>
        <Link
            href="/Accessories"
            className="flex w-full items-center justify-center px-4 text-gray-500 transition duration-100 hover:bg-gray-100 active:bg-gray-200 md:w-1/4"> {/* Added padding */}
            Accessories
        </Link>
    </div>
</div>

        </section>
    )
}