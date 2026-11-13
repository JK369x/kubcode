import { handleWaitlistState, handleWaitlistToggle } from "@/lib/waitlist/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return handleWaitlistState(request);
}

export async function POST(request: Request): Promise<Response> {
  return handleWaitlistToggle(request);
}
