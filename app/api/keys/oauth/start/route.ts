import { handleConnectStart } from "@/lib/keys/connect-routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleConnectStart(request);
}
