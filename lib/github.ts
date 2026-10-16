// サイトのリポジトリ（GitHub）を操作する。改修の依頼・マージ・取り下げ
import { requireEnv } from "@/lib/env";

function repo(): string {
  return process.env.GITHUB_REPO || "ken5moroho4/kamakura-tofu";
}

async function gh(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`https://api.github.com/repos/${repo()}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${requireEnv("GITHUB_TOKEN")}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

async function ensureOk(res: Response, what: string): Promise<void> {
  if (!res.ok) throw new Error(`${what} failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
}

// サイト側の GitHub Actions（line-proposal.yml）を起動して、AIに改修してもらう
export async function requestBuild(p: { id: string; title: string; detail: string }): Promise<void> {
  const res = await gh("/dispatches", {
    method: "POST",
    body: JSON.stringify({
      event_type: "line-proposal",
      client_payload: { id: p.id, title: p.title, detail: p.detail },
    }),
  });
  await ensureOk(res, "repository_dispatch");
}

// PR を main にマージし、同じ変更を dev にも取り込む
export async function mergeToProduction(prNumber: number): Promise<{ devSynced: boolean }> {
  const merge = await gh(`/pulls/${prNumber}/merge`, {
    method: "PUT",
    body: JSON.stringify({ merge_method: "squash" }),
  });
  await ensureOk(merge, "merge PR");

  const sync = await gh("/merges", {
    method: "POST",
    body: JSON.stringify({ base: "dev", head: "main", commit_message: "chore: LINEから反映した改修を dev に取り込む" }),
  });
  // 201: 取り込んだ / 204: 取り込むものが無い / 409: 衝突（手で直す）
  if (sync.status === 409) return { devSynced: false };
  await ensureOk(sync, "merge main into dev");
  return { devSynced: true };
}

export async function closePullRequest(prNumber: number): Promise<void> {
  const res = await gh(`/pulls/${prNumber}`, { method: "PATCH", body: JSON.stringify({ state: "closed" }) });
  await ensureOk(res, "close PR");
}
