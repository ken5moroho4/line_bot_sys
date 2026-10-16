// お知らせ（ニュース）の投稿：店舗 → タイトル → 本文 → 写真 → 確認 → 公開
import { fetchContent, reply, text } from "@/lib/line/api";
import { clearSession, saveSession, Session } from "@/lib/session";
import { siteUrl } from "@/lib/site";
import {
  NEWS_STORES,
  NewsStore,
  buildExcerpt,
  createNews,
  todayJst,
  uploadNewsImage,
} from "@/lib/news";
import { CMD_CANCEL } from "@/lib/flows/commands";
import type { Context, Flow } from "@/lib/flows/types";

type Draft = { store?: NewsStore; title?: string; content?: string; image?: string | null };
type Step = "store" | "title" | "content" | "image" | "confirm";

const FLOW = "news";
const CMD_NEWS = "ニュース";
const CMD_PUBLISH = "公開する";
const CMD_NO_IMAGE = "写真なし";
const STORE_LABELS = Object.values(NEWS_STORES);

function save(userId: string, step: Step, data: Draft) {
  return saveSession<Draft>(userId, { flow: FLOW, step, data });
}

function matchStore(input: string): NewsStore | undefined {
  const s = input.normalize("NFKC").replace(/\s/g, "");
  if (/逗子|鎌倉|小町|渚/.test(s)) return "zushi";
  if (/秦野|はだの/.test(s)) return "hadano";
  if (/金目|平塚/.test(s)) return "kaname";
  if (/山守|茶屋/.test(s)) return "yamamori";
  return undefined;
}

function preview(d: Draft): string {
  const body = (d.content ?? "").length > 800 ? `${d.content!.slice(0, 800)}…` : d.content;
  return [
    "【確認】この内容で公開しますか？",
    "",
    `店舗：${d.store ? NEWS_STORES[d.store] : ""}`,
    `日付：${todayJst()}`,
    `タイトル：${d.title}`,
    `写真：${d.image ? "あり" : "なし"}`,
    "",
    body,
  ].join("\n");
}

async function start(ctx: Context) {
  await save(ctx.userId, "store", {});
  await reply(ctx.replyToken, [
    text("お知らせを作ります。どのお店のお知らせですか？\n（途中でやめるときは「やめる」）", [
      ...STORE_LABELS,
      CMD_CANCEL,
    ]),
  ]);
}

async function handle(ctx: Context, session: Session) {
  const { replyToken, userId, message, input } = ctx;
  const d = session.data as Draft;

  switch (session.step as Step) {
    case "store": {
      const store = matchStore(input);
      if (!store) {
        await reply(replyToken, [text("下のボタンからお店を選んでください。", [...STORE_LABELS, CMD_CANCEL])]);
        return;
      }
      await save(userId, "title", { ...d, store });
      await reply(replyToken, [text(`${NEWS_STORES[store]}ですね。\nタイトルを送ってください。`, [CMD_CANCEL])]);
      return;
    }

    case "title": {
      if (!input) {
        await reply(replyToken, [text("タイトルを文字で送ってください。", [CMD_CANCEL])]);
        return;
      }
      if (input.length > 100) {
        await reply(replyToken, [text("タイトルは100文字以内でお願いします。", [CMD_CANCEL])]);
        return;
      }
      await save(userId, "content", { ...d, title: input });
      await reply(replyToken, [
        text("本文を送ってください。\n（改行もそのまま反映されます。URLはリンクになります）", [CMD_CANCEL]),
      ]);
      return;
    }

    case "content": {
      if (!input) {
        await reply(replyToken, [text("本文を文字で送ってください。", [CMD_CANCEL])]);
        return;
      }
      await save(userId, "image", { ...d, content: input });
      await reply(replyToken, [
        text("写真を1枚送ってください。\n写真を付けない場合は「写真なし」を押してください。", [CMD_NO_IMAGE, CMD_CANCEL]),
      ]);
      return;
    }

    case "image": {
      let image: string | null;
      if (message.type === "image" && message.id) {
        const { bytes, contentType } = await fetchContent(message.id);
        image = await uploadNewsImage(bytes, contentType);
      } else if (input === CMD_NO_IMAGE || input === "なし") {
        image = null;
      } else {
        await reply(replyToken, [text("写真を送るか、「写真なし」を押してください。", [CMD_NO_IMAGE, CMD_CANCEL])]);
        return;
      }
      const next = { ...d, image };
      await save(userId, "confirm", next);
      await reply(replyToken, [text(preview(next), [CMD_PUBLISH, CMD_CANCEL])]);
      return;
    }

    case "confirm": {
      if (input !== CMD_PUBLISH) {
        await reply(replyToken, [text("「公開する」か「やめる」を押してください。", [CMD_PUBLISH, CMD_CANCEL])]);
        return;
      }
      if (!d.store || !d.title || !d.content) {
        await clearSession(userId);
        await reply(replyToken, [text("内容が足りないため最初からやり直してください。", [CMD_NEWS])]);
        return;
      }
      const { slug } = await createNews({
        title: d.title,
        store: d.store,
        date: todayJst(),
        excerpt: buildExcerpt(d.content),
        image: d.image ?? null,
        content: d.content,
      });
      await clearSession(userId);
      await reply(replyToken, [
        text(
          `公開しました！\n${siteUrl()}/news/${slug}\n\n※修正・削除・メール配信は管理画面から行ってください。`,
          [CMD_NEWS]
        ),
      ]);
      return;
    }

    default:
      // 知らない段階（古い途中経過など）は最初からやり直す
      await clearSession(userId);
      await start(ctx);
  }
}

export const newsFlow: Flow = {
  name: FLOW,
  label: CMD_NEWS,
  trigger: /^(ニュース|お知らせ)(投稿|作成)?$/,
  description: "お知らせを投稿する",
  start,
  handle,
};
