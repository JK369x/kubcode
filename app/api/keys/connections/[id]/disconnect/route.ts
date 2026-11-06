import { handleDisconnect } from "@/lib/keys/connect-routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params): Promise<Response> {
  return handleDisconnect(request, (await params).id);
}
