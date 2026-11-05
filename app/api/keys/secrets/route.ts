import { handleSaveSecret } from "@/lib/keys/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleSaveSecret(request);
}
