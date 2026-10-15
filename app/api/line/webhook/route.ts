import { NextRequest, NextResponse } from "next/server";
import { handleEvent } from "@/lib/bot";
import { isValidSignature } from "@/lib/line/signature";
import type { LineEvent } from "@/lib/line/types";

// 従業員用LINEボット（@925dqnld）のWebhook。
// LINE Developers の Webhook URL に https://<このアプリ>/api/line/webhook を設定する
export async function POST(request: NextRequest) {
  const body = await request.text();
  if (!isValidSignature(body, request.headers.get("x-line-signature"))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let events: LineEvent[] = [];
  try {
    events = (JSON.parse(body).events ?? []) as LineEvent[];
  } catch {
    return NextResponse.json({ ok: true });
  }

  // 1件ずつ順番に処理（同じ人の連続メッセージで途中経過が食い違わないように）
  for (const event of events) {
    await handleEvent(event);
  }

  return NextResponse.json({ ok: true });
}
