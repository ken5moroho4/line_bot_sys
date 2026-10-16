export type LineEvent = {
  type: string;
  replyToken?: string;
  source?: { type: string; userId?: string };
  message?: { type: string; id?: string; text?: string };
  postback?: { data: string };
};

export type QuickReplyItem = {
  type: "action";
  action: { type: "message"; label: string; text: string };
};

export type TextMessage = { type: "text"; text: string; quickReply?: { items: QuickReplyItem[] } };
// Flex Message は形が自由なので中身は緩く持つ
export type FlexMessage = { type: "flex"; altText: string; contents: Record<string, unknown> };
export type LineMessage = TextMessage | FlexMessage;
