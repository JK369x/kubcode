import { handleCsrf } from "@/lib/accounts/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return handleCsrf(request);
}
