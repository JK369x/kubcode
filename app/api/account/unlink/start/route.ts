import { handleUnlinkStart } from "@/lib/accounts/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleUnlinkStart(request);
}
