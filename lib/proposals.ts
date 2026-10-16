// ボットからの提案（line_proposals）。週次レポートで作られ、LINEのボタンで状態が進む
import { getAdmin } from "@/lib/supabase";

export type ProposalKind = "code" | "content";
export type ProposalStatus =
  | "proposed" // LINEに送った
  | "dismissed" // 見送り
  | "adopted" // 採用（コンテンツ系。あとは人が作業）
  | "building" // 採用（改修系）→ GitHub で AI が作業中
  | "preview" // PR とプレビューができた
  | "merged" // 本番に反映した
  | "closed" // プレビューを見てやめた
  | "failed"; // 改修に失敗した

export type Proposal = {
  id: string;
  week: string;
  kind: ProposalKind;
  title: string;
  summary: string;
  detail: string;
  status: ProposalStatus;
  pr_number: number | null;
  pr_url: string | null;
  preview_url: string | null;
};

export type NewProposal = Pick<Proposal, "week" | "kind" | "title" | "summary" | "detail">;

export async function insertProposals(items: NewProposal[]): Promise<Proposal[]> {
  if (!items.length) return [];
  const { data, error } = await getAdmin().from("line_proposals").insert(items).select("*");
  if (error) throw new Error(error.message);
  return data as Proposal[];
}

export async function getProposal(id: string): Promise<Proposal | null> {
  const { data, error } = await getAdmin().from("line_proposals").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as Proposal | null;
}

export async function updateProposal(id: string, patch: Partial<Proposal>): Promise<void> {
  const { error } = await getAdmin()
    .from("line_proposals")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// 状態が from のときだけ to に進める（ボタンの二度押しで二重に動かないように）
export async function transition(id: string, from: ProposalStatus[], to: ProposalStatus): Promise<Proposal | null> {
  const { data, error } = await getAdmin()
    .from("line_proposals")
    .update({ status: to, updated_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", from)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Proposal | null;
}
