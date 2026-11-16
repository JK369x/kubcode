import { handleCommentStats } from "@/lib/automations/posts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params): Promise<Response> {
  return handleCommentStats(request, (await params).id);
}
