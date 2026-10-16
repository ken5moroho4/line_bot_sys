# mikawaya-line-bot

三河屋の従業員用LINEボット（@925dqnld）。LINEのトークで話しかけるだけでサイト（kamakura-tofu-nextjs）を更新する。

- サイトとは別リポジトリ・別Vercelプロジェクト
- データはサイトと同じSupabaseを読み書きする（サイト側は表示するだけ）
- いまできること：お知らせ（ニュース）の投稿、週次レポートと改善提案（PostHog → AI → LINE）、提案の採用でサイトをAIが改修

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

## 週次レポートと改善提案

```
毎週月曜 9:00（Vercel Cron）
  └─ /api/cron/weekly
       ├─ PostHog から直近7日・前週の数字を集計（lib/posthog.ts）
       ├─ Claude が読んで提案を最大3件（lib/report/weekly.ts）→ line_proposals に保存
       └─ 従業員のLINEに「今週の様子」＋提案カード（採用する／見送る）

「採用する」（サイトの改修）
  └─ GitHub の repository_dispatch（line-proposal）
       └─ サイト側 .github/workflows/line-proposal.yml
            ├─ main から枝を切り、Claude Code が修正 → PR（main 向け）
            └─ Vercel のプレビューができたら line-proposal-preview.yml が /api/github/preview を呼ぶ
                 └─ LINEに「プレビューを見る／本番に反映する／やめる」

「本番に反映する」→ PR を main にマージ（本番デプロイ）→ main を dev に取り込む
```

- 手で試す：`curl -H "Authorization: Bearer $CRON_SECRET" "https://<URL>/api/cron/weekly?dry=1"`（LINEには送らず中身だけ返る）
- 改修の提案は「1つのPRで終わる小さく安全なもの」に限り、決済・会員・注文には触れないよう AI に指示している
- 話しかける方向のメッセージは月の配信数を使う（週1回のレポート＋プレビュー通知）
