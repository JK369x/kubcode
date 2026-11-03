import { handleCancel } from "@/lib/accounts/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleCancel(request);
}
