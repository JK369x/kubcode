import { handlePublicName, handlePublicNameRead } from "@/lib/interactions/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return handlePublicNameRead(request);
}

export async function POST(request: Request): Promise<Response> {
  return handlePublicName(request);
}
