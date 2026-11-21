import { Suspense } from "react";
import { PlasmicComponent } from "@plasmicapp/loader-nextjs";
import { PLASMIC } from "@/plasmic-init";
import { ClientPlasmicRootProvider } from "@/plasmic-init-client";

/**
 * Staging route for the Plasmic-designed homepage.
 * Once approved, this design replaces the legacy homepage at /.
 */

async function getPageData() {
  const componentData = await PLASMIC.fetchComponentData("Homepage");
  const compMeta = componentData.entryCompMetas[0];
  return { componentData, compMeta };
}

async function PlasmicPageInner() {
  const { componentData, compMeta } = await getPageData();
  return (
    <ClientPlasmicRootProvider prefetchedData={componentData}>
      <PlasmicComponent component={compMeta.displayName} />
    </ClientPlasmicRootProvider>
  );
}

export default function PlasmicHomePage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "var(--ll-midnight)" }} />}>
      <PlasmicPageInner />
    </Suspense>
  );
}
