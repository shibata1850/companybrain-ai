'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import BrainSwitcher from '@/components/BrainSwitcher';
import StreamingStage, {
  type TranscriptMessage,
  type TranscriptSource,
} from '@/components/StreamingStage';
import PhotoCropper from '@/components/PhotoCropper';
import PortalMenu from '@/components/PortalMenu';

type Avatar = {
  id: string;
  name: string;
  description: string | null;
  persona_prompt: string | null;
  cover_url: string | null;
  stage_url: string | null;
  voice: string | null;
  language: string | null;
};

type ChatThread = {
  id: string;
  title: string | null;
  createdAt: number;
  updatedAt: number;
  messages: TranscriptMessage[];
};
type ChatStore = { threads: ChatThread[]; currentId: string | null };

function newThreadId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeThread(): ChatThread {
  const now = Date.now();
  return {
    id: newThreadId(),
    title: null,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
}

function threadTitle(t: ChatThread): string {
  if (t.title) return t.title;
  const firstUser = t.messages.find((m) => m.role === 'user');
  if (firstUser) {
    const trimmed = firstUser.text.trim().replace(/\s+/g, ' ');
    return trimmed.length > 28 ? trimmed.slice(0, 28) + '…' : trimmed;
  }
  return '新しい会話';
}

const LANGUAGES: Array<{ id: string; label: string }> = [
  { id: 'auto', label: '自動検出(多言語)' },
  { id: 'ja-JP', label: '日本語' },
  { id: 'en-US', label: 'English (US)' },
  { id: 'en-GB', label: 'English (UK)' },
  { id: 'zh-CN', label: '中文(简体)' },
  { id: 'zh-TW', label: '中文(繁體)' },
  { id: 'ko-KR', label: '한국어' },
  { id: 'es-US', label: 'Español' },
  { id: 'fr-FR', label: 'Français' },
  { id: 'de-DE', label: 'Deutsch' },
];

const VOICES: Array<{ id: string; hint: string }> = [
  { id: 'Kore', hint: '女性・落ち着いた' },
  { id: 'Aoede', hint: '女性・優しい' },
  { id: 'Leda', hint: '女性・明るい' },
  { id: 'Charon', hint: '男性・深い' },
  { id: 'Orus', hint: '男性・自然' },
  { id: 'Puck', hint: '男性・明るい' },
  { id: 'Fenrir', hint: '男性・力強い' },
  { id: 'Zephyr', hint: '中性的・爽やか' },
];

type TrainingVideo = {
  id: string;
  file_name: string | null;
  mime_type: string | null;
  status: string;
  summary: string | null;
  transcript: string | null;
  folder: string | null;
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

  // Live transcript log. Persisted as a collection of threads so the
  // operator can keep multiple conversations per brain, switch between
  // them, and revisit pinned answers / notes / ratings later.
  const storageKey = `cb-threads-${id}`;
  const legacyStorageKey = `cb-transcript-${id}`;
  const [chatStore, setChatStore] = useState<ChatStore>({
    threads: [],
    currentId: null,
  });
  const [chatLoaded, setChatLoaded] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(true);
  const [partialUser, setPartialUser] = useState<string | null>(null);
  const [partialAgent, setPartialAgent] = useState<string | null>(null);

  const currentThread = useMemo(
    () =>
      chatStore.threads.find((t) => t.id === chatStore.currentId) ?? null,
    [chatStore],
  );
  const transcript = currentThread?.messages ?? [];

  const handleTranscriptMessage = useCallback((m: TranscriptMessage) => {
    setChatStore((prev) => {
      let store = prev;
      // No active thread yet — open one implicitly on the first message.
      if (
        !store.currentId ||
        !store.threads.some((t) => t.id === store.currentId)
      ) {
        const fresh = makeThread();
        store = {
          threads: [...store.threads, fresh],
          currentId: fresh.id,
        };
      }
      return {
        ...store,
        threads: store.threads.map((t) =>
          t.id === store.currentId
            ? { ...t, messages: [...t.messages, m], updatedAt: Date.now() }
            : t,
        ),
      };
    });
  }, []);

  const handlePartial = useCallback(
    (role: 'user' | 'agent', text: string | null) => {
      if (role === 'user') setPartialUser(text);
      else setPartialAgent(text);
    },
    [],
  );

  // Hydrate from storage on mount, migrating the older single-thread
  // format if it's still around.
  useEffect(() => {
    try {
      const raw =
        typeof window !== 'undefined'
          ? window.localStorage.getItem(storageKey)
          : null;
      if (raw) {
        const parsed = JSON.parse(raw) as ChatStore;
        if (parsed && Array.isArray(parsed.threads)) {
          setChatStore({
            threads: parsed.threads.map((t) => ({
              id: t.id || newThreadId(),
              title: t.title ?? null,
              createdAt: t.createdAt ?? Date.now(),
              updatedAt: t.updatedAt ?? Date.now(),
              messages: Array.isArray(t.messages)
                ? t.messages.map((m) => ({
                    ...m,
                    id: m.id || newThreadId(),
                  }))
                : [],
            })),
            currentId:
              parsed.currentId &&
              parsed.threads.some((t) => t.id === parsed.currentId)
                ? parsed.currentId
                : parsed.threads[0]?.id ?? null,
          });
        }
      } else {
        const legacy = window.localStorage.getItem(legacyStorageKey);
        if (legacy) {
          const arr = JSON.parse(legacy) as TranscriptMessage[];
          if (Array.isArray(arr) && arr.length > 0) {
            const migrated = makeThread();
            migrated.title = '以前の会話';
            migrated.messages = arr.map((m) => ({
              ...m,
              id: m.id || newThreadId(),
            }));
            migrated.updatedAt =
              arr[arr.length - 1]?.at ?? Date.now();
            setChatStore({ threads: [migrated], currentId: migrated.id });
          }
          window.localStorage.removeItem(legacyStorageKey);
        }
      }
    } catch {
      // ignore corrupted storage
    }
    setChatLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist whenever the store changes (after initial hydrate).
  useEffect(() => {
    if (!chatLoaded) return;
    try {
      const trimmed: ChatStore = {
        currentId: chatStore.currentId,
        threads: chatStore.threads.map((t) => ({
          ...t,
          messages:
            t.messages.length > 500 ? t.messages.slice(-500) : t.messages,
        })),
      };
      window.localStorage.setItem(storageKey, JSON.stringify(trimmed));
    } catch {
      // quota exceeded or storage disabled — accept the loss
    }
  }, [chatStore, chatLoaded, storageKey]);

  const newThread = useCallback(() => {
    setChatStore((prev) => {
      const fresh = makeThread();
      return {
        threads: [...prev.threads, fresh],
        currentId: fresh.id,
      };
    });
  }, []);

  const switchThread = useCallback((threadId: string) => {
    setChatStore((prev) =>
      prev.threads.some((t) => t.id === threadId)
        ? { ...prev, currentId: threadId }
        : prev,
    );
  }, []);

  const deleteThread = useCallback((threadId: string) => {
    setChatStore((prev) => {
      const remaining = prev.threads.filter((t) => t.id !== threadId);
      const nextCurrent =
        prev.currentId === threadId
          ? remaining[remaining.length - 1]?.id ?? null
          : prev.currentId;
      return { threads: remaining, currentId: nextCurrent };
    });
  }, []);

  const renameThread = useCallback((threadId: string, title: string) => {
    const trimmed = title.trim();
    setChatStore((prev) => ({
      ...prev,
      threads: prev.threads.map((t) =>
        t.id === threadId ? { ...t, title: trimmed || null } : t,
      ),
    }));
  }, []);

  const updateMessage = useCallback(
    (messageId: string, patch: Partial<TranscriptMessage>) => {
      setChatStore((prev) => ({
        ...prev,
        threads: prev.threads.map((t) =>
          t.id !== prev.currentId
            ? t
            : {
                ...t,
                messages: t.messages.map((m) =>
                  m.id === messageId ? { ...m, ...patch } : m,
                ),
              },
        ),
      }));
    },
    [],
  );

  const clearCurrentThread = useCallback(() => {
    setChatStore((prev) => ({
      ...prev,
      threads: prev.threads.map((t) =>
        t.id === prev.currentId
          ? { ...t, messages: [], updatedAt: Date.now(), title: null }
          : t,
      ),
    }));
  }, []);

  function exportTranscript() {
    if (!currentThread || currentThread.messages.length === 0) return;
    const stamp = new Date().toISOString().slice(0, 10);
    const brainName = data?.avatar.name ?? 'Brain';
    const title = threadTitle(currentThread);
    const lines: string[] = [`# ${brainName} との会話`, ''];
    lines.push(`_スレッド: ${title}_`);
    lines.push(`_書き出し日時: ${new Date().toLocaleString('ja-JP')}_`, '');
    let lastDate = '';
    for (const m of currentThread.messages) {
      const d = new Date(m.at);
      const day = d.toLocaleDateString('ja-JP');
      if (day !== lastDate) {
        lines.push('', `## ${day}`, '');
        lastDate = day;
      }
      const who = m.role === 'user' ? 'あなた' : brainName;
      const time = d.toLocaleTimeString('ja-JP');
      const flags: string[] = [];
      if (m.pinned) flags.push('📌');
      if (m.rating === 'up') flags.push('👍');
      if (m.rating === 'down') flags.push('👎');
      const flagStr = flags.length > 0 ? ` ${flags.join(' ')}` : '';
      lines.push(`**${who}** _(${time})_${flagStr}  `);
      lines.push(m.text, '');
      if (m.note) {
        lines.push(`> 📝 メモ: ${m.note}`, '');
      }
      if (m.sources && m.sources.length > 0) {
        lines.push('<details><summary>参照した素材</summary>', '');
        for (const s of m.sources) {
          lines.push(`- **${s.query}**`);
          for (const c of s.chunks) {
            lines.push(`  - ${c.replace(/\n+/g, ' ').slice(0, 200)}`);
          }
        }
        lines.push('', '</details>', '');
      }
    }
    const blob = new Blob([lines.join('\n')], {
      type: 'text/markdown;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${brainName}-${title}-${stamp}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Collapsible streaming stage.
  const [stageMinimized, setStageMinimized] = useState(false);

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
    voice?: string | null;
    language?: string | null;
    persona_prompt?: string | null;
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
            <VoicePicker
              current={avatar.voice}
              onChange={async (v) => {
                await saveMeta({ voice: v });
              }}
              disabled={savingMeta}
            />
            <LanguagePicker
              current={avatar.language}
              onChange={async (l) => {
                await saveMeta({ language: l });
              }}
              disabled={savingMeta}
            />
            <PersonaPromptButton
              current={avatar.persona_prompt}
              onSave={async (next) => {
                await saveMeta({ persona_prompt: next });
              }}
              disabled={savingMeta}
            />
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
            onPartial={handlePartial}
            onEditStage={() => openFilePicker('stage')}
            minimized={stageMinimized}
            onToggleMinimized={() => setStageMinimized((v) => !v)}
          />

          <p className="text-center text-xs text-neutral-500">
            マイクで {avatar.name} に話しかけてください。
          </p>

          <TranscriptPanel
            avatarName={avatar.name}
            threads={chatStore.threads}
            currentThreadId={chatStore.currentId}
            messages={transcript}
            partialUser={partialUser}
            partialAgent={partialAgent}
            open={transcriptOpen}
            onToggle={() => setTranscriptOpen((v) => !v)}
            onNewThread={newThread}
            onSwitchThread={switchThread}
            onRenameThread={renameThread}
            onDeleteThread={deleteThread}
            onClearCurrent={clearCurrentThread}
            onUpdateMessage={updateMessage}
            onExport={exportTranscript}
          />
        </div>

        <div className="md:col-span-1">
          <TrainingPanel
            avatarId={avatar.id}
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
  avatarId,
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
  avatarId: string;
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
  const [mode, setMode] = useState<'video' | 'text'>('text');

  // Compact folder summary derived from the videos list.
  const folders = useMemo(() => {
    const counts = new Map<string, number>();
    for (const v of videos) {
      const k = v.folder?.trim() || '未分類';
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [videos]);

  return (
    <aside className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">学習させる</h2>
          <p className="mt-1 text-[11px] leading-relaxed text-neutral-500">
            {avatarName} の発言や考え方を追加するほど、会話が本人らしくなります。
          </p>
        </div>
      </div>

      <div className="flex rounded-full bg-neutral-100 p-0.5 text-xs">
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

      <div className="border-t border-neutral-100 pt-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-wider text-neutral-400">
            学習素材 ({videos.length})
          </p>
          <Link
            href={`/avatars/${avatarId}/training`}
            className="inline-flex items-center gap-0.5 text-[11px] font-medium text-neutral-700 transition hover:text-neutral-900"
          >
            管理画面を開く
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
              <path
                d="M3 2l4 3-4 3"
                stroke="currentColor"
                strokeWidth="1.5"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
        </div>
        {folders.length === 0 ? (
          <p className="mt-2 text-xs text-neutral-400">
            まだ学習素材がありません。
          </p>
        ) : (
          <ul className="mt-2 space-y-1">
            {folders.slice(0, 6).map(([name, count]) => (
              <li
                key={name}
                className="flex items-center justify-between rounded-md px-2 py-1.5 text-[11px] text-neutral-700 hover:bg-neutral-50"
              >
                <span className="truncate">📁 {name}</span>
                <span className="ml-2 shrink-0 rounded-full bg-neutral-100 px-1.5 text-[10px] text-neutral-500">
                  {count}
                </span>
              </li>
            ))}
            {folders.length > 6 && (
              <li className="px-2 text-[10px] text-neutral-400">
                + あと {folders.length - 6} フォルダ
              </li>
            )}
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
  threads,
  currentThreadId,
  messages,
  partialUser,
  partialAgent,
  open,
  onToggle,
  onNewThread,
  onSwitchThread,
  onRenameThread,
  onDeleteThread,
  onClearCurrent,
  onUpdateMessage,
  onExport,
}: {
  avatarName: string;
  threads: ChatThread[];
  currentThreadId: string | null;
  messages: TranscriptMessage[];
  partialUser?: string | null;
  partialAgent?: string | null;
  open: boolean;
  onToggle: () => void;
  onNewThread: () => void;
  onSwitchThread: (id: string) => void;
  onRenameThread: (id: string, title: string) => void;
  onDeleteThread: (id: string) => void;
  onClearCurrent: () => void;
  onUpdateMessage: (id: string, patch: Partial<TranscriptMessage>) => void;
  onExport?: () => void;
}) {
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const threadButtonRef = useRef<HTMLButtonElement>(null);
  const [threadMenuOpen, setThreadMenuOpen] = useState(false);

  const filteredMessages = useMemo(() => {
    const q = search.trim().toLowerCase();
    let base = messages;
    if (showPinnedOnly) base = base.filter((m) => m.pinned);
    if (!q) return base;
    return base.filter((m) => m.text.toLowerCase().includes(q));
  }, [messages, search, showPinnedOnly]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el && !search && !showPinnedOnly) el.scrollTop = el.scrollHeight;
  }, [messages, partialUser, partialAgent, search, showPinnedOnly]);

  useEffect(() => {
    if (searchOpen) {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }
  }, [searchOpen]);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          (t as HTMLElement).isContentEditable)
      )
        return;
      if (e.key === '/') {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const totalLive = (partialUser ? 1 : 0) + (partialAgent ? 1 : 0);
  const turns = Math.ceil(messages.length / 2);
  const hiddenByFilter =
    (search.trim() || showPinnedOnly) &&
    messages.length > filteredMessages.length
      ? messages.length - filteredMessages.length
      : 0;
  const pinnedCount = messages.filter((m) => m.pinned).length;

  const currentThread = threads.find((t) => t.id === currentThreadId) ?? null;
  const currentLabel = currentThread
    ? threadTitle(currentThread)
    : '新しい会話';

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
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
            会話
            <span className="rounded-full bg-neutral-100 px-1.5 text-[10px] font-medium text-neutral-500">
              {messages.length + totalLive}件
            </span>
            {turns > 0 && (
              <span className="text-[10px] text-neutral-400">
                ・ {turns}往復
              </span>
            )}
          </button>
          <button
            ref={threadButtonRef}
            type="button"
            onClick={() => setThreadMenuOpen((o) => !o)}
            className="inline-flex max-w-[14rem] items-center gap-1 truncate rounded-full border border-neutral-300 bg-white px-2 py-0.5 text-[11px] text-neutral-700 transition hover:border-neutral-900"
            title="スレッドを切り替え"
          >
            <span className="truncate">📂 {currentLabel}</span>
            {threads.length > 1 && (
              <span className="rounded bg-neutral-100 px-1 text-[10px] text-neutral-500">
                {threads.length}
              </span>
            )}
            <svg width="8" height="8" viewBox="0 0 10 10" aria-hidden>
              <path
                d="M2 4l3 3 3-3"
                stroke="currentColor"
                strokeWidth="1.5"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <PortalMenu
            anchorRef={threadButtonRef}
            open={threadMenuOpen}
            onClose={() => setThreadMenuOpen(false)}
            width={288}
          >
            <ThreadList
              threads={threads}
              currentThreadId={currentThreadId}
              onSwitch={(id) => {
                onSwitchThread(id);
                setThreadMenuOpen(false);
              }}
              onRename={onRenameThread}
              onDelete={onDeleteThread}
              onNew={() => {
                onNewThread();
                setThreadMenuOpen(false);
              }}
            />
          </PortalMenu>
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          {pinnedCount > 0 && (
            <button
              type="button"
              onClick={() => setShowPinnedOnly((v) => !v)}
              className={`inline-flex items-center gap-1 transition ${
                showPinnedOnly
                  ? 'text-amber-600'
                  : 'text-neutral-500 hover:text-neutral-900'
              }`}
              title="ピン留めだけ表示"
            >
              📌 {pinnedCount}
            </button>
          )}
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setSearchOpen((v) => !v);
                if (searchOpen) setSearch('');
              }}
              className={`inline-flex items-center gap-1 transition ${
                searchOpen
                  ? 'text-neutral-900'
                  : 'text-neutral-500 hover:text-neutral-900'
              }`}
              title="会話を検索 (/)"
            >
              <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden>
                <circle
                  cx="7"
                  cy="7"
                  r="4.5"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  fill="none"
                />
                <path
                  d="M10.5 10.5L14 14"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  fill="none"
                  strokeLinecap="round"
                />
              </svg>
              検索
            </button>
          )}
          {onExport && messages.length > 0 && (
            <button
              type="button"
              onClick={onExport}
              className="inline-flex items-center gap-1 text-neutral-500 transition hover:text-neutral-900"
              title="Markdown としてダウンロード"
            >
              <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden>
                <path
                  d="M8 2v10m-4-4l4 4 4-4M2 14h12"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              書き出し
            </button>
          )}
          <button
            type="button"
            onClick={onNewThread}
            className="text-neutral-500 transition hover:text-neutral-900"
            title="新しいスレッドを始める"
          >
            ＋新規
          </button>
        </div>
      </div>

      {searchOpen && open && (
        <div className="mt-2 flex items-center gap-2 rounded-full border border-neutral-300 bg-white px-3 py-1.5 anim-fade-in">
          <svg
            width="12"
            height="12"
            viewBox="0 0 16 16"
            aria-hidden
            className="text-neutral-400"
          >
            <circle
              cx="7"
              cy="7"
              r="4.5"
              stroke="currentColor"
              strokeWidth="1.4"
              fill="none"
            />
            <path
              d="M10.5 10.5L14 14"
              stroke="currentColor"
              strokeWidth="1.4"
              fill="none"
              strokeLinecap="round"
            />
          </svg>
          <input
            ref={searchInputRef}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setSearch('');
                setSearchOpen(false);
              }
            }}
            placeholder="会話を検索…(Esc で閉じる)"
            className="flex-1 bg-transparent text-xs outline-none placeholder:text-neutral-400"
          />
          {search && (
            <span className="text-[10px] text-neutral-500">
              {filteredMessages.length} / {messages.length} 件
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setSearchOpen(false);
            }}
            className="text-[11px] text-neutral-400 hover:text-neutral-900"
          >
            閉じる
          </button>
        </div>
      )}

      {open && (
        <div
          ref={scrollerRef}
          className="mt-3 max-h-[28rem] overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-3 anim-fade-in"
        >
          {messages.length === 0 && !partialUser && !partialAgent ? (
            <div className="space-y-3 py-6 text-center">
              <p className="text-xs text-neutral-400">
                セッションを開始して話しかけると、ここに会話が記録されます。
              </p>
              {threads.length > 1 && (
                <p className="text-[10px] text-neutral-400">
                  過去のスレッドは📂から呼び出せます。
                </p>
              )}
            </div>
          ) : (
            <ul className="space-y-2.5">
              {hiddenByFilter > 0 && (
                <li className="rounded-md bg-neutral-50 px-3 py-1.5 text-center text-[10px] text-neutral-500">
                  非表示中: {hiddenByFilter} 件
                </li>
              )}
              {filteredMessages.map((m) => (
                <MessageRow
                  key={m.id}
                  m={m}
                  avatarName={avatarName}
                  search={search}
                  onUpdate={(patch) => onUpdateMessage(m.id, patch)}
                />
              ))}
              {partialUser && (
                <li className="flex justify-end">
                  <div className="max-w-[80%] rounded-2xl rounded-br-md bg-neutral-900 px-3 py-2 text-sm text-white opacity-80">
                    <p className="text-[10px] uppercase tracking-wider opacity-60">
                      あなた(入力中)
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap leading-relaxed">
                      {partialUser}
                      <span className="ml-0.5 inline-block h-3 w-[2px] animate-pulse bg-white" />
                    </p>
                  </div>
                </li>
              )}
              {partialAgent && (
                <li className="flex justify-start">
                  <div className="max-w-[80%] rounded-2xl rounded-bl-md bg-neutral-100 px-3 py-2 text-sm text-neutral-900 opacity-80">
                    <p className="text-[10px] uppercase tracking-wider opacity-60">
                      {avatarName}(話し中)
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap leading-relaxed">
                      {partialAgent}
                      <span className="ml-0.5 inline-block h-3 w-[2px] animate-pulse bg-neutral-900" />
                    </p>
                  </div>
                </li>
              )}
            </ul>
          )}
          {messages.length > 0 && (
            <div className="mt-3 border-t border-neutral-100 pt-2 text-right">
              <button
                type="button"
                onClick={onClearCurrent}
                className="text-[10px] text-neutral-400 hover:text-red-600"
                title="このスレッドの内容を空にする"
              >
                このスレッドを空にする
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function ThreadList({
  threads,
  currentThreadId,
  onSwitch,
  onRename,
  onDelete,
  onNew,
}: {
  threads: ChatThread[];
  currentThreadId: string | null;
  onSwitch: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
}) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...threads].sort((a, b) => b.updatedAt - a.updatedAt),
    [threads],
  );

  return (
    <div>
      <button
        type="button"
        onClick={onNew}
        className="block w-full border-b border-neutral-100 px-3 py-2 text-left text-xs font-medium text-neutral-900 hover:bg-neutral-50"
      >
        ＋ 新しい会話を始める
      </button>
      {sorted.length === 0 && (
        <p className="px-3 py-3 text-[11px] text-neutral-400">
          スレッドはまだありません。
        </p>
      )}
      {sorted.map((t) => {
        const isCurrent = t.id === currentThreadId;
        const isRenaming = renamingId === t.id;
        const isConfirming = confirmDeleteId === t.id;
        return (
          <div
            key={t.id}
            className={`group border-b border-neutral-100 px-3 py-2 text-xs last:border-b-0 ${
              isCurrent ? 'bg-neutral-50' : 'hover:bg-neutral-50'
            }`}
          >
            {isRenaming ? (
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => {
                  onRename(t.id, draft);
                  setRenamingId(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onRename(t.id, draft);
                    setRenamingId(null);
                  } else if (e.key === 'Escape') {
                    setRenamingId(null);
                  }
                }}
                className="w-full rounded border border-neutral-300 px-2 py-1 text-xs focus:border-neutral-900 focus:outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => onSwitch(t.id)}
                className="block w-full text-left"
              >
                <span
                  className={`block truncate ${
                    isCurrent ? 'font-medium text-neutral-900' : 'text-neutral-700'
                  }`}
                >
                  {threadTitle(t)}
                </span>
                <span className="block text-[10px] text-neutral-400">
                  {t.messages.length}件 ・{' '}
                  {new Date(t.updatedAt).toLocaleString('ja-JP', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </button>
            )}
            {!isRenaming && (
              <div className="mt-1 flex items-center gap-2 text-[10px] text-neutral-400 opacity-0 transition group-hover:opacity-100">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDraft(t.title ?? threadTitle(t));
                    setRenamingId(t.id);
                  }}
                  className="hover:text-neutral-900"
                >
                  名前を変更
                </button>
                <span>·</span>
                {isConfirming ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="hover:text-neutral-900"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onDelete(t.id);
                        setConfirmDeleteId(null);
                      }}
                      className="font-medium text-red-600"
                    >
                      削除を実行
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDeleteId(t.id);
                    }}
                    className="hover:text-red-600"
                  >
                    削除
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MessageRow({
  m,
  avatarName,
  search,
  onUpdate,
}: {
  m: TranscriptMessage;
  avatarName: string;
  search: string;
  onUpdate: (patch: Partial<TranscriptMessage>) => void;
}) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState(m.note ?? '');
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const isUser = m.role === 'user';
  const hasSources = !!m.sources && m.sources.length > 0;

  return (
    <li className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`group max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
          isUser
            ? 'rounded-br-md bg-neutral-900 text-white'
            : 'rounded-bl-md bg-neutral-100 text-neutral-900'
        }`}
      >
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[10px] uppercase tracking-wider opacity-60">
            {isUser ? 'あなた' : avatarName}
          </p>
          <span className="text-[10px] opacity-50">
            {new Date(m.at).toLocaleTimeString('ja-JP', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
        <p className="mt-0.5 whitespace-pre-wrap leading-relaxed">
          <Highlight text={m.text} term={search} />
        </p>
        {m.note && (
          <div
            className={`mt-1.5 rounded-md px-2 py-1 text-[11px] ${
              isUser
                ? 'bg-white/10 text-white/80'
                : 'bg-amber-50 text-amber-900'
            }`}
          >
            📝 {m.note}
          </div>
        )}
        {hasSources && sourcesOpen && (
          <div className="mt-2 space-y-1.5 rounded-md bg-white/5 p-2 text-[11px] leading-relaxed">
            {m.sources!.map((s, si) => (
              <div key={si}>
                <p className={isUser ? 'text-white/80' : 'text-neutral-500'}>
                  🔍 {s.query}
                </p>
                <ul className="ml-3 list-disc space-y-0.5">
                  {s.chunks.slice(0, 4).map((c, ci) => (
                    <li
                      key={ci}
                      className={
                        isUser ? 'text-white/70' : 'text-neutral-700'
                      }
                    >
                      {c.length > 180 ? c.slice(0, 180) + '…' : c}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        {noteOpen && (
          <div className="mt-2 space-y-1">
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="このメッセージへのメモ"
              className={`w-full rounded-md border px-2 py-1 text-[11px] focus:outline-none ${
                isUser
                  ? 'border-white/20 bg-white/10 text-white placeholder:text-white/40'
                  : 'border-neutral-300 bg-white text-neutral-900 placeholder:text-neutral-400'
              }`}
              rows={2}
            />
            <div className="flex justify-end gap-1.5 text-[10px]">
              <button
                type="button"
                onClick={() => {
                  setNoteDraft(m.note ?? '');
                  setNoteOpen(false);
                }}
                className="opacity-60 hover:opacity-100"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  onUpdate({ note: noteDraft.trim() || undefined });
                  setNoteOpen(false);
                }}
                className="font-medium"
              >
                保存
              </button>
            </div>
          </div>
        )}
        <div
          className={`mt-1.5 flex items-center gap-2 text-[11px] opacity-0 transition group-hover:opacity-100 ${
            m.pinned || m.rating || m.note ? 'opacity-100' : ''
          }`}
        >
          <button
            type="button"
            onClick={() => onUpdate({ pinned: !m.pinned })}
            className={`transition ${
              m.pinned
                ? 'text-amber-400'
                : isUser
                  ? 'text-white/50 hover:text-white'
                  : 'text-neutral-400 hover:text-neutral-900'
            }`}
            title={m.pinned ? 'ピンを外す' : 'ピン留め'}
          >
            📌
          </button>
          <button
            type="button"
            onClick={() => {
              setNoteDraft(m.note ?? '');
              setNoteOpen((v) => !v);
            }}
            className={`transition ${
              m.note
                ? isUser
                  ? 'text-white'
                  : 'text-amber-700'
                : isUser
                  ? 'text-white/50 hover:text-white'
                  : 'text-neutral-400 hover:text-neutral-900'
            }`}
            title="メモを追加"
          >
            📝
          </button>
          {!isUser && (
            <>
              <button
                type="button"
                onClick={() =>
                  onUpdate({ rating: m.rating === 'up' ? null : 'up' })
                }
                className={`transition ${
                  m.rating === 'up'
                    ? 'text-green-600'
                    : 'text-neutral-400 hover:text-green-600'
                }`}
                title="良い回答"
              >
                👍
              </button>
              <button
                type="button"
                onClick={() =>
                  onUpdate({ rating: m.rating === 'down' ? null : 'down' })
                }
                className={`transition ${
                  m.rating === 'down'
                    ? 'text-red-600'
                    : 'text-neutral-400 hover:text-red-600'
                }`}
                title="改善が必要"
              >
                👎
              </button>
              {hasSources && (
                <button
                  type="button"
                  onClick={() => setSourcesOpen((v) => !v)}
                  className="text-neutral-400 transition hover:text-neutral-900"
                  title="参照した素材を表示"
                >
                  🔍 {m.sources!.reduce((sum, s) => sum + s.chunks.length, 0)}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </li>
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

function Highlight({ text, term }: { text: string; term: string }) {
  const q = term.trim();
  if (!q) return <>{text}</>;
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const parts: React.ReactNode[] = [];
  let i = 0;
  let n = 0;
  while (i < text.length) {
    const idx = lower.indexOf(needle, i);
    if (idx === -1) {
      parts.push(text.slice(i));
      break;
    }
    if (idx > i) parts.push(text.slice(i, idx));
    parts.push(
      <mark
        key={`m-${n++}`}
        className="rounded bg-yellow-200 px-0.5 text-neutral-900"
      >
        {text.slice(idx, idx + needle.length)}
      </mark>,
    );
    i = idx + needle.length;
  }
  return <>{parts}</>;
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

function PersonaPromptButton({
  current,
  onSave,
  disabled,
}: {
  current: string | null;
  onSave: (next: string | null) => void | Promise<void>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(current ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setDraft(current ?? '');
  }, [open, current]);

  async function commit() {
    setSaving(true);
    try {
      const next = draft.trim();
      await onSave(next || null);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition disabled:opacity-40 ${
          current
            ? 'border-amber-300 bg-amber-50 text-amber-800 hover:border-amber-600'
            : 'border-neutral-300 bg-white text-neutral-600 hover:border-neutral-900 hover:text-neutral-900'
        }`}
        title={current ?? '振る舞いの指示(ロール/制約)を設定'}
      >
        🎭 ペルソナ{current ? '(設定済み)' : ''}
      </button>
      {open && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4 anim-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-sm font-semibold text-neutral-900">
              🎭 ペルソナ設定
            </h3>
            <p className="mt-1 text-[11px] leading-relaxed text-neutral-500">
              ブレインがどう振る舞うかをここで指示できます。
              口調・専門領域・避けてほしい話題などを書いておくと、
              次のセッションから反映されます。説明欄
              (description) には影響しません。
            </p>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={
                '例: 一人称は「俺」。新人社員に話しかけるような口調で、専門用語には必ず短い注釈を添えること。社外秘の話題は答えず「上長に確認してください」と返す。'
              }
              rows={10}
              className="mt-3 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
            />
            <div className="mt-3 flex items-center justify-between">
              <p className="text-[10px] text-neutral-400">
                空にすると元のデフォルトに戻ります。
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-700 hover:bg-neutral-200"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={() => void commit()}
                  disabled={saving}
                  className="rounded-full bg-neutral-900 px-3 py-1 text-xs font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50"
                >
                  {saving ? '保存中…' : '保存'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function VoicePicker({
  current,
  onChange,
  disabled,
}: {
  current: string | null;
  onChange: (next: string | null) => void | Promise<void>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const label = current?.trim() || 'デフォルト';

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 rounded-full border border-neutral-300 bg-white px-2 py-0.5 text-[11px] font-medium text-neutral-600 transition hover:border-neutral-900 hover:text-neutral-900 disabled:opacity-40"
        title="クリックで声を変更"
      >
        <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden>
          <path
            d="M6 3a2 2 0 0 1 4 0v6a2 2 0 1 1-4 0V3z"
            fill="currentColor"
          />
          <path
            d="M3 9a5 5 0 0 0 10 0M8 14v1.5"
            stroke="currentColor"
            strokeWidth="1.2"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
        声: {label}
        <svg width="8" height="8" viewBox="0 0 10 10" aria-hidden>
          <path
            d="M2 4l3 3 3-3"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <PortalMenu
        anchorRef={buttonRef}
        open={open}
        onClose={() => setOpen(false)}
        width={232}
      >
        <button
          type="button"
          onClick={() => {
            void onChange(null);
            setOpen(false);
          }}
          className={`block w-full px-3 py-2 text-left text-xs transition hover:bg-neutral-50 ${
            !current ? 'font-medium text-neutral-900' : 'text-neutral-700'
          }`}
        >
          デフォルト(環境設定)
        </button>
        <div className="border-t border-neutral-100">
          {VOICES.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => {
                void onChange(v.id);
                setOpen(false);
              }}
              className={`flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-xs transition hover:bg-neutral-50 ${
                current === v.id
                  ? 'bg-neutral-50 font-medium text-neutral-900'
                  : 'text-neutral-700'
              }`}
            >
              <span>🔊 {v.id}</span>
              <span className="text-[10px] text-neutral-400">{v.hint}</span>
            </button>
          ))}
        </div>
        <div className="border-t border-neutral-100 px-3 py-2 text-[10px] leading-relaxed text-neutral-400">
          変更は次のセッション開始から反映されます。
        </div>
      </PortalMenu>
    </>
  );
}

function LanguagePicker({
  current,
  onChange,
  disabled,
}: {
  current: string | null;
  onChange: (next: string | null) => void | Promise<void>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const currentLabel = (() => {
    if (!current || current === 'auto')
      return LANGUAGES.find((l) => l.id === 'auto')!.label;
    const hit = LANGUAGES.find((l) => l.id === current);
    return hit?.label ?? current;
  })();

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 rounded-full border border-neutral-300 bg-white px-2 py-0.5 text-[11px] font-medium text-neutral-600 transition hover:border-neutral-900 hover:text-neutral-900 disabled:opacity-40"
        title="クリックで言語を変更"
      >
        <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden>
          <circle
            cx="8"
            cy="8"
            r="6"
            stroke="currentColor"
            strokeWidth="1.3"
            fill="none"
          />
          <path
            d="M2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12"
            stroke="currentColor"
            strokeWidth="1.1"
            fill="none"
          />
        </svg>
        言語: {currentLabel}
        <svg width="8" height="8" viewBox="0 0 10 10" aria-hidden>
          <path
            d="M2 4l3 3 3-3"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <PortalMenu
        anchorRef={buttonRef}
        open={open}
        onClose={() => setOpen(false)}
        width={232}
      >
        <div>
          {LANGUAGES.map((l) => {
            const isCurrent =
              (current ?? 'auto') === l.id ||
              (!current && l.id === 'auto');
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => {
                  void onChange(l.id === 'auto' ? null : l.id);
                  setOpen(false);
                }}
                className={`flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-xs transition hover:bg-neutral-50 ${
                  isCurrent
                    ? 'bg-neutral-50 font-medium text-neutral-900'
                    : 'text-neutral-700'
                }`}
              >
                <span>{l.label}</span>
                <span className="text-[10px] text-neutral-400">{l.id}</span>
              </button>
            );
          })}
        </div>
        <div className="border-t border-neutral-100 px-3 py-2 text-[10px] leading-relaxed text-neutral-400">
          言語を指定すると、その言語の認識精度が上がります。
          <br />
          多言語を混ぜて話すときは「自動検出」を選んでください。
          次のセッション開始から反映されます。
        </div>
      </PortalMenu>
    </>
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
