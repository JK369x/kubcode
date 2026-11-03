import { handleCommentDelete, handleCommentEdit } from "@/lib/interactions/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Ctx): Promise<Response> {
  return handleCommentEdit(request, (await params).id);
}

export async function DELETE(request: Request, { params }: Ctx): Promise<Response> {
  return handleCommentDelete(request, (await params).id);
}
