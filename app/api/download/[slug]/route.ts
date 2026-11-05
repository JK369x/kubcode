import { handleDownload, handleDownloadStatus } from "@/lib/downloads/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function GET(request: Request, { params }: Params): Promise<Response> {
  return handleDownloadStatus(request, (await params).slug);
}

export async function POST(request: Request, { params }: Params): Promise<Response> {
  return handleDownload(request, (await params).slug);
}
