// 従業員用LINEボット（@925dqnld）。トークで話しかけてサイトを更新する。
// 受け取ったメッセージを「どの会話の流れか」に振り分ける
import { reply, text } from "@/lib/line/api";
import type { LineEvent } from "@/lib/line/types";
import { clearSession, loadSession } from "@/lib/session";
import { isAllowedStaff } from "@/lib/staff";
import { handlePostback } from "@/lib/postback";
import { DEFAULT_FLOW, FLOWS } from "@/lib/flows";
import { CMD_CANCEL } from "@/lib/flows/commands";
import type { Context } from "@/lib/flows/types";

const MENU = FLOWS.map((f) => f.label);
const CMD_HELP = /^(ヘルプ|メニュー|使い方|help)$/i;

function helpMessage() {
  const lines = FLOWS.map((f) => `・「${f.label}」… ${f.description}`);
  return text(
    [
      "三河屋サイト更新ボットです。",
      "「秦野店、12月1日から寄せ豆腐はじめるってお知らせ出して」のように話しかけても始められます。",
      "",
      ...lines,
      `・「${CMD_CANCEL}」… 途中でやめる`,
    ].join("\n"),
    MENU
  );
}

function stripSelfMention(message: NonNullable<LineEvent["message"]>): string {
  const self = (message.mention?.mentionees ?? []).filter((m) => m.isSelf).sort((a, b) => b.index - a.index);
  let t = message.text ?? "";
  for (const m of self) t = t.slice(0, m.index) + t.slice(m.index + m.length);
  return t.trim();
}

export async function handleEvent(event: LineEvent): Promise<void> {
  const replyToken = event.replyToken;
  const source = event.source;
  if (!replyToken || !source) return;
  const userId = source.userId;
  const inGroup = source.type !== "user";
  const chatId = source.groupId ?? source.roomId;
  if (inGroup && !chatId) return;

  if (event.type === "follow" && !inGroup) {
    if (isAllowedStaff(userId)) await reply(replyToken, [helpMessage()]);
    return;
  }
  if (event.type === "postback" && event.postback && !inGroup) {
    if (!isAllowedStaff(userId)) return;
    try {
      await handlePostback(replyToken, event.postback.data);
    } catch (err) {
      console.error("postback error:", err);
      await reply(replyToken, [text("エラーが発生しました。少し時間をおいて、もう一度お試しください。")]);
    }
    return;
  }

  if (event.type !== "message" || !event.message) return;

  if (!isAllowedStaff(userId)) {
    if (inGroup) return;
    await reply(replyToken, [
      text(`このボットは従業員専用です。
使う場合は管理者に次のIDを伝えてください。
${userId ?? ""}`),
    ]);
    return;
  }

  const message = event.message;
  const mentioned = (message.mention?.mentionees ?? []).some((m) => m.isSelf);
  const ctx: Context = {
    replyToken,
    sessionKey: inGroup ? `${userId}@${chatId}` : userId!,
    message,
    input: message.type === "text" ? stripSelfMention(message) : "",
  };

  try {
    const session = await loadSession(ctx.sessionKey);
    const started = FLOWS.find((f) => f.trigger.test(ctx.input));
    if (inGroup && !mentioned && !started && !session) return;

    if (ctx.input === CMD_CANCEL || ctx.input === "キャンセル") {
      await clearSession(ctx.sessionKey);
      await reply(replyToken, [text("やめました。サイトは変わっていません。", MENU)]);
      return;
    }

    if (started) {
      await started.start(ctx);
      return;
    }

    if (CMD_HELP.test(ctx.input) || (inGroup && !session && message.type === "text" && !ctx.input)) {
      await reply(replyToken, [helpMessage()]);
      return;
    }

    const flow = session && FLOWS.find((f) => f.name === session.flow);
    if (!session || !flow) {
      await DEFAULT_FLOW.start(ctx);
      return;
    }
    await flow.handle(ctx, session);
  } catch (err) {
    console.error("staff bot error:", err);
    await reply(replyToken, [text("エラーが発生しました。少し時間をおいて、もう一度お試しください。", MENU)]);
  }
}
