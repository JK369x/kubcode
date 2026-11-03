import { handleCommentHide } from "@/lib/interactions/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  return handleCommentHide(request, (await params).id);
}
