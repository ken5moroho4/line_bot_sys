import { reply, text } from "@/lib/line/api";
import { clearSession, saveSession, Session } from "@/lib/session";
import { deleteNews, listRecentNews, NewsSummary, storeLabel } from "@/lib/news";
import { CMD_CANCEL } from "@/lib/flows/commands";
import type { Context, Flow } from "@/lib/flows/types";

type Data = { choices: NewsSummary[]; target?: NewsSummary };
type Step = "pick" | "confirm";

const FLOW = "news-delete";
const CMD_DELETE_NEWS = "お知らせ削除";
const CMD_CONFIRM = "削除する";
export const NEWS_LIST_SIZE = 10;

function save(sessionKey: string, step: Step, data: Data) {
  return saveSession<Data>(sessionKey, { flow: FLOW, step, data });
}

export function describe(n: NewsSummary): string {
  return `${n.date} ${storeLabel(n.store)}「${n.title}」`;
}

export function choiceLabel(n: NewsSummary, i: number): string {
  return `${i + 1}. ${n.title}`;
}

async function start(ctx: Context) {
  const choices = await listRecentNews(NEWS_LIST_SIZE);
  if (!choices.length) {
    await reply(ctx.replyToken, [text("消せるお知らせがありません。")]);
    return;
  }
  await save(ctx.sessionKey, "pick", { choices });
  await reply(ctx.replyToken, [
    text(
      ["どのお知らせを消しますか？新しい順に並べています。", "", ...choices.map((n, i) => `${i + 1}. ${describe(n)}`)].join("\n"),
      [...choices.map(choiceLabel), CMD_CANCEL]
    ),
  ]);
}

async function handle(ctx: Context, session: Session) {
  const data = session.data as Data;
  const buttons = [...data.choices.map(choiceLabel), CMD_CANCEL];

  if (session.step === "pick") {
    const index = Number(ctx.input.normalize("NFKC").match(/^(\d+)/)?.[1]) - 1;
    const target = data.choices[index];
    if (!target) {
      await reply(ctx.replyToken, [text("下のボタンから消すお知らせを選んでください。", buttons)]);
      return;
    }
    await save(ctx.sessionKey, "confirm", { ...data, target });
    await reply(ctx.replyToken, [
      text(`${describe(target)}\nを削除しますか？サイトからすぐ消えます。`, [CMD_CONFIRM, CMD_CANCEL]),
    ]);
    return;
  }

  if (session.step === "confirm" && data.target) {
    if (ctx.input !== CMD_CONFIRM) {
      await reply(ctx.replyToken, [text("「削除する」か「やめる」を押してください。", [CMD_CONFIRM, CMD_CANCEL])]);
      return;
    }
    await deleteNews(data.target.slug);
    await clearSession(ctx.sessionKey);
    await reply(ctx.replyToken, [text(`削除しました。\n${describe(data.target)}`, [CMD_DELETE_NEWS])]);
    return;
  }

  await clearSession(ctx.sessionKey);
  await start(ctx);
}

export const newsDeleteFlow: Flow = {
  name: FLOW,
  label: CMD_DELETE_NEWS,
  trigger: /^(お知らせ|ニュース)(の|を)?(削除|消)/,
  description: "公開したお知らせを消す",
  start,
  handle,
};
