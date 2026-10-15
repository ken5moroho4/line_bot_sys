// 必須の環境変数を取り出す。無ければ起動後すぐ気づけるようにエラーにする
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}
