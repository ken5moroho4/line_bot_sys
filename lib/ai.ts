// OpenAI API（Chat Completions）を直接呼ぶ。SDK を入れずに fetch だけで済ませる
import { requireEnv } from "@/lib/env";

export type ChatTurn = { role: "user" | "assistant"; content: string };

export function hasAi(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export async function askAi(system: string, user: string, maxTokens = 4000): Promise<string> {
  return chatAi(system, [{ role: "user", content: user }], maxTokens);
}

export async function chatAi(system: string, messages: ChatTurn[], maxTokens = 4000): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${requireEnv("OPENAI_API_KEY")}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o",
      max_completion_tokens: maxTokens,
      messages: [{ role: "system", content: system }, ...messages],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI API failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
  return json.choices?.[0]?.message?.content ?? "";
}

// 返答の中から最初の JSON オブジェクトを取り出す（```json で囲まれていても可）
export function extractJson<T>(text: string): T {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("JSON が見つかりませんでした");
  return JSON.parse(text.slice(start, end + 1)) as T;
}
