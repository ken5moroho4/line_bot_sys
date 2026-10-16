// サイトの「お知らせ（news）」テーブルへの書き込み。管理画面の「新規作成」と同じ形で登録する
import { getAdmin } from "@/lib/supabase";
import { revalidateSite } from "@/lib/site";

export const NEWS_STORES = {
  hadano: "秦野店",
  zushi: "逗子店",
  kaname: "金目店",
  yamamori: "山守",
} as const;

export type NewsStore = keyof typeof NEWS_STORES;

export type NewNewsInput = {
  title: string;
  store: NewsStore;
  date: string; // YYYY-MM-DD
  excerpt: string;
  image: string | null;
  content: string;
};

// 日本時間の今日（YYYY-MM-DD）
export function todayJst(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date());
}

// 本文の先頭から、一覧に出す短い説明文を作る
export function buildExcerpt(content: string, max = 80): string {
  const flat = content.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

// サイト側 lib/news-slug.ts と同じ規則（店舗-日付、重複したら -2, -3 …）
export function buildNewsSlug(store: string, date: string, existingSlugs: string[]): string {
  if (!store || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  const base = `${store}-${date.replace(/-/g, "")}`;
  const used = new Set(existingSlugs);
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

export async function createNews(input: NewNewsInput): Promise<{ slug: string }> {
  const supabase = getAdmin();
  const { data } = await supabase.from("news").select("slug");
  const slug = buildNewsSlug(input.store, input.date, (data ?? []).map((row) => row.slug));
  if (!slug) throw new Error("リンクを作れませんでした");

  const { error } = await supabase.from("news").insert({ slug, ...input });
  if (error) throw new Error(error.message);

  await revalidateSite(["/", "/news", `/news/${slug}`]);
  return { slug };
}

// 画像をお知らせ用の保存場所に置き、公開URLを返す
export async function uploadNewsImage(bytes: ArrayBuffer, contentType: string): Promise<string> {
  const ext = contentType.includes("png") ? "png" : "jpg";
  const filename = `${Date.now()}.${ext}`;
  const supabase = getAdmin();
  const { error } = await supabase.storage
    .from("news-images")
    .upload(filename, Buffer.from(bytes), { contentType, upsert: false });
  if (error) throw new Error(error.message);
  return supabase.storage.from("news-images").getPublicUrl(filename).data.publicUrl;
}
