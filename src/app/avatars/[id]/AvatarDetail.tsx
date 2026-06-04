'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import BrainSwitcher from '@/components/BrainSwitcher';
import StreamingStage, {
  type TranscriptMessage,
} from '@/components/StreamingStage';
import PhotoCropper from '@/components/PhotoCropper';

type Avatar = {
  id: string;
  name: string;
  description: string | null;
  cover_url: string | null;
  stage_url: string | null;
};

type TrainingVideo = {
  id: string;
  file_name: string | null;
  mime_type: string | null;
  status: string;
  summary: string | null;
  transcript: string | null;
  created_at: string;
};

type DetailResponse = {
  avatar: Avatar;
  training_videos: TrainingVideo[];
};

export default function AvatarDetail({ id }: { id: string }) {
  const router = useRouter();
  const [data, setData] = useState<DetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Training panel state.
  const [trainFile, setTrainFile] = useState<File | null>(null);
  const [training, setTraining] = useState(false);
  const [trainText, setTrainText] = useState('');
  const [trainTextTitle, setTrainTextTitle] = useState('');
  const [trainingText, setTrainingText] = useState(false);

  // Live transcript log.
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [transcriptOpen, setTranscriptOpen] = useState(true);
  const handleTranscriptMessage = useCallback((m: TranscriptMessage) => {
    setTranscript((prev) => [...prev, m]);
  }, []);

  // Photo cropping flow — supports both the round avatar thumbnail
  // and the landscape streaming-stage backdrop.
  type CropperKind = 'cover' | 'stage';
  const [cropperKind, setCropperKind] = useState<CropperKind>('cover');
  const [cropperSrc, setCropperSrc] = useState<string | null>(null);
  const [cropperBusy, setCropperBusy] = useState(false);
  const coverFileInputRef = useRef<HTMLInputElement>(null);
  const stageFileInputRef = useRef<HTMLInputElement>(null);

  // Inline name / description editing.
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  const [savingMeta, setSavingMeta] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/avatars/${id}`, { cache: 'no-store' });
    const json = (await res.json()) as DetailResponse & { error?: string };
    if (!res.ok) {
      setError(json.error || `HTTP ${res.status}`);
      return;
    }
    setData(json);
  }, [id]);

  useEffect(() => {
    load().catch((e) =>
      setError(e instanceof Error ? e.message : String(e)),
    );
  }, [load]);

  async function moveToTrash() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/avatars/${id}`, { method: 'DELETE' });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      router.push('/');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setDeleting(false);
    }
  }

  async function addTrainingVideo(e: React.FormEvent) {
    e.preventDefault();
    if (!trainFile) return;
    const form = new FormData();
    form.append('video', trainFile);
    setTraining(true);
    setError(null);
    try {
      const res = await fetch(`/api/avatars/${id}/train`, {
        method: 'POST',
        body: form,
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setTrainFile(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTraining(false);
    }
  }

  async function addTrainingText(e: React.FormEvent) {
    e.preventDefault();
    if (!trainText.trim()) return;
    setTrainingText(true);
    setError(null);
    try {
      const res = await fetch(`/api/avatars/${id}/train-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: trainText,
          title: trainTextTitle.trim() || undefined,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setTrainText('');
      setTrainTextTitle('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTrainingText(false);
    }
  }

  function openFilePicker(kind: CropperKind) {
    setCropperKind(kind);
    if (kind === 'cover') coverFileInputRef.current?.click();
    else stageFileInputRef.current?.click();
  }

  function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    setCropperSrc(url);
    e.target.value = '';
  }

  async function saveCroppedPhoto(blob: Blob) {
    setCropperBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append(
        'photo',
        new File([blob], `${cropperKind}.jpg`, { type: 'image/jpeg' }),
      );
      const endpoint =
        cropperKind === 'cover'
          ? `/api/avatars/${id}/photo`
          : `/api/avatars/${id}/stage-photo`;
      const res = await fetch(endpoint, { method: 'POST', body: form });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      if (cropperSrc) URL.revokeObjectURL(cropperSrc);
      setCropperSrc(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCropperBusy(false);
    }
  }

  function cancelCrop() {
    if (cropperSrc) URL.revokeObjectURL(cropperSrc);
    setCropperSrc(null);
  }

  async function saveMeta(updates: {
    name?: string;
    description?: string | null;
  }) {
    setSavingMeta(true);
    setError(null);
    try {
      const res = await fetch(`/api/avatars/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setSavingMeta(false);
    }
  }

  async function commitNameEdit() {
    if (!editingName) return;
    const next = nameDraft.trim();
    if (!next || next === data?.avatar.name) {
      setEditingName(false);
      return;
    }
    const ok = await saveMeta({ name: next });
    if (ok) setEditingName(false);
  }

  async function commitDescEdit() {
    if (!editingDesc) return;
    const next = descDraft.trim();
    if (next === (data?.avatar.description ?? '')) {
      setEditingDesc(false);
      return;
    }
    const ok = await saveMeta({ description: next || null });
    if (ok) setEditingDesc(false);
  }

  if (error && !data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 anim-fade-in">
        エラー: {error}
      </div>
    );
  }
  if (!data) {
    return <DetailSkeleton />;
  }
  const { avatar, training_videos } = data;

  return (
    <div className="space-y-6">
      {/* Top nav row */}
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            <path
              d="M7.5 2.5L4 6l3.5 3.5"
              stroke="currentColor"
              strokeWidth="1.5"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          一覧へ
        </Link>
        <div className="flex items-center gap-2">
          <BrainSwitcher currentId={avatar.id} currentName={avatar.name} />
          <AvatarMenu onDelete={moveToTrash} deleting={deleting} />
        </div>
      </div>

      {/* Avatar identity card */}
      <header className="flex items-center gap-4 rounded-2xl border border-neutral-200 bg-gradient-to-br from-white to-neutral-50 p-4 shadow-sm">
        <div className="relative shrink-0">
          <div className="h-16 w-16 overflow-hidden rounded-full bg-neutral-100 ring-2 ring-white shadow">
            {avatar.cover_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatar.cover_url}
                alt={avatar.name}
                className="h-full w-full object-cover"
              />
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => openFilePicker('cover')}
            aria-label="アバター写真を変更"
            className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full bg-neutral-900 text-white shadow-md transition hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:ring-offset-2"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden>
              <path
                d="M11 1.5l3.5 3.5L5 14.5H1.5V11L11 1.5z"
                stroke="currentColor"
                strokeWidth="1.5"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
        <div className="min-w-0 flex-1">
          {editingName ? (
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitNameEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void commitNameEdit();
                } else if (e.key === 'Escape') {
                  setEditingName(false);
                }
              }}
              disabled={savingMeta}
              className="w-full rounded-md border border-neutral-300 bg-white px-2 py-1 text-xl font-semibold tracking-tight focus:border-neutral-900 focus:outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setNameDraft(avatar.name);
                setEditingName(true);
              }}
              className="block max-w-full truncate rounded-md text-left text-xl font-semibold tracking-tight transition hover:bg-neutral-100"
              title="クリックで編集"
            >
              {avatar.name}
            </button>
          )}

          {editingDesc ? (
            <input
              autoFocus
              value={descDraft}
              onChange={(e) => setDescDraft(e.target.value)}
              onBlur={commitDescEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void commitDescEdit();
                } else if (e.key === 'Escape') {
                  setEditingDesc(false);
                }
              }}
              disabled={savingMeta}
              placeholder="説明(任意)"
              className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm focus:border-neutral-900 focus:outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setDescDraft(avatar.description ?? '');
                setEditingDesc(true);
              }}
              className="mt-0.5 block max-w-full truncate rounded-md text-left text-sm text-neutral-500 transition hover:bg-neutral-100"
              title="クリックで編集"
            >
              {avatar.description || '+ 説明を追加'}
            </button>
          )}

          <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-neutral-500">
            <button
              type="button"
              onClick={() => openFilePicker('cover')}
              className="inline-flex items-center gap-1 transition hover:text-neutral-900"
            >
              <PencilGlyph />
              アバター写真
            </button>
            <button
              type="button"
              onClick={() => openFilePicker('stage')}
              className="inline-flex items-center gap-1 transition hover:text-neutral-900"
            >
              <PencilGlyph />
              ステージ背景
            </button>
          </div>
        </div>
        <input
          ref={coverFileInputRef}
          type="file"
          accept="image/*"
          onChange={onFilePicked}
          className="hidden"
        />
        <input
          ref={stageFileInputRef}
          type="file"
          accept="image/*"
          onChange={onFilePicked}
          className="hidden"
        />
      </header>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 anim-fade-in">
          {error}
        </div>
      )}

      {/* Main two-column area: stage on the left, training panel on the right. */}
      <div className="grid gap-6 md:grid-cols-3">
        <div className="space-y-5 md:col-span-2">
          <StreamingStage
            avatarId={avatar.id}
            coverUrl={avatar.cover_url}
            stageUrl={avatar.stage_url}
            avatarName={avatar.name}
            onMessage={handleTranscriptMessage}
            onEditStage={() => openFilePicker('stage')}
          />

          <p className="text-center text-xs text-neutral-500">
            マイクで {avatar.name} に話しかけてください。
          </p>

          <TranscriptPanel
            avatarName={avatar.name}
            messages={transcript}
            open={transcriptOpen}
            onToggle={() => setTranscriptOpen((v) => !v)}
            onClear={() => setTranscript([])}
          />
        </div>

        <div className="md:col-span-1">
          <TrainingPanel
            avatarName={avatar.name}
            videos={training_videos}
            trainFile={trainFile}
            onPickFile={setTrainFile}
            onSubmitVideo={addTrainingVideo}
            submittingVideo={training}
            trainText={trainText}
            onChangeText={setTrainText}
            trainTextTitle={trainTextTitle}
            onChangeTextTitle={setTrainTextTitle}
            onSubmitText={addTrainingText}
            submittingText={trainingText}
          />
        </div>
      </div>

      <PhotoCropper
        src={cropperSrc ?? ''}
        open={!!cropperSrc}
        busy={cropperBusy}
        onConfirm={saveCroppedPhoto}
        onCancel={cancelCrop}
        aspect={cropperKind === 'stage' ? 16 / 9 : 1}
        cropShape={cropperKind === 'stage' ? 'rect' : 'round'}
        outputWidth={cropperKind === 'stage' ? 1280 : 512}
        outputHeight={cropperKind === 'stage' ? 720 : 512}
        title={
          cropperKind === 'stage'
            ? 'ステージ背景をトリミング'
            : 'アバター写真をトリミング'
        }
        hint={
          cropperKind === 'stage'
            ? '16:9 の横長範囲を切り出します。'
            : '丸く切り抜かれた範囲がアバター写真になります。'
        }
      />
    </div>
  );
}

