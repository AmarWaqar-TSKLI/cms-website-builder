import Link from "next/link";
import type { ReactNode } from "react";

/** The workspace screens' masthead: the landing's wordmark and ink rule, with actions on the right. */
export function HubMasthead({ section, children }: { section: string; children?: ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8">
      <nav className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-coal py-4">
        <Link
          href="/"
          className="flex items-baseline gap-3 font-[family-name:var(--font-display)] text-[20px] font-extrabold tracking-tight"
        >
          <span>
            cms<span className="text-tomato">/</span>builder
          </span>
          <span className="kicker hidden font-sans text-coal/60 sm:inline">{section}</span>
        </Link>
        {children}
      </nav>
    </div>
  );
}
