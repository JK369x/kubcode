import { handleRuleDelete, handleRuleUpdate } from "@/lib/automations/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; ruleId: string }> };

export async function PATCH(request: Request, { params }: Params): Promise<Response> {
  const { id, ruleId } = await params;
  return handleRuleUpdate(request, id, ruleId);
}

export async function DELETE(request: Request, { params }: Params): Promise<Response> {
  const { id, ruleId } = await params;
  return handleRuleDelete(request, id, ruleId);
}
