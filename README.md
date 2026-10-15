# mikawaya-line-bot

三河屋の従業員用LINEボット（@925dqnld）。LINEのトークで話しかけるだけでサイト（kamakura-tofu-nextjs）を更新する。

- サイトとは別リポジトリ・別Vercelプロジェクト
- データはサイトと同じSupabaseを読み書きする（サイト側は表示するだけ）
- いまできること：お知らせ（ニュース）の投稿

## しくみ

```
従業員のLINE ──▶ LINE Platform ──▶ /api/line/webhook（このアプリ）
                                         │
                                         ├─▶ Supabase（news / news-images / line_staff_sessions）
                                         └─▶ サイトの /api/revalidate（すぐ反映させる）
```

## 構成

| パス | 役割 |
| --- | --- |
| `app/api/line/webhook/route.ts` | 受け口。署名を確かめてイベントを `lib/bot.ts` に渡す |
| `lib/bot.ts` | 許可された従業員か確認し、メッセージを会話の流れに振り分ける |
| `lib/flows/` | 会話の流れ。1機能 = 1ファイル。`lib/flows/index.ts` に登録する |
| `lib/session.ts` | 会話の途中経過（`line_staff_sessions`、30分で失効） |
| `lib/news.ts` | お知らせの登録・画像アップロード |
| `lib/site.ts` | サイトへの反映依頼 |

## 機能を足すとき

1. `lib/flows/xxx.ts` に `Flow`（`name` / `label` / `trigger` / `start` / `handle`）を作る
2. `lib/flows/index.ts` の `FLOWS` に足す（ヘルプとボタンに自動で載る）

## セットアップ

1. `npm install`
2. `.env.example` を `.env.local` にコピーして値を入れる
3. Supabase に `supabase/migrations/001_line_staff_sessions.sql` を適用（サイト側の 015 を適用済みなら不要）
4. Vercel に新規プロジェクトとしてデプロイし、同じ環境変数を設定
5. LINE Developers（@925dqnld のチャネル）で
   - Webhook URL：`https://<VercelのURL>/api/line/webhook`
   - Webhookの利用：オン
   - 応答メッセージ：オフ（ボットの返信と二重にならないように）
6. サイト側（Vercel）に `REVALIDATE_SECRET` を設定し、こちらの `SITE_REVALIDATE_SECRET` に同じ値を入れる

`LINE_STAFF_USER_IDS` が空でも、話しかけると「このIDを管理者に伝えてください」と自分のIDが返るので、それを登録する。

## サイト側との分担

- 注文が入ったときの従業員への通知（プッシュ送信）はサイト側に残している
- お客さま向け公式アカウント（@033okpoz）の自動返信もサイト側
