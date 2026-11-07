import { sandboxRequest } from "@/lib/tiktok-sandbox";
export function GET(req: Request) {
  return sandboxRequest(req, "connect");
}
