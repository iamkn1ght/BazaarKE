import { handleItafikaWebhook } from "@/app/lib/rails/itafika/webhook";

// crypto.createHmac is Node-only; Edge would silently fail the signature verify.
export const runtime = "nodejs";

export async function POST(req: Request) {
  return handleItafikaWebhook(req);
}
