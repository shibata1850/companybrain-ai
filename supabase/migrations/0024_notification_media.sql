-- お知らせに画像・動画を1点添付できるようにする。
--
-- media_path: Storage 上のオブジェクトパス(公開URLではなく、閲覧時に
--   署名URLを都度発行する。バケットは非公開のまま)。
-- media_type: 'image' | 'video'(表示の出し分けに使う)。
--
-- 添付は1件のお知らせにつき1ファイル。受信者ごとに notifications 行を
-- 複製しても、実ファイルは1つを共有参照する(同じ media_path)。
alter table notifications
  add column if not exists media_path text;
alter table notifications
  add column if not exists media_type text;
