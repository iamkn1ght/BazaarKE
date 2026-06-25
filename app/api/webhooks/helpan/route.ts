import { handleHelpanWebhook } from "@/app/lib/rails/helpan/webhook";

// crypto HMAC verify is Node-only; Edge would silently fail the signature check.
export const runtime = "nodejs";

export async function POST(req: Request) {
  return handleHelpanWebhook(req);
}
