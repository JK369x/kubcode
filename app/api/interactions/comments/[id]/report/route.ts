import { handleCommentReport } from "@/lib/interactions/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  return handleCommentReport(request, (await params).id);
}
