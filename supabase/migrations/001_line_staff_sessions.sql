-- サイト側の 015_line_staff_sessions.sql と同じ内容（同じSupabaseを使うため、どちらか一方を適用すればよい）
-- 会話の途中経過を1人1行で持つ。flow はどの機能の会話か（いまは news のみ）
CREATE TABLE IF NOT EXISTS line_staff_sessions (
  line_user_id TEXT PRIMARY KEY,
  flow TEXT NOT NULL,
  step TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- サーバー（service role）からのみ読み書きする
ALTER TABLE line_staff_sessions ENABLE ROW LEVEL SECURITY;
