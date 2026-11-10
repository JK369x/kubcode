import { handleRuleCreate } from "@/lib/automations/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params): Promise<Response> {
  return handleRuleCreate(request, (await params).id);
}
