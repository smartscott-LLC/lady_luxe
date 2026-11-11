import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export function createClient(request: NextRequest) {
  // Create an unmodified response
  let supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(supabaseUrl!, supabaseKey!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  return { supabase, supabaseResponse };
}

// IMPORTANT: refresh sessions on every request so they never go stale.
export async function updateSession(request: NextRequest) {
  const { supabase, supabaseResponse } = createClient(request);

  // Keeps the session warm; route protection can read auth state here.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Example protected route (uncomment when the member portal exists):
  // if (!user && request.nextUrl.pathname.startsWith('/account')) {
  //   const url = request.nextUrl.clone();
  //   url.pathname = '/sign-in';
  //   return NextResponse.redirect(url);
  // }

  return supabaseResponse;
}
