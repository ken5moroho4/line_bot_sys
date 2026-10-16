// 週次レポート：PostHog の数字 → Claude が読んで提案 → 保存
import { askClaude, extractJson, hasClaude } from "@/lib/claude";
import { collectWeeklyStats, WeeklyStats } from "@/lib/posthog";
import { insertProposals, NewProposal, Proposal } from "@/lib/proposals";

export type WeeklyReport = { stats: WeeklyStats; summary: string; proposals: Proposal[] };

const SYSTEM = `あなたは小さな豆腐店「杜のとうふ工房 三河屋」のWebサイト（https://www.jfcreate-mikawaya.com）の運用担当です。
サイトは Next.js 製で、店舗紹介（逗子・金目・山守）、お知らせ、通販（豆腐・スイーツ・わんこクッキーなど）、会員、注文があります。
毎週、アクセス解析（PostHog）の数字を読んで、店の従業員に「今週やると良いこと」を提案します。
読み手はITに詳しくない店の人です。専門用語を避け、短く、具体的に書いてください。

提案は2種類です。
- "content": お知らせ・商品説明・写真など、店の人が中身を用意すれば済むもの
- "code": サイトの画面や仕組みを直すもの。採用されると別のAIエンジニアがコードを修正します。
  detail には、そのエンジニアが迷わず作業できるよう、目的・対象ページ・具体的な変更内容・やってはいけないことを書いてください。
  大きな作り直しではなく、1つのPRで終わる小さく安全な改善に限ります（決済・会員・注文処理には触れない）。

数字は changes に前週比（%）を計算済みなので、それを使ってください。増減を書くときは「前週 849 → 今週 2,038（+140%）」のように必ず「前週 → 今週」の順にします。
数字が少なすぎて判断できない場合は、無理に提案せず、そのことを summary に書いてください。
出力は次の JSON だけにしてください。
{
  "summary": "今週の様子を3〜5行で（増減は前週比で）",
  "proposals": [
    { "kind": "code" | "content", "title": "20字以内", "summary": "なぜ・何をするか 120字以内", "detail": "code の場合は作業指示。content の場合は具体例" }
  ]
}
proposals は最大3件。`;

// 前週比（%）。前週が0なら null
function percent(thisWeek: number, lastWeek: number): number | null {
  return lastWeek ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : null;
}

function fallbackSummary(s: WeeklyStats): string {
  const diff = (a: number, b: number) => {
    const p = percent(a, b);
    return p === null ? "—" : `${p >= 0 ? "+" : ""}${p}%`;
  };
  const top = s.topPages.slice(0, 3).map((p) => `${p.path}（${p.views}）`).join("、");
  return [
    `閲覧数 ${s.pageviews.thisWeek}（前週比 ${diff(s.pageviews.thisWeek, s.pageviews.lastWeek)}）`,
    `訪問者 ${s.visitors.thisWeek}人（前週比 ${diff(s.visitors.thisWeek, s.visitors.lastWeek)}）`,
    `よく見られたページ：${top || "なし"}`,
  ].join("\n");
}

export function weekLabel(date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(date);
}

export async function buildWeeklyReport(options: { save: boolean }): Promise<WeeklyReport> {
  const stats = await collectWeeklyStats();

  if (!hasClaude()) {
    return { stats, summary: fallbackSummary(stats), proposals: [] };
  }

  const changes = {
    pageviews: percent(stats.pageviews.thisWeek, stats.pageviews.lastWeek),
    visitors: percent(stats.visitors.thisWeek, stats.visitors.lastWeek),
  };
  const text = await askClaude(
    SYSTEM,
    `今週（直近7日）と前週（その前の7日）の数字です。\n${JSON.stringify({ ...stats, changes }, null, 2)}`
  );
  const parsed = extractJson<{ summary?: string; proposals?: Partial<NewProposal>[] }>(text);

  const week = weekLabel();
  const items: NewProposal[] = (parsed.proposals ?? [])
    .filter((p) => (p.kind === "code" || p.kind === "content") && p.title && p.summary)
    .slice(0, 3)
    .map((p) => ({
      week,
      kind: p.kind as NewProposal["kind"],
      title: String(p.title).slice(0, 40),
      summary: String(p.summary).slice(0, 300),
      detail: String(p.detail ?? "").slice(0, 4000),
    }));

  const proposals = options.save
    ? await insertProposals(items)
    : items.map((p, i) => ({ ...p, id: `dry-${i}`, status: "proposed" as const, pr_number: null, pr_url: null, preview_url: null }));

  return { stats, summary: parsed.summary || fallbackSummary(stats), proposals };
}
