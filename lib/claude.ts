// Claude API（Messages API）を直接呼ぶ。SDK を入れずに fetch だけで済ませる
import { requireEnv } from "@/lib/env";

export function hasClaude(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function askClaude(system: string, user: string, maxTokens = 4000): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": requireEnv("ANTHROPIC_API_KEY"),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { content?: { type: string; text?: string }[] };
  return (json.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("");
}

// 返答の中から最初の JSON オブジェクトを取り出す（```json で囲まれていても可）
export function extractJson<T>(text: string): T {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("JSON が見つかりませんでした");
  return JSON.parse(text.slice(start, end + 1)) as T;
}
