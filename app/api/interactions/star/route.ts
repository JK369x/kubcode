import { handleStar } from "@/lib/interactions/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleStar(request);
}
