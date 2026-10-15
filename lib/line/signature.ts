import { createHmac, timingSafeEqual } from "crypto";

// LINEから届いたリクエストかを、チャネルシークレットの署名で確かめる
export function isValidSignature(body: string, signature: string | null): boolean {
  const secret = process.env.LINE_STAFF_CHANNEL_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(body).digest();
  const actual = Buffer.from(signature, "base64");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
