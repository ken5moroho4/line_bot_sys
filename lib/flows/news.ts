// お知らせ（ニュース）の投稿：話した内容から AI が下書き → やりとりで直す → 写真 → 公開
import { fetchContent, hasCustomerLine, reply, text } from "@/lib/line/api";
import { newsBroadcastCard } from "@/lib/line/flex";
import { clearSession, saveSession, Session } from "@/lib/session";
import { siteUrl } from "@/lib/site";
import { chatAi, ChatTurn, extractJson, hasAi } from "@/lib/ai";
import {
  NEWS_STORES,
  NewsStore,
  buildExcerpt,
  createNews,
  todayJst,
  uploadNewsImage,
} from "@/lib/news";
import { CMD_CANCEL } from "@/lib/flows/commands";
import { newsDeleteFlow } from "@/lib/flows/news-delete";
import { newsBroadcastFlow } from "@/lib/flows/news-broadcast";
import type { Context, Flow } from "@/lib/flows/types";

type Draft = { store?: NewsStore; title?: string; content?: string; image?: string | null };
type Data = { draft: Draft; history: ChatTurn[]; pendingImageId?: string };

const FLOW = "news";
const CMD_NEWS = "ニュース";
const CMD_PUBLISH = "公開する";
const CMD_REMOVE_IMAGE = "写真を外す";
const PENDING = "pending";
const START_WORD = /^(ニュース|お知らせ)(投稿|作成)?$/;
const TRIGGER = /^(?!.*(削除|消|公式)).*ニュース|^お知らせ(投稿|作成)?$/;
const MAX_HISTORY = 20;

const SYSTEM = `あなたは豆腐店「杜のとうふ工房 三河屋」の従業員が、店のサイトに載せるお知らせを作るのを手伝います。
従業員は LINE で話しかけてきます。話の内容からお知らせの下書き（店舗・タイトル・本文）を作り、頼まれたら直します。

店舗は次のどれかです。かっこ内は従業員が使いそうな呼び方です。
- hadano：秦野店（秦野、はだの）
- zushi：逗子店（逗子、鎌倉、小町、渚）
- kaname：金目店（金目、平塚）
- yamamori：山守（山守、茶屋）

守ること
- 従業員が言っていない事実（日付、価格、数量、時間、商品名、理由）は書かない。足りなければ reply で聞く。
- 「明日」「来週の土曜」のような言い方は、今日の日付から計算して「12月1日（月）」のように日付で書く。
- タイトルは40字以内。本文はお客さま向けの丁寧な文で、短めにする。
- 店舗が分からないときは store を null にして、reply でどの店か聞く。
- 写真は、従業員がこのトークに写真を送ると下書きに付く。今の下書きの image が「あり」なら付いている。写真の話をされたら、付いているか、このトークに写真を送ればよいことを伝える。
- 公開はあなたにはできない。従業員が「公開する」ボタンを押すと公開される。
- 公開済みのお知らせを消したい・削除したいという話なら、action を "delete" にする。公開済みのお知らせをお客さま向けの公式LINEで知らせたいという話なら "broadcast" にする。それ以外は "draft"。
- お知らせと関係のない話には、reply で短く答え、下書きは変えない。

出力は次の JSON だけにしてください。変えない項目も、今の値をそのまま入れてください。
{ "action": "draft" | "delete" | "broadcast", "store": "hadano" | "zushi" | "kaname" | "yamamori" | null, "title": string | null, "content": string | null, "reply": "従業員への短い返事（1〜2文）" }`;

function save(sessionKey: string, data: Data) {
  return saveSession<Data>(sessionKey, { flow: FLOW, step: "chat", data });
}

function isComplete(d: Draft): boolean {
  return Boolean(d.store && d.title && d.content);
}

function hasDraft(d: Draft): boolean {
  return Boolean(d.store || d.title || d.content);
}

function preview(d: Draft): string {
  const body = (d.content ?? "").length > 800 ? `${d.content!.slice(0, 800)}…` : d.content;
  return [
    "【下書き】",
    `店舗：${d.store ? NEWS_STORES[d.store] : "（未定）"}`,
    `日付：${todayJst()}`,
    `タイトル：${d.title ?? "（未定）"}`,
    `写真：${d.image ? "あり" : "なし"}`,
    "",
    body ?? "（本文未定）",
  ].join("\n");
}

function buttons(d: Draft): string[] {
  return [
    ...(isComplete(d) ? [CMD_PUBLISH] : []),
    ...(hasDraft(d) && !d.store ? Object.values(NEWS_STORES) : []),
    ...(d.image ? [CMD_REMOVE_IMAGE] : []),
    CMD_CANCEL,
  ];
}

async function replyWithDraft(replyToken: string, message: string, d: Draft) {
  const hint = isComplete(d)
    ? "直したいところがあれば話しかけてください。写真を付けるなら送ってください。"
    : "";
  if (!hasDraft(d)) {
    await reply(replyToken, [text(message, buttons(d))]);
    return;
  }
  await reply(replyToken, [text(message), text(hint ? `${preview(d)}\n\n${hint}` : preview(d), buttons(d))]);
}

function sanitize(raw: Record<string, unknown>, prev: Draft): Draft {
  const store = typeof raw.store === "string" && raw.store in NEWS_STORES ? (raw.store as NewsStore) : undefined;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  return {
    store,
    title: str(raw.title)?.slice(0, 100),
    content: str(raw.content),
    image: prev.image ?? null,
  };
}

