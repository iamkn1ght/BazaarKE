"use client";

import { Button } from "@/components/ui/button";
import type { SanityImageSource } from "@sanity/image-url/lib/types/types";
import { useShoppingCart } from "use-shopping-cart";
import { urlFor } from "../lib/sanity";

export interface ProductCart {
    id: string;
    name: string;
    description: string;
    /** KES integer minor units (KES 50 = 5000). use-shopping-cart stores price in minor units. */
    priceMinor: number;
    currency: string;
    image: SanityImageSource;
}

export default function AddToBag({
  id,
  currency,
  description,
  image,
  name,
  priceMinor,
}: ProductCart) {
  const { addItem, handleCartClick } = useShoppingCart();

  const product = {
    id,
    name,
    description,
    price: priceMinor,
    currency,
    image: urlFor(image).url(),
    sku: id,
    price_id: id,
  };

  function handleClick() {
    addItem(product);
    handleCartClick();
  }

  return <Button onClick={handleClick}>Add To Cart</Button>;
}
