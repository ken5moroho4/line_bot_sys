// 更新先のサイト（kamakura-tofu-nextjs）
export function siteUrl(): string {
  return (process.env.SITE_URL || "https://www.jfcreate-mikawaya.com").replace(/\/$/, "");
}

// サイトのキャッシュを作り直してもらう。失敗してもサイト側の定期再生成（最大5分）で反映される
export async function revalidateSite(paths: string[]): Promise<void> {
  const secret = process.env.SITE_REVALIDATE_SECRET;
  if (!secret) return;
  try {
    const res = await fetch(`${siteUrl()}/api/revalidate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ paths }),
    });
    if (!res.ok) console.error(`site revalidate failed (${res.status}): ${await res.text()}`);
  } catch (err) {
    console.error("site revalidate error:", err);
  }
}
