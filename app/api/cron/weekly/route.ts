import { NextRequest, NextResponse } from "next/server";
import { hasBearer } from "@/lib/auth";
import { pushToStaff, text } from "@/lib/line/api";
import { proposalsMessage } from "@/lib/line/flex";
import { buildWeeklyReport } from "@/lib/report/weekly";

// 毎週月曜の朝（vercel.json の crons）に Vercel から呼ばれる。
// 手で試すとき：GET /api/cron/weekly?dry=1 （Authorization: Bearer <CRON_SECRET>）→ LINEには送らず中身だけ返す
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  if (!hasBearer(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const dry = request.nextUrl.searchParams.get("dry") === "1";

  try {
    const report = await buildWeeklyReport({ save: !dry });
    if (!dry) {
      const head = text(`【今週のサイトの様子】\n${report.summary}`);
      await pushToStaff(report.proposals.length ? [head, proposalsMessage(report.proposals)] : [head]);
    }
    return NextResponse.json({ ok: true, dry, ...report });
  } catch (err) {
    console.error("weekly report error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
