// 週次レポート：PostHog の数字 → Claude が読んで提案 → 保存
// 提案は WEEKLY_PROPOSALS=on のときだけ作る（それ以外は数字のまとめだけ）
import { askClaude, extractJson, hasClaude } from "@/lib/claude";
import { collectWeeklyStats, WeeklyStats } from "@/lib/posthog";
import { recentCommits } from "@/lib/github";
import { insertProposals, listRecentProposals, NewProposal, Proposal } from "@/lib/proposals";

export type WeeklyReport = { stats: WeeklyStats; summary: string; proposals: Proposal[] };

const SITE = `あなたは小さな豆腐店「杜のとうふ工房 三河屋」のWebサイト（https://www.jfcreate-mikawaya.com）の運用担当です。
サイトは Next.js 製で、店舗紹介（逗子・金目・山守・秦野）、お知らせ、通販（豆腐・スイーツ・わんこクッキーなど）、会員、注文があります。
毎週、アクセス解析（PostHog）の数字を読んで、店の従業員に今週の様子を伝えます。
読み手はITに詳しくない店の人です。専門用語を避け、短く、具体的に書いてください。

数字は changes に前週比（%）を計算済みなので、それを使ってください。増減を書くときは「前週 849 → 今週 2,038（+140%）」のように必ず「前週 → 今週」の順にします。
funnel は「購入までの流れ」で、各段階まで進んだ人数です。どこで人が止まっているかを1行で触れてください。
数字が少なすぎて判断できない場合は、そのことを書いてください。`;

const SUMMARY_ONLY = `${SITE}
出力は次の JSON だけにしてください。
{ "summary": "今週の様子を3〜5行で（増減は前週比で）" }`;

const WITH_PROPOSALS = `${SITE}
あわせて「今週やると良いこと」を提案します。提案は2種類です。
- "content": お知らせ・商品説明・写真など、店の人が中身を用意すれば済むもの
- "code": サイトの画面や仕組みを直すもの。採用されると別のAIエンジニアがコードを修正します。
  detail には、そのエンジニアが迷わず作業できるよう、目的・対象ページ・具体的な変更内容・やってはいけないことを書いてください。
  大きな作り直しではなく、1つのPRで終わる小さく安全な改善に限ります（決済・会員・注文処理には触れない）。

同じ提案をくり返さないために、必ず次を確認してから提案してください。
- pastProposals：これまでの提案と、その結果（status）。merged / adopted / building / preview は対応済みか対応中、dismissed / closed は店が見送ったもの。どれも言い方を変えて再提案しないこと。
- recentChanges：本番サイトに最近入った変更。ここに入っていることは「もうやったこと」です。
- 効果を見るのは数字が出てから。直近2週間以内に入った変更の効果を理由に、同じ場所をまた直す提案はしないこと。
自信を持って勧められる新しい提案が無ければ、proposals は空にしてください。数を埋める必要はありません。

出力は次の JSON だけにしてください。
{
  "summary": "今週の様子を3〜5行で（増減は前週比で）",
  "proposals": [
    { "kind": "code" | "content", "title": "20字以内", "summary": "なぜ・何をするか 120字以内", "detail": "code の場合は作業指示。content の場合は具体例" }
  ]
}
proposals は最大3件。`;

export function proposalsEnabled(): boolean {
  return process.env.WEEKLY_PROPOSALS === "on";
}

// 失敗してもレポート自体は送れるよう、取れなかったら空にする
async function safe<T>(what: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.error(`weekly report: ${what} を取れませんでした`, err);
    return fallback;
  }
}

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
    `購入までの流れ：${s.funnel.map((f) => `${f.label} ${f.thisWeek}人`).join(" → ")}`,
  ].join("\n");
}

export function weekLabel(date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(date);
}

export async function buildWeeklyReport(options: { save: boolean; proposals?: boolean }): Promise<WeeklyReport> {
  const stats = await collectWeeklyStats();
  const wantProposals = options.proposals ?? proposalsEnabled();

  if (!hasClaude()) {
    return { stats, summary: fallbackSummary(stats), proposals: [] };
  }

  const changes = {
    pageviews: percent(stats.pageviews.thisWeek, stats.pageviews.lastWeek),
    visitors: percent(stats.visitors.thisWeek, stats.visitors.lastWeek),
  };
  const input: Record<string, unknown> = { ...stats, changes };
  if (wantProposals) {
    const [pastProposals, recentChanges] = await Promise.all([
      safe("過去の提案", () => listRecentProposals(30), []),
      safe("最近の変更", () => recentCommits(40), []),
    ]);
    input.pastProposals = pastProposals;
    input.recentChanges = recentChanges;
  }

  const text = await askClaude(
    wantProposals ? WITH_PROPOSALS : SUMMARY_ONLY,
    `今週（直近7日）と前週（その前の7日）の数字です。\n${JSON.stringify(input, null, 2)}`
  );
  const parsed = extractJson<{ summary?: string; proposals?: Partial<NewProposal>[] }>(text);

  const week = weekLabel();
  const items: NewProposal[] = (wantProposals ? parsed.proposals ?? [] : [])
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
