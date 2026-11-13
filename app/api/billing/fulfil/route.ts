import { handleBillingFulfil } from "@/lib/billing/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleBillingFulfil(request);
}
