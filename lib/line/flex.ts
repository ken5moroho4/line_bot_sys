// 提案やプレビューを、ボタン付きのカード（Flex Message）にする
import type { FlexMessage } from "@/lib/line/types";
import type { Proposal } from "@/lib/proposals";

const GREEN = "#06C755";

function postback(label: string, data: string, style: "primary" | "secondary") {
  return {
    type: "button",
    style,
    height: "sm",
    ...(style === "primary" ? { color: GREEN } : {}),
    action: { type: "postback", label, data, displayText: label },
  };
}

function textBox(t: string, extra: Record<string, unknown> = {}) {
  return { type: "text", text: t || " ", wrap: true, ...extra };
}

function proposalBubble(p: Proposal) {
  const label = p.kind === "code" ? "サイトの改修" : "お知らせ・中身";
  const note =
    p.kind === "code"
      ? "採用すると、AIが修正してプレビューを作ります（まだ本番には出ません）"
      : "採用すると、作業メモとして残します";
  return {
    type: "bubble",
    size: "kilo",
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        textBox(label, { size: "xs", color: "#888888" }),
        textBox(p.title, { weight: "bold", size: "md" }),
        textBox(p.summary, { size: "sm" }),
        textBox(note, { size: "xxs", color: "#999999", margin: "md" }),
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        postback("採用する", `a=adopt&id=${p.id}`, "primary"),
        postback("見送る", `a=dismiss&id=${p.id}`, "secondary"),
      ],
    },
  };
}

export function proposalsMessage(proposals: Proposal[]): FlexMessage {
  return {
    type: "flex",
    altText: `今週の提案が${proposals.length}件あります`,
    contents: { type: "carousel", contents: proposals.slice(0, 10).map(proposalBubble) },
  };
}

export function previewMessage(p: Proposal): FlexMessage {
  return {
    type: "flex",
    altText: `「${p.title}」のプレビューができました`,
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          textBox("プレビューができました", { size: "xs", color: "#888888" }),
          textBox(p.title, { weight: "bold", size: "md" }),
          textBox("下のボタンで変更後の画面を確認してから、本番に出すか決めてください。", { size: "sm" }),
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          ...(p.preview_url
            ? [{ type: "button", style: "link", height: "sm", action: { type: "uri", label: "プレビューを見る", uri: p.preview_url } }]
            : []),
          postback("本番に反映する", `a=merge&id=${p.id}`, "primary"),
          postback("やめる", `a=close&id=${p.id}`, "secondary"),
        ],
      },
    },
  };
}

export function newsBroadcastCard(slug: string, title: string): FlexMessage {
  return {
    type: "flex",
    altText: "お客さま向けの公式LINEでも知らせますか？",
    contents: {
      type: "bubble",
      size: "kilo",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          textBox("お客さま向けの公式LINEでも知らせますか？", { weight: "bold", size: "sm" }),
          textBox(title, { size: "sm" }),
          textBox("友だち全員に届きます。月の送信数を友だちの人数分使います。", { size: "xxs", color: "#999999", margin: "md" }),
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [postback("公式LINEでも知らせる", `a=news-broadcast&slug=${encodeURIComponent(slug)}`, "primary")],
      },
    },
  };
}

export function customerNewsMessage(n: { title: string; excerpt: string; image: string | null; storeLabel: string; url: string }): FlexMessage {
  return {
    type: "flex",
    altText: `【${n.storeLabel}からのお知らせ】${n.title}`,
    contents: {
      type: "bubble",
      ...(n.image
        ? { hero: { type: "image", url: n.image, size: "full", aspectRatio: "20:13", aspectMode: "cover", action: { type: "uri", uri: n.url } } }
        : {}),
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          textBox(`${n.storeLabel}からのお知らせ`, { size: "xs", color: "#888888" }),
          textBox(n.title, { weight: "bold", size: "md" }),
          textBox(n.excerpt, { size: "sm" }),
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [{ type: "button", style: "primary", color: GREEN, height: "sm", action: { type: "uri", label: "詳しく見る", uri: n.url } }],
      },
    },
  };
}
