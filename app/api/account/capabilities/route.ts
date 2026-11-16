import { handleCapabilities } from "@/lib/account-nav/capabilities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return handleCapabilities(request);
}
