import { handleConnectCallback } from "@/lib/keys/connect-routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ provider: string }> };

export async function GET(request: Request, { params }: Params): Promise<Response> {
  return handleConnectCallback(request, (await params).provider);
}
