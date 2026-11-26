import { hasCustomerLine, reply, text } from "@/lib/line/api";
import { newsBroadcastCard } from "@/lib/line/flex";
import { clearSession, saveSession, Session } from "@/lib/session";
import { listRecentNews, NewsSummary } from "@/lib/news";
import { CMD_CANCEL } from "@/lib/flows/commands";
import { choiceLabel, describe, NEWS_LIST_SIZE } from "@/lib/flows/news-delete";
import type { Context, Flow } from "@/lib/flows/types";

type Data = { choices: NewsSummary[] };

const FLOW = "news-broadcast";
const CMD_BROADCAST = "公式LINEで知らせる";

async function start(ctx: Context) {
  if (!hasCustomerLine()) {
    await reply(ctx.replyToken, [text("お客さま向け公式LINEの設定がまだのため送れません。管理者に伝えてください。")]);
    return;
  }
  const choices = await listRecentNews(NEWS_LIST_SIZE);
  if (!choices.length) {
    await reply(ctx.replyToken, [text("知らせるお知らせがまだありません。")]);
    return;
  }
  await saveSession<Data>(ctx.sessionKey, { flow: FLOW, step: "pick", data: { choices } });
  await reply(ctx.replyToken, [
    text(
      ["どのお知らせを公式LINEで知らせますか？新しい順に並べています。", "", ...choices.map((n, i) => `${i + 1}. ${describe(n)}`)].join("\n"),
      [...choices.map(choiceLabel), CMD_CANCEL]
    ),
  ]);
}

async function handle(ctx: Context, session: Session) {
  const { choices } = session.data as Data;
  const index = Number(ctx.input.normalize("NFKC").match(/^(\d+)/)?.[1]) - 1;
  const target = choices[index];
  if (!target) {
    await reply(ctx.replyToken, [text("下のボタンから知らせるお知らせを選んでください。", [...choices.map(choiceLabel), CMD_CANCEL])]);
    return;
  }
  await clearSession(ctx.sessionKey);
  await reply(ctx.replyToken, [newsBroadcastCard(target.slug, target.title)]);
}

export const newsBroadcastFlow: Flow = {
  name: FLOW,
  label: CMD_BROADCAST,
  trigger: /公式\s*(LINE|ライン|ﾗｲﾝ)/i,
  description: "公開済みのお知らせを、お客さま向けの公式LINEで友だち全員に知らせる",
  start,
  handle,
};
