import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

/**
 * Completes Supabase email confirmations. The verification email lands the
 * member here; the code is exchanged for a session (or the token verified)
 * and the member walks to the Club with the process actually finished.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const supabase = await createClient();

  try {
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(`${origin}/club`);
    } else if (tokenHash && type) {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: type as
          | "signup"
          | "invite"
          | "magiclink"
          | "recovery"
          | "email_change"
          | "email",
      });
      if (!error) return NextResponse.redirect(`${origin}/club`);
    }
  } catch {
    // fall through to the Club page
  }
  return NextResponse.redirect(`${origin}/club?confirm=retry`);
}
