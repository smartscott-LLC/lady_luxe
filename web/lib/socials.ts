/**
 * The house's official social profiles — the single list the footer
 * icons and the Organization sameAs schema both read from. Update here
 * once; every surface follows.
 */

export interface SocialProfile {
  platform: string;
  url: string;
  icon: string; // the FontAwesome icon class (kit.bundle.js)
  label: string;
}

export const SOCIAL_PROFILES: SocialProfile[] = [
  {
    platform: "Facebook",
    url: "https://www.facebook.com/profile.php?id=61596913682669",
    icon: "fab fa-facebook-f",
    label: "Lady Luxe on Facebook",
  },
  {
    platform: "Instagram",
    url: "https://www.instagram.com/ladyluxe.club/",
    icon: "fab fa-instagram",
    label: "Lady Luxe on Instagram",
  },
  {
    platform: "Pinterest",
    url: "https://www.pinterest.com/LadyLuxeAtelier/",
    icon: "fab fa-pinterest-p",
    label: "Lady Luxe on Pinterest",
  },
  {
    platform: "LinkedIn",
    url: "https://www.linkedin.com/company/lady-luxe-atelier",
    icon: "fab fa-linkedin-in",
    label: "Lady Luxe Atelier on LinkedIn",
  },
  {
    platform: "TikTok",
    url: "https://www.tiktok.com/@prophet7842",
    icon: "fab fa-tiktok",
    label: "Lady Luxe on TikTok",
  },
  {
    platform: "YouTube",
    url: "https://www.youtube.com/channel/UCqhgxzzUYYJxpbpeM7GhjDA",
    icon: "fab fa-youtube",
    label: "Lady Luxe on YouTube",
  },
];

export const SOCIAL_URLS = SOCIAL_PROFILES.map((s) => s.url);
