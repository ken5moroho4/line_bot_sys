// 提案カードのボタン（採用する／見送る／本番に反映する／やめる）を押したときの処理
import { closePullRequest, mergeToProduction, requestBuild } from "@/lib/github";
import { broadcastToCustomers, hasCustomerLine, reply, text } from "@/lib/line/api";
import { getProposal, transition, updateProposal } from "@/lib/proposals";
import { siteUrl } from "@/lib/site";
import { customerNewsMessage } from "@/lib/line/flex";
import { getNews, storeLabel } from "@/lib/news";

async function broadcastNews(replyToken: string, slug: string): Promise<void> {
  const news = slug ? await getNews(slug) : null;
  if (!news) {
    await reply(replyToken, [text("このお知らせは見つかりませんでした。削除された可能性があります。")]);
    return;
  }
  if (!hasCustomerLine()) {
    await reply(replyToken, [text("お客さま向け公式LINEの設定がまだのため送れませんでした。管理者に伝えてください。")]);
    return;
  }
  const message = customerNewsMessage({
    title: news.title,
    excerpt: news.excerpt,
    image: news.image,
    storeLabel: storeLabel(news.store),
    url: `${siteUrl()}/news/${news.slug}`,
  });
  const result = await broadcastToCustomers([message], `news-broadcast:${news.slug}`);
  await reply(replyToken, [
    text(result === "sent" ? `公式LINEの友だち全員に送りました。\n「${news.title}」` : `「${news.title}」は、もう公式LINEで送っています。`),
  ]);
}

export async function handlePostback(replyToken: string, data: string): Promise<void> {
  const params = new URLSearchParams(data);
  const action = params.get("a");
  if (action === "news-broadcast") {
    await broadcastNews(replyToken, params.get("slug") ?? "");
    return;
  }
  const id = params.get("id") ?? "";
  const p = id ? await getProposal(id) : null;
  if (!p) {
    await reply(replyToken, [text("この提案は見つかりませんでした。")]);
    return;
  }

  switch (action) {
    case "dismiss": {
      const done = await transition(id, ["proposed"], "dismissed");
      await reply(replyToken, [text(done ? `「${p.title}」は見送りました。` : alreadyHandled(p.status))]);
      return;
    }

    case "adopt": {
      if (p.kind === "content") {
        const done = await transition(id, ["proposed"], "adopted");
        await reply(replyToken, [
          done
            ? text(`「${p.title}」を採用しました。\n\n${p.detail || p.summary}\n\nお知らせにする場合は「ニュース」と送ってください。`, ["ニュース"])
            : text(alreadyHandled(p.status)),
        ]);
        return;
      }
      const done = await transition(id, ["proposed"], "building");
      if (!done) {
        await reply(replyToken, [text(alreadyHandled(p.status))]);
        return;
      }
      try {
        await requestBuild(p);
      } catch (err) {
        console.error(err);
        await updateProposal(id, { status: "proposed" });
        await reply(replyToken, [text("改修の依頼に失敗しました。少し時間をおいてもう一度押してください。")]);
        return;
      }
      await reply(replyToken, [
        text(`「${p.title}」の改修を始めました。\nAIが修正してプレビューができたら、ここでお知らせします（10〜20分ほど）。\nまだ本番のサイトは変わりません。`),
      ]);
      return;
    }

    case "merge": {
      if (!p.pr_number) {
        await reply(replyToken, [text("まだプレビューができていません。")]);
        return;
      }
      const done = await transition(id, ["preview"], "merged");
      if (!done) {
        await reply(replyToken, [text(alreadyHandled(p.status))]);
        return;
      }
      try {
        const { devSynced } = await mergeToProduction(p.pr_number);
        await reply(replyToken, [
          text(
            `本番に反映しました。数分でサイトに出ます。\n${siteUrl()}` +
              (devSynced ? "" : "\n\n※開発用ブランチ（dev）への取り込みは衝突したので、エンジニアが手で直します。")
          ),
        ]);
      } catch (err) {
        console.error(err);
        await updateProposal(id, { status: "preview" });
        await reply(replyToken, [text("本番への反映に失敗しました。サイトは変わっていません。")]);
      }
      return;
    }

    case "close": {
      const done = await transition(id, ["preview"], "closed");
      if (!done) {
        await reply(replyToken, [text(alreadyHandled(p.status))]);
        return;
      }
      if (p.pr_number) await closePullRequest(p.pr_number).catch((err) => console.error(err));
      await reply(replyToken, [text(`「${p.title}」の改修はやめました。本番のサイトは変わっていません。`)]);
      return;
    }

    default:
      await reply(replyToken, [text("この操作には対応していません。")]);
  }
}

function alreadyHandled(status: string): string {
  const labels: Record<string, string> = {
    dismissed: "見送り済み",
    adopted: "採用済み",
    building: "AIが改修中",
    preview: "プレビュー確認待ち",
    merged: "本番に反映済み",
    closed: "取りやめ済み",
    failed: "改修に失敗",
  };
  return `この提案はすでに「${labels[status] ?? status}」です。`;
}
