export type Mentionee = { index: number; length: number; type: string; isSelf?: boolean };

export type LineEvent = {
  type: string;
  replyToken?: string;
  source?: { type: string; userId?: string; groupId?: string; roomId?: string };
  message?: { type: string; id?: string; text?: string; mention?: { mentionees: Mentionee[] } };
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
