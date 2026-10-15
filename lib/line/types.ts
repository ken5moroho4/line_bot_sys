export type LineEvent = {
  type: string;
  replyToken?: string;
  source?: { type: string; userId?: string };
  message?: { type: string; id?: string; text?: string };
};

export type QuickReplyItem = {
  type: "action";
  action: { type: "message"; label: string; text: string };
};

export type LineMessage = { type: "text"; text: string; quickReply?: { items: QuickReplyItem[] } };