/* ===========================================================
 * Right column: training material panel
 * =========================================================== */

function TrainingPanel({
  avatarName,
  videos,
  trainFile,
  onPickFile,
  onSubmitVideo,
  submittingVideo,
  trainText,
  onChangeText,
  trainTextTitle,
  onChangeTextTitle,
  onSubmitText,
  submittingText,
}: {
  avatarName: string;
  videos: TrainingVideo[];
  trainFile: File | null;
  onPickFile: (f: File | null) => void;
  onSubmitVideo: (e: React.FormEvent) => void;
  submittingVideo: boolean;
  trainText: string;
  onChangeText: (v: string) => void;
  trainTextTitle: string;
  onChangeTextTitle: (v: string) => void;
  onSubmitText: (e: React.FormEvent) => void;
  submittingText: boolean;
}) {
  const [mode, setMode] = useState<'video' | 'text'>('video');
  return (
    <aside className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-5">
      <div>
        <h2 className="text-sm font-semibold text-neutral-900">学習させる</h2>
        <p className="mt-1 text-[11px] leading-relaxed text-neutral-500">
          {avatarName} の発言や考え方を追加するほど、会話が本人らしくなります。
        </p>
      </div>

      <div className="flex rounded-full bg-neutral-100 p-0.5 text-xs">
        <button
          type="button"
          onClick={() => setMode('video')}
          className={`flex-1 rounded-full px-3 py-1 transition ${
            mode === 'video'
              ? 'bg-white text-neutral-900 shadow-sm'
              : 'text-neutral-500 hover:text-neutral-900'
          }`}
        >
          動画
        </button>
        <button
          type="button"
          onClick={() => setMode('text')}
          className={`flex-1 rounded-full px-3 py-1 transition ${
            mode === 'text'
              ? 'bg-white text-neutral-900 shadow-sm'
              : 'text-neutral-500 hover:text-neutral-900'
          }`}
        >
          テキスト
        </button>
      </div>

      {mode === 'video' ? (
        <form onSubmit={onSubmitVideo} className="space-y-3">
          <input
            type="file"
            accept="video/*"
            onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs file:mr-3 file:rounded-md file:border-0 file:bg-neutral-900 file:px-3 file:py-1 file:text-white"
          />
          <button
            type="submit"
            disabled={!trainFile || submittingVideo}
            className="w-full rounded-full bg-neutral-900 px-4 py-2 text-xs font-medium text-white transition hover:bg-neutral-700 active:scale-[0.99] disabled:opacity-40"
          >
            {submittingVideo ? '学習中…' : '動画から学習'}
          </button>
        </form>
      ) : (
        <form onSubmit={onSubmitText} className="space-y-3">
          <input
            type="text"
            value={trainTextTitle}
            onChange={(e) => onChangeTextTitle(e.target.value)}
            placeholder="タイトル(任意)"
            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs focus:border-neutral-900 focus:outline-none"
          />
          <textarea
            value={trainText}
            onChange={(e) => onChangeText(e.target.value)}
            rows={5}
            placeholder={`${avatarName} の考え方や知識を貼り付け…`}
            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs leading-relaxed focus:border-neutral-900 focus:outline-none"
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-neutral-400">
              {trainText.length.toLocaleString()} 文字
            </span>
            <button
              type="submit"
              disabled={!trainText.trim() || submittingText}
              className="rounded-full bg-neutral-900 px-4 py-2 text-xs font-medium text-white transition hover:bg-neutral-700 active:scale-[0.99] disabled:opacity-40"
            >
              {submittingText ? '学習中…' : 'テキストから学習'}
            </button>
          </div>
        </form>
      )}

      <div>
        <p className="text-[10px] uppercase tracking-wider text-neutral-400">
          学習素材 ({videos.length})
        </p>
        {videos.length === 0 ? (
          <p className="mt-2 text-xs text-neutral-400">
            まだ学習素材がありません。
          </p>
        ) : (
          <ul className="mt-2 max-h-96 space-y-2 overflow-y-auto pr-1">
            {videos.map((v) => (
              <TrainingMaterialCard key={v.id} material={v} />
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function TrainingMaterialCard({ material }: { material: TrainingVideo }) {
  const router = useRouter();
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState(material.file_name ?? '');
  const [transcript, setTranscript] = useState(material.transcript ?? '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isText = material.mime_type?.startsWith('text/');

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/training-videos/${material.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_name: title, transcript }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setMode('view');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/training-videos/${material.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      await new Promise((r) => setTimeout(r, 180));
      setRemoved(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setDeleting(false);
    }
  }

  if (removed) return null;

  if (mode === 'edit') {
    return (
      <li className="rounded-xl border border-neutral-300 bg-white p-3 anim-fade-in">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="タイトル"
          className="w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs focus:border-neutral-900 focus:outline-none"
        />
        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          rows={6}
          placeholder="本文・文字起こし"
          className="mt-2 w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs leading-relaxed focus:border-neutral-900 focus:outline-none"
        />
        {error && <p className="mt-2 text-[11px] text-red-600">{error}</p>}
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setMode('view')}
            disabled={saving}
            className="rounded-full border border-neutral-300 px-3 py-1.5 text-[11px] text-neutral-700 hover:border-neutral-900"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-full bg-neutral-900 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </li>
    );
  }

  return (
    <li
      className={`rounded-xl border border-neutral-200 bg-white p-3 transition ${
        deleting ? 'anim-fade-out' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium ring-1 ${
              isText
                ? 'bg-amber-50 text-amber-700 ring-amber-200'
                : 'bg-sky-50 text-sky-700 ring-sky-200'
            }`}
          >
            {isText ? 'テキスト' : '動画'}
          </span>
          <span className="truncate text-xs text-neutral-800">
            {material.file_name ?? material.id}
          </span>
        </div>
        <MaterialMenu
          onEdit={() => {
            setMode('edit');
            setExpanded(true);
          }}
          onDelete={() => setConfirmDelete(true)}
        />
      </div>

      {material.summary && !expanded && (
        <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-neutral-500">
          {material.summary}
        </p>
      )}

      {material.transcript && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 text-[10px] text-neutral-500 hover:text-neutral-900"
        >
          {expanded ? '閉じる' : '本文を見る'}
        </button>
      )}

      {expanded && material.transcript && (
        <p className="mt-1.5 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg border border-neutral-200 bg-neutral-50 p-2 text-[11px] leading-relaxed text-neutral-700 anim-fade-in">
          {material.transcript}
        </p>
      )}

      {confirmDelete && (
        <div className="mt-2 flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 p-2 text-[11px] text-red-800 anim-fade-in">
          <span>削除します。元に戻せません。</span>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              disabled={deleting}
              className="rounded-full bg-white px-2.5 py-1 text-[10px] text-neutral-700"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={doDelete}
              disabled={deleting}
              className="rounded-full bg-red-600 px-2.5 py-1 text-[10px] font-medium text-white hover:bg-red-500 disabled:opacity-50"
            >
              {deleting ? '削除中…' : '削除する'}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function MaterialMenu({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-label="素材の操作メニュー"
        onClick={() => setOpen((o) => !o)}
        className="grid h-6 w-6 place-items-center rounded-full text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900"
      >
        <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden>
          <circle cx="3" cy="7" r="1.2" fill="currentColor" />
          <circle cx="7" cy="7" r="1.2" fill="currentColor" />
          <circle cx="11" cy="7" r="1.2" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1.5 w-32 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg anim-fade-in">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
            className="block w-full px-3 py-2 text-left text-[11px] text-neutral-700 transition hover:bg-neutral-50"
          >
            編集
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            className="block w-full px-3 py-2 text-left text-[11px] text-red-700 transition hover:bg-red-50"
          >
            削除
          </button>
        </div>
      )}
    </div>
  );
}

/* ===========================================================
 * Live transcript collapsible panel
 * =========================================================== */

function TranscriptPanel({
  avatarName,
  messages,
  open,
  onToggle,
  onClear,
}: {
  avatarName: string;
  messages: TranscriptMessage[];
  open: boolean;
  onToggle: () => void;
  onClear: () => void;
}) {
  return (
    <section>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onToggle}
          className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900"
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            className={`transition ${open ? 'rotate-90' : ''}`}
            aria-hidden
          >
            <path
              d="M3 2l4 3-4 3"
              stroke="currentColor"
              strokeWidth="1.5"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          会話の文字起こし
          <span className="rounded-full bg-neutral-100 px-1.5 text-[10px] font-medium text-neutral-500">
            {messages.length}
          </span>
        </button>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="text-[11px] text-neutral-400 transition hover:text-neutral-700"
          >
            消去
          </button>
        )}
      </div>

      {open && (
        <div className="mt-3 max-h-96 overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-3 anim-fade-in">
          {messages.length === 0 ? (
            <p className="py-4 text-center text-xs text-neutral-400">
              セッションを開始して話しかけると、ここに会話が記録されます。
            </p>
          ) : (
            <ul className="space-y-2.5">
              {messages.map((m, i) => (
                <li
                  key={`${m.at}-${i}`}
                  className={`flex ${
                    m.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                      m.role === 'user'
                        ? 'rounded-br-md bg-neutral-900 text-white'
                        : 'rounded-bl-md bg-neutral-100 text-neutral-900'
                    }`}
                  >
                    <p className="text-[10px] uppercase tracking-wider opacity-60">
                      {m.role === 'user' ? 'あなた' : avatarName}
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap leading-relaxed">
                      {m.text}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

/* ===========================================================
 * Top-right kebab menu (move to trash etc.)
 * =========================================================== */

function AvatarMenu({
  onDelete,
  deleting,
}: {
  onDelete: () => void;
  deleting: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="このブレインの操作メニュー"
        onClick={() => setOpen((o) => !o)}
        className="grid h-8 w-8 place-items-center rounded-full border border-neutral-300 bg-white text-neutral-600 transition hover:border-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
          <circle cx="3" cy="7" r="1.2" fill="currentColor" />
          <circle cx="7" cy="7" r="1.2" fill="currentColor" />
          <circle cx="11" cy="7" r="1.2" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-1.5 w-48 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg anim-fade-in">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            disabled={deleting}
            className="block w-full px-3 py-2 text-left text-xs text-red-700 transition hover:bg-red-50 disabled:opacity-50"
          >
            {deleting ? 'ゴミ箱に移動中…' : 'ゴミ箱に移動'}
          </button>
        </div>
      )}
    </div>
  );
}

function PencilGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" aria-hidden>
      <path
        d="M11 1.5l3.5 3.5L5 14.5H1.5V11L11 1.5z"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6 anim-fade-in">
      <div className="flex items-center justify-between">
        <div className="h-4 w-16 rounded anim-shimmer" />
        <div className="h-7 w-40 rounded-full anim-shimmer" />
      </div>
      <div className="flex items-center gap-3 rounded-2xl border border-neutral-200 p-4">
        <div className="h-14 w-14 rounded-full anim-shimmer" />
        <div className="h-4 w-32 rounded anim-shimmer" />
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        <div className="space-y-3 md:col-span-2">
          <div className="aspect-video w-full rounded-3xl anim-shimmer" />
        </div>
        <div className="h-80 rounded-2xl anim-shimmer" />
      </div>
    </div>
  );
}
