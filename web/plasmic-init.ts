import { initPlasmicLoader } from "@plasmicapp/loader-nextjs/react-server-conditional";
import BrandMarquee from "./components/BrandMarquee";
import NewsletterForm from "./components/NewsletterForm";

export const PLASMIC = initPlasmicLoader({
  projects: [
    {
      id: process.env.PLASMIC_PROJECT_ID ?? "",
      token: process.env.PLASMIC_PROJECT_API ?? "",
    },
  ],
  // Fetches the latest revisions, whether or not they were unpublished!
  // Disable for production to ensure you render only published changes.
  preview: process.env.NODE_ENV !== "production",
});

// ===== Code components available in Plasmic Studio =====
// (host page: /plasmic-host while `npm run dev` is up)

PLASMIC.registerComponent(BrandMarquee, {
  name: "BrandMarquee",
  description: "Seamless scrolling brand logos — pauses on hover, clicks through to /brands",
  props: {
    children: "slot",
    speed: "number",
    href: "string",
    reverse: "boolean",
  },
});

PLASMIC.registerComponent(NewsletterForm, {
  name: "NewsletterForm",
  description: "The Private List — newsletter signup writing to Supabase",
  props: {},
});
