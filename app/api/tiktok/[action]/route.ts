import { sandboxRequest } from "@/lib/tiktok-sandbox";
export async function POST(
  req: Request,
  ctx: { params: Promise<{ action: string }> },
) {
  return sandboxRequest(req, (await ctx.params).action);
}
