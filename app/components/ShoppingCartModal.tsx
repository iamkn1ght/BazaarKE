"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useShoppingCart } from "use-shopping-cart";
import Image from "next/image";
import { ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import KipkirenPayCheckout from "./KipkirenPayCheckout";
import { formatKes } from "@/app/lib/rails/payment-rail/money";

const EXIT_MS = 280;

export default function ShoppingCartModal() {
  const { cartCount, shouldDisplayCart, handleCartClick, cartDetails, removeItem, totalPrice } = useShoppingCart();
  const empty = (cartCount ?? 0) === 0;
  // Items mid-exit: kept in the list (still in cartDetails) but collapsed/faded, then actually removed.
  const [exiting, setExiting] = useState<Record<string, boolean>>({});

  function remove(id: string) {
    // Removal is a MEANINGFUL exit (item deletion) — animate it out, then remove. Honor reduced motion.
    const reduce =
      typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      removeItem(id);
      return;
    }
    setExiting((e) => ({ ...e, [id]: true }));
    window.setTimeout(() => {
      removeItem(id);
      setExiting((e) => {
        const next = { ...e };
        delete next[id];
        return next;
      });
    }, EXIT_MS);
  }

  return (
    <Sheet open={shouldDisplayCart} onOpenChange={() => handleCartClick()}>
      <SheetContent className="flex w-[90vw] flex-col sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>
            Your bag {!empty && <span className="font-normal text-muted-foreground">({cartCount})</span>}
          </SheetTitle>
        </SheetHeader>

        {empty ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <ShoppingBag className="h-6 w-6" />
            </div>
            <p className="mt-4 text-base font-medium text-foreground">Your bag is empty</p>
            <p className="mt-1 text-sm text-muted-foreground">Add something you love to get started.</p>
            <Button className="mt-6" onClick={() => handleCartClick()}>
              Continue shopping
            </Button>
          </div>
        ) : (
          <div className="flex h-full flex-col justify-between overflow-hidden">
            <ul className="-my-6 flex-1 divide-y divide-border overflow-y-auto">
              {Object.values(cartDetails ?? {}).map((entry) => (
                <li
                  key={entry.id}
                  className={`grid transition-all duration-300 ease-soft ${
                    exiting[entry.id] ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
                  }`}
                >
                  <div className="overflow-hidden">
                    <div className="flex py-6">
                      <div className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-md border border-border bg-muted">
                        <Image
                          src={entry.image as string}
                          alt={entry.name}
                          width={100}
                          height={100}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="ml-4 flex flex-1 flex-col">
                        <div>
                          <div className="flex justify-between text-base font-medium text-foreground">
                            <h3 className="pr-2">{entry.name}</h3>
                            <p className="ml-4 shrink-0">{formatKes(entry.value)}</p>
                          </div>
                          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{entry.description}</p>
                        </div>
                        <div className="flex flex-1 items-end justify-between text-sm">
                          <p className="text-muted-foreground">Qty {entry.quantity}</p>
                          <button
                            type="button"
                            onClick={() => remove(entry.id)}
                            disabled={exiting[entry.id]}
                            className="font-medium text-primary transition-colors hover:text-primary/80 disabled:opacity-50"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="border-t border-border pt-6">
              <div className="flex justify-between text-base font-medium text-foreground">
                <p>Subtotal</p>
                <p>{formatKes(Math.round(totalPrice ?? 0))}</p>
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">Shipping and taxes calculated at checkout.</p>
              <div className="mt-6">
                <KipkirenPayCheckout />
              </div>
              <div className="mt-4 text-center text-sm text-muted-foreground">
                or{" "}
                <button
                  type="button"
                  className="font-medium text-primary transition-colors hover:text-primary/80"
                  onClick={() => handleCartClick()}
                >
                  continue shopping
                </button>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
