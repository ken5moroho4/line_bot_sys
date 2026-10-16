// ボットを使ってよい従業員か（LINE_STAFF_USER_IDS に載っている個人のLINEユーザーID。U… だけ）
export function isAllowedStaff(userId: string | undefined): boolean {
  if (!userId) return false;
  const ids = (process.env.LINE_STAFF_USER_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.startsWith("U"));
  return ids.includes(userId);
}
