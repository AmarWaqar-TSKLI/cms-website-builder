import BoundaryScene from "@/components/landing/BoundaryScene";
import Closing from "@/components/landing/Closing";
import CompileScene from "@/components/landing/CompileScene";
import DescriptionScene from "@/components/landing/DescriptionScene";
import DestinationsScene from "@/components/landing/DestinationsScene";
import Hero from "@/components/landing/Hero";
import PackagingScene from "@/components/landing/PackagingScene";
import PremiseScene from "@/components/landing/PremiseScene";
import ReleaseStack from "@/components/landing/ReleaseStack";

/**
 * "How it works" — the architecture film, kept for the curious and the technical.
 *
 * This is the original landing: a dark 3D scroll narrative that argues the design
 * from first principles. It is no longer the front door (that job moved to a warm,
 * plain-language homepage), but the argument is worth keeping for anyone who wants
 * to see how the machinery underneath actually holds together.
 */
export default function HowItWorksPage() {
  return (
    <main className="theme-dark relative w-full overflow-x-clip">
      <Hero />
      <PremiseScene />
      <PackagingScene />
      <CompileScene />
      <DescriptionScene />
      <ReleaseStack />
      <BoundaryScene />
      <DestinationsScene />
      <Closing />
    </main>
  );
}
