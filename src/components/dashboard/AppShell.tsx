"use client";

/**
 * The shared app frame for every per-site page (Media, Store, Blog, Forms, …) so
 * the left sidebar is always there and the section pages stop being one-offs.
 * The dashboard's own Overview keeps its inline copy of this frame; everything
 * else renders through here. Technical-details state is remembered per browser
 * under `cms.technical`, the same key the dashboard uses, so the switch is one
 * setting across the whole product.
 */
import { useEffect, useState, type ReactNode } from "react";
import { TechnicalDetails } from "../technical";
import { SiteSidebar } from "./SiteSidebar";

export function AppShell({
  user,
  sites,
  site,
  editHref,
  children,
}: {
  user: { name: string; email: string };
  sites: { id: string; name: string; slug: string }[];
  site: { id: string; name: string; slug: string; customDomain: string | null; modules: string[] };
  editHref: string;
  children: ReactNode;
}) {
  const [technical, setTechnical] = useState(false);
  useEffect(() => {
    setTechnical(window.localStorage.getItem("cms.technical") === "1");
  }, []);
  useEffect(() => {
    window.localStorage.setItem("cms.technical", technical ? "1" : "0");
  }, [technical]);

  return (
    <TechnicalDetails enabled={technical}>
      <div className="flex min-h-screen">
        <SiteSidebar
          user={user}
          sites={sites}
          currentSiteId={site.id}
          currentSiteName={site.name}
          modules={site.modules}
          technical={technical}
          onTechnicalChange={setTechnical}
          editHref={editHref}
          liveUrl={site.customDomain ? `https://${site.customDomain}` : `/s/${site.slug}`}
        />
        <main className="min-w-0 flex-1 px-5 pb-20 pt-8 sm:px-8">
          <div className="mx-auto w-full max-w-[1040px]">{children}</div>
        </main>
      </div>
    </TechnicalDetails>
  );
}
