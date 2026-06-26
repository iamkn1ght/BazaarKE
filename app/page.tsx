import Hero from "./components/Hero";
import Newest from "./components/Newest";

// ISR: prerender at build, revalidate every 5 min — reflects new arrivals without a redeploy and
// self-heals if a build-time Sanity fetch returned empty.
export const revalidate = 300;

export default function Home() {
  return (
    <div>
      <Hero />
      <Newest />
    </div>
  )
}