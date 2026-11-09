import { handleChannelCallback } from "@/lib/channels/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return handleChannelCallback(request);
}
