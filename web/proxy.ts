import { type NextRequest } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";

/** Next 16 renamed the middleware convention to `proxy`. */
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static, _next/image (build assets)
     * - static files in /public (brand videos, fonts, favicons…)
     */
    "/((?!_next/static|_next/image|brand/|css/|js/|vendor/|favicon.ico|favicon-.*|apple-touch-icon.*|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mp4|woff2?)$).*)",
  ],
};
