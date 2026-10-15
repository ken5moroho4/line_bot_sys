import type { LineEvent } from "@/lib/line/types";
import type { Session } from "@/lib/session";

// 1回の受信メッセージについての情報
export type Context = {
  replyToken: string;
  userId: string;
  message: NonNullable<LineEvent["message"]>;
  input: string; // 文字メッセージなら前後の空白を除いた本文、それ以外は ""
};

// 「ニュース」のような1つの会話の流れ。機能を増やすときはこれを1つ足して lib/flows/index.ts に登録する
export type Flow = {
  name: string; // line_staff_sessions.flow に入る名前
  label: string; // ヘルプやボタンに出す言葉（話しかけるきっかけにもなる）
  trigger: RegExp; // この言葉で会話を始める
  description: string; // ヘルプに出す説明
  start(ctx: Context): Promise<void>;
  handle(ctx: Context, session: Session): Promise<void>;
};
