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
 * The landing page is the argument, in order, and it is scrubbed rather than
 * read: every beat owns a scroll range and something on screen changes across
 * all of it. The "therefore" that links each beat to the last is the opening
 * line of the next scene, not a paragraph of dead scroll between them.
 */
export default function LandingPage() {
  return (
    <main className="relative w-full overflow-x-clip">
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
