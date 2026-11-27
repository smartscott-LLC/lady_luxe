import { NextResponse } from "next/server";
import { serviceReady, serviceSelect } from "@/lib/service-db";

/**
 * The garment rail — what hangs in the fitting room. Atelier exclusives
 * plus (as they are produced) the Featured and Ensemble pieces. Public
 * read: the rail is display data; member identity matters only inside
 * the room.
 */
export async function GET() {
  if (!serviceReady()) {
    return NextResponse.json({ error: "service not configured" }, { status: 500 });
  }
  const rows = await serviceSelect<{
    id: string;
    name: string;
    source_type: string;
    glb_url: string;
  }>(
    "fitting_assets",
    "select=id,name,source_type,glb_url&live=eq.true&order=name.asc",
  );
  return NextResponse.json({ garments: rows ?? [] });
}
