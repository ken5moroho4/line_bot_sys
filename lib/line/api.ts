import { createHash } from "node:crypto";
import { requireEnv } from "@/lib/env";
import type { LineMessage, TextMessage } from "@/lib/line/types";

function token(): string {
  return requireEnv("LINE_STAFF_CHANNEL_ACCESS_TOKEN");
}

export async function reply(replyToken: string, messages: LineMessage[]): Promise<void> {
  const res = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
    body: JSON.stringify({ replyToken, messages: messages.slice(0, 5) }),
  });
  if (!res.ok) console.error(`LINE reply failed (${res.status}): ${await res.text()}`);
}

// こちらから話しかける（月の配信数を消費する）。宛先は従業員の個人トークだけ。
// グループ（C…）やトークルーム（R…）のIDが混ざっていても送らない
export async function pushToStaff(messages: LineMessage[]): Promise<void> {
  const ids = (process.env.LINE_STAFF_USER_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.startsWith("U"));
  for (const to of ids) {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ to, messages: messages.slice(0, 5) }),
    });
    if (!res.ok) console.error(`LINE push failed (${res.status}): ${await res.text()}`);
  }
}

export function hasCustomerLine(): boolean {
  return Boolean(process.env.LINE_OA_CHANNEL_ACCESS_TOKEN);
}

// 同じ retryKey での2回目は、24時間以内なら LINE が 409 で断る（二重送信の防止）
export async function broadcastToCustomers(messages: LineMessage[], retryKey: string): Promise<"sent" | "already"> {
  const hex = createHash("sha256").update(retryKey).digest("hex");
  const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  const res = await fetch("https://api.line.me/v2/bot/message/broadcast", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${requireEnv("LINE_OA_CHANNEL_ACCESS_TOKEN")}`,
      "X-Line-Retry-Key": uuid,
    },
    body: JSON.stringify({ messages: messages.slice(0, 5) }),
  });
  if (res.status === 409) return "already";
  if (!res.ok) throw new Error(`LINE broadcast failed (${res.status}): ${await res.text()}`);
  return "sent";
}

// トークで送られた写真などの中身を取り出す
export async function fetchContent(messageId: string): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  const res = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  if (!res.ok) throw new Error(`画像の取得に失敗しました (${res.status})`);
  return {
    bytes: await res.arrayBuffer(),
    contentType: res.headers.get("content-type") ?? "image/jpeg",
  };
}

// 文字メッセージ。quick を渡すと下にボタン（クイックリプライ）を出す
export function text(t: string, quick?: string[]): TextMessage {
  const msg: TextMessage = { type: "text", text: t.slice(0, 5000) };
  if (quick?.length) {
    msg.quickReply = {
      items: quick.slice(0, 13).map((label) => ({
        type: "action",
        action: { type: "message", label: label.slice(0, 20), text: label },
      })),
    };
  }
  return msg;
}
