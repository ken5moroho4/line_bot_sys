// 従業員用LINEボット（@925dqnld）。トークで話しかけてサイトを更新する。
// 受け取ったメッセージを「どの会話の流れか」に振り分ける
import { reply, text } from "@/lib/line/api";
import type { LineEvent } from "@/lib/line/types";
import { clearSession, loadSession } from "@/lib/session";
import { isAllowedStaff } from "@/lib/staff";
import { FLOWS } from "@/lib/flows";
import { CMD_CANCEL } from "@/lib/flows/commands";
import type { Context } from "@/lib/flows/types";

const MENU = FLOWS.map((f) => f.label);

function helpMessage() {
  const lines = FLOWS.map((f) => `・「${f.label}」… ${f.description}`);
  return text(
    ["三河屋サイト更新ボットです。", "", ...lines, `・「${CMD_CANCEL}」… 途中でやめる`].join("\n"),
    MENU
  );
}

export async function handleEvent(event: LineEvent): Promise<void> {
  const replyToken = event.replyToken;
  if (!replyToken) return;

  // グループの発言は扱わない（通知用グループに質問を流さないため）
  if (event.source?.type !== "user") return;
  const userId = event.source.userId;

  if (event.type === "follow") {
    if (isAllowedStaff(userId)) await reply(replyToken, [helpMessage()]);
    return;
  }
  if (event.type !== "message" || !event.message) return;

  if (!isAllowedStaff(userId)) {
    await reply(replyToken, [
      text(`このボットは従業員専用です。\n使う場合は管理者に次のIDを伝えてください。\n${userId ?? ""}`),
    ]);
    return;
  }

  const message = event.message;
  const ctx: Context = {
    replyToken,
    userId: userId!,
    message,
    input: message.type === "text" ? (message.text ?? "").trim() : "",
  };

  try {
    if (ctx.input === CMD_CANCEL || ctx.input === "キャンセル") {
      await clearSession(ctx.userId);
      await reply(replyToken, [text("やめました。サイトは変わっていません。", MENU)]);
      return;
    }

    const started = FLOWS.find((f) => f.trigger.test(ctx.input));
    if (started) {
      await started.start(ctx);
      return;
    }

    const session = await loadSession(ctx.userId);
    const flow = session && FLOWS.find((f) => f.name === session.flow);
    if (!session || !flow) {
      await reply(replyToken, [helpMessage()]);
      return;
    }
    await flow.handle(ctx, session);
  } catch (err) {
    console.error("staff bot error:", err);
    await reply(replyToken, [text("エラーが発生しました。少し時間をおいて、もう一度お試しください。", MENU)]);
  }
}
