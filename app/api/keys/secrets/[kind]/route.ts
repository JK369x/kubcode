import { handleDeleteSecret } from "@/lib/keys/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ kind: string }> };

export async function DELETE(request: Request, { params }: Params): Promise<Response> {
  return handleDeleteSecret(request, (await params).kind);
}
