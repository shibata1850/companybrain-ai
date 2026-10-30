-- 0032: 音声セッションのサーバー側計測
-- これまで音声の利用秒数は「クライアントが終了時に自己申告する」だけで、
-- 申告を止める・水増しする改造クライアントを防げなかった。
-- トークン発行時にサーバーが開始時刻(started_at)を記録し、終了報告は
-- その行を「実経過時間+猶予」でクランプして ended_at を立てる。
-- 終了報告が来ないままの行は、集計側で min(実経過, 10分) と見なす。
alter table voice_sessions
  add column if not exists started_at timestamptz,
  add column if not exists ended_at timestamptz;

comment on column voice_sessions.started_at is
  'サーバーがトークン発行時に記録した開始時刻(0032)。null は旧方式の行。';
comment on column voice_sessions.ended_at is
  '終了報告を受理した時刻(0032)。null は未終了(集計側で経過見なし)。';