async function talk(ctx: Context, data: Data) {
  const history: ChatTurn[] = [...data.history, { role: "user" as const, content: ctx.input }].slice(-MAX_HISTORY);
  const { image, ...draftForAi } = data.draft;
  const system = `${SYSTEM}\n\n今日は ${todayJst()} です。\n今の下書き：${JSON.stringify({ ...draftForAi, image: image ? "あり" : "なし" })}`;
  const raw = extractJson<Record<string, unknown>>(await chatAi(system, history, 2000));
  const handoff = raw.action === "delete" ? newsDeleteFlow : raw.action === "broadcast" ? newsBroadcastFlow : null;
  if (handoff) {
    await clearSession(ctx.sessionKey);
    await handoff.start(ctx);
    return;
  }
  const draft = sanitize(raw, data.draft);
  const message = typeof raw.reply === "string" && raw.reply.trim() ? raw.reply.trim() : "下書きを作りました。";

  await save(ctx.sessionKey, {
    draft,
    history: [...history, { role: "assistant" as const, content: JSON.stringify(raw) }].slice(-MAX_HISTORY),
  });
  await replyWithDraft(ctx.replyToken, message, draft);
}

async function publish(ctx: Context, d: Draft) {
  if (!isComplete(d)) {
    await reply(ctx.replyToken, [text("まだ店舗・タイトル・本文がそろっていません。", buttons(d))]);
    return;
  }
  const { slug } = await createNews({
    title: d.title!,
    store: d.store!,
    date: todayJst(),
    excerpt: buildExcerpt(d.content!),
    image: d.image ?? null,
    content: d.content!,
  });
  await clearSession(ctx.sessionKey);
  await reply(ctx.replyToken, [
    text(`公開しました！\n${siteUrl()}/news/${slug}\n\n※消すときは「お知らせ削除」と送ってください。修正・メール配信は管理画面から行ってください。`, [CMD_NEWS]),
    ...(hasCustomerLine() ? [newsBroadcastCard(slug, d.title!)] : []),
  ]);
}

async function start(ctx: Context) {
  if (!hasAi()) {
    await reply(ctx.replyToken, [text("いまAIが使えないため、お知らせは管理画面から投稿してください。")]);
    return;
  }
  const empty: Data = { draft: {}, history: [] };
  if (START_WORD.test(ctx.input)) {
    await save(ctx.sessionKey, empty);
    await reply(ctx.replyToken, [
      text(
        "どんなお知らせですか？話しかけるように送ってください。\n例：秦野店、12月1日から寄せ豆腐はじめるってお知らせ出して\n（やめるときは「やめる」）",
        [CMD_CANCEL]
      ),
    ]);
    return;
  }
  await handle(ctx, { flow: FLOW, step: "chat", data: empty });
}

export async function rememberImage(sessionKey: string, messageId: string) {
  await saveSession<Data>(sessionKey, { flow: FLOW, step: PENDING, data: { draft: {}, history: [], pendingImageId: messageId } });
}

async function attachPendingImage(data: Partial<Data>): Promise<Draft> {
  const draft = data.draft ?? {};
  if (!data.pendingImageId) return draft;
  try {
    const { bytes, contentType } = await fetchContent(data.pendingImageId);
    return { ...draft, image: await uploadNewsImage(bytes, contentType) };
  } catch (err) {
    console.error("pending image:", err);
    return draft;
  }
}

async function handle(ctx: Context, session: Session) {
  const data = session.data as Partial<Data>;
  const current: Data = { draft: await attachPendingImage(data), history: data.history ?? [] };
  const { message, input } = ctx;

  if (START_WORD.test(input) && !current.history.length) {
    await save(ctx.sessionKey, current);
    const ask = "どんなお知らせですか？話しかけるように送ってください。";
    await replyWithDraft(ctx.replyToken, current.draft.image ? `写真を受け取っています。${ask}` : ask, current.draft);
    return;
  }

  if (message.type === "image" && message.id) {
    const { bytes, contentType } = await fetchContent(message.id);
    const draft = { ...current.draft, image: await uploadNewsImage(bytes, contentType) };
    await save(ctx.sessionKey, { ...current, draft });
    await replyWithDraft(
      ctx.replyToken,
      hasDraft(draft) ? "写真を付けました。" : "写真を受け取りました。どんなお知らせか話しかけてください。",
      draft
    );
    return;
  }
  if (input === CMD_PUBLISH) {
    await publish(ctx, current.draft);
    return;
  }
  if (input === CMD_REMOVE_IMAGE) {
    const draft = { ...current.draft, image: null };
    await save(ctx.sessionKey, { ...current, draft });
    await replyWithDraft(ctx.replyToken, "写真を外しました。", draft);
    return;
  }
  if (!input) {
    await reply(ctx.replyToken, [text("文字か写真で送ってください。", buttons(current.draft))]);
    return;
  }
  await talk(ctx, current);
}

export function isPending(session: Session | null): boolean {
  return session?.flow === FLOW && session.step === PENDING;
}

export const newsFlow: Flow = {
  name: FLOW,
  label: CMD_NEWS,
  trigger: TRIGGER,
  description: "お知らせを投稿する（話しかけるだけでAIが下書きします）",
  start,
  handle,
};
