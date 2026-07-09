-- 学習素材の「理解」結果を保存する列。
--
-- extracted_rules: 素材の中に含まれる「AIの振る舞い・回答形式への指示」
-- (例: 「数字が入力されたら漢数字で返す」)を取り込み時に抽出したもの。
-- 検索(RAG)でたまたまヒットしたときだけ参照されるのではなく、
-- 会話セッションのシステム指示に毎回注入され、常に適用される。
alter table training_videos
  add column if not exists extracted_rules text;
