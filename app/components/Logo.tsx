/**
 * BazaarKE wordmark — a vector rebuild of the cart + "Bazaar"/"KE" logo, made theme-adaptive.
 *
 * The cart and "KE" are always orange (`text-primary`); "Bazaar" inherits the PARENT's text color
 * (`currentColor`). Drop it inside a <Link> that sets font size/weight and the "Bazaar" color:
 *   - Navbar → `text-foreground` (navy in light, near-white in dark).
 *   - Footer (always dark) → the footer's light text.
 * So the mark flips correctly across light/dark and on the dark footer, with no image assets.
 */
export default function Logo() {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="h-[1.05em] w-[1.05em] shrink-0 text-primary"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
        <circle cx="8" cy="21" r="1.6" fill="currentColor" stroke="none" />
        <circle cx="19" cy="21" r="1.6" fill="currentColor" stroke="none" />
      </svg>
      <span className="whitespace-nowrap">
        Bazaar<span className="text-primary">KE</span>
      </span>
    </span>
  );
}
