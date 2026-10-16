// PostHog から集計を読み出す（HogQL）。読み取り専用の Personal API Key を使う
import { requireEnv } from "@/lib/env";

type QueryResult = { results: unknown[][]; columns?: string[] };

export async function hogql(query: string): Promise<unknown[][]> {
  const host = (process.env.POSTHOG_HOST || "https://us.posthog.com").replace(/\/$/, "");
  const res = await fetch(`${host}/api/projects/${requireEnv("POSTHOG_PROJECT_ID")}/query/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${requireEnv("POSTHOG_PERSONAL_API_KEY")}`,
    },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
  });
  if (!res.ok) throw new Error(`PostHog query failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as QueryResult;
  return json.results ?? [];
}

const THIS_WEEK = "timestamp >= now() - INTERVAL 7 DAY";
const LAST_WEEK = "timestamp >= now() - INTERVAL 14 DAY AND timestamp < now() - INTERVAL 7 DAY";

export type WeeklyStats = {
  pageviews: { thisWeek: number; lastWeek: number };
  visitors: { thisWeek: number; lastWeek: number };
  topPages: { path: string; views: number; visitors: number }[];
  referrers: { domain: string; views: number }[];
  devices: { device: string; views: number }[];
  events: { event: string; thisWeek: number; lastWeek: number }[];
};

const num = (v: unknown) => Number(v ?? 0);
const str = (v: unknown, fallback: string) => (v === null || v === undefined || v === "" ? fallback : String(v));

// 直近7日と、その前の7日を比べられる形で集める
export async function collectWeeklyStats(): Promise<WeeklyStats> {
  const [overview, topPages, referrers, devices, events] = await Promise.all([
    hogql(`
      SELECT
        countIf(${THIS_WEEK}), countIf(${LAST_WEEK}),
        uniqIf(distinct_id, ${THIS_WEEK}), uniqIf(distinct_id, ${LAST_WEEK})
      FROM events
      WHERE event = '$pageview' AND timestamp >= now() - INTERVAL 14 DAY`),
    hogql(`
      SELECT properties.$pathname AS path, count() AS views, uniq(distinct_id) AS visitors
      FROM events
      WHERE event = '$pageview' AND ${THIS_WEEK}
      GROUP BY path ORDER BY views DESC LIMIT 15`),
    hogql(`
      SELECT properties.$referring_domain AS domain, count() AS views
      FROM events
      WHERE event = '$pageview' AND ${THIS_WEEK}
      GROUP BY domain ORDER BY views DESC LIMIT 10`),
    hogql(`
      SELECT properties.$device_type AS device, count() AS views
      FROM events
      WHERE event = '$pageview' AND ${THIS_WEEK}
      GROUP BY device ORDER BY views DESC LIMIT 5`),
    // サイト独自のイベント（カート追加・購入など。$ で始まるのは PostHog 自動のもの）
    hogql(`
      SELECT event, countIf(${THIS_WEEK}) AS this_week, countIf(${LAST_WEEK}) AS last_week
      FROM events
      WHERE timestamp >= now() - INTERVAL 14 DAY AND NOT startsWith(event, '$')
      GROUP BY event ORDER BY this_week DESC LIMIT 20`),
  ]);

  const o = overview[0] ?? [];
  return {
    pageviews: { thisWeek: num(o[0]), lastWeek: num(o[1]) },
    visitors: { thisWeek: num(o[2]), lastWeek: num(o[3]) },
    topPages: topPages.map((r) => ({ path: str(r[0], "(不明)"), views: num(r[1]), visitors: num(r[2]) })),
    referrers: referrers.map((r) => ({ domain: str(r[0], "(直接・不明)"), views: num(r[1]) })),
    devices: devices.map((r) => ({ device: str(r[0], "(不明)"), views: num(r[1]) })),
    events: events.map((r) => ({ event: str(r[0], "?"), thisWeek: num(r[1]), lastWeek: num(r[2]) })),
  };
}
