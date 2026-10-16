import { NextRequest, NextResponse } from "next/server";
import { hasBearer } from "@/lib/auth";
import { pushToStaff, text } from "@/lib/line/api";
import { previewMessage } from "@/lib/line/flex";
import { getProposal, updateProposal } from "@/lib/proposals";

// サイト側の GitHub Actions から呼ばれる。
// status=ready：PR とプレビューができた → LINEに確認ボタンを送る
// status=failed：AIが改修できなかった → LINEで知らせる
type Body = {
  proposal_id?: string;
  status?: "ready" | "failed";
  pr_number?: number;
  pr_url?: string;
  preview_url?: string;
  message?: string;
};

export async function POST(request: NextRequest) {
  if (!hasBearer(request.headers.get("authorization"), process.env.GITHUB_NOTIFY_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as Body;
  const p = body.proposal_id ? await getProposal(body.proposal_id) : null;
  if (!p) return NextResponse.json({ error: "proposal not found" }, { status: 404 });

  if (body.status === "failed") {
    if (p.status !== "building") return NextResponse.json({ ok: true, skipped: p.status });
    await updateProposal(p.id, { status: "failed" });
    await pushToStaff([
      text(`「${p.title}」はAIがうまく改修できませんでした。サイトは変わっていません。${body.message ? `\n（${body.message.slice(0, 200)}）` : ""}`),
    ]);
    return NextResponse.json({ ok: true });
  }

  // 同じプレビューで何度も呼ばれても、LINEには1回だけ送る
  if (p.status !== "building") return NextResponse.json({ ok: true, skipped: p.status });
  const next = {
    status: "preview" as const,
    pr_number: body.pr_number ?? null,
    pr_url: body.pr_url ?? null,
    preview_url: body.preview_url ?? null,
  };
  await updateProposal(p.id, next);
  await pushToStaff([previewMessage({ ...p, ...next })]);
  return NextResponse.json({ ok: true });
}
