-- ボットからの提案（週次レポート）。LINEのボタンで status が進む
CREATE TABLE IF NOT EXISTS line_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week DATE NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('code', 'content')),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'proposed',
  pr_number INTEGER,
  pr_url TEXT,
  preview_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS line_proposals_week_idx ON line_proposals (week);

-- サーバー（service role）からのみ読み書きする
ALTER TABLE line_proposals ENABLE ROW LEVEL SECURITY;
