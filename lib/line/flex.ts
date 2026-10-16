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
