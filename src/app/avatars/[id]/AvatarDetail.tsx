'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import BrainSwitcher from '@/components/BrainSwitcher';
import StreamingStage, {
  type TranscriptMessage,
  type TranscriptSource,
} from '@/components/StreamingStage';
import { detectEscalation, escalationLabel, type EscalationCategory } from '@/lib/escalation';
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
  const [trainFolder, setTrainFolder] = useState<string | null>(null);
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

  // When a user message gets escalation-flagged, the matching agent
  // reply that follows inherits the same flag — the warning belongs on
  // both sides of the high-stakes exchange.
  const pendingEscalationRef = useRef<TranscriptMessage['escalation'] | null>(null);

  // Audit-log plumbing. Each finalised message is mirrored to the
  // server so the org keeps a durable trail beyond browser storage.
  // sessionId groups one visit; actor is a weak browser id until real
  // auth exists. avatarNameRef lets the []-deps callback read the
  // current name without being recreated.
  const sessionIdRef = useRef<string>(newThreadId());
  const avatarNameRef = useRef<string>('');
  const actorRef = useRef<string>('');
  useEffect(() => {
    try {
      let a = window.localStorage.getItem('cb-actor-id');
      if (!a) {
        a = newThreadId();
        window.localStorage.setItem('cb-actor-id', a);
      }
      actorRef.current = a;
    } catch {
      // storage disabled — actor stays empty
    }
  }, []);

  const logAudit = useCallback(
    (m: TranscriptMessage) => {
      const payload = {
        avatar_id: id,
        avatar_name: avatarNameRef.current || null,
        session_id: sessionIdRef.current,
        actor: actorRef.current || null,
        role: m.role,
        content: m.text,
        sources: m.sources ?? null,
        escalation: m.escalation ?? null,
      };
      // Fire-and-forget; never block the chat on the audit write.
      void fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {});
    },
    [id],
  );

  const handleTranscriptMessage = useCallback((m: TranscriptMessage) => {
    let enriched: TranscriptMessage = m;
    if (m.role === 'user') {
      const flag = detectEscalation(m.text);
      if (flag) {
        enriched = { ...m, escalation: flag };
        pendingEscalationRef.current = flag;
      }
    } else if (m.role === 'agent' && pendingEscalationRef.current) {
      enriched = { ...m, escalation: pendingEscalationRef.current };
      pendingEscalationRef.current = null;
    }
    logAudit(enriched);
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
            ? { ...t, messages: [...t.messages, enriched], updatedAt: Date.now() }
            : t,
        ),
      };
    });
  }, [logAudit]);

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
      if (m.escalation) flags.push('⚠️');
      const flagStr = flags.length > 0 ? ` ${flags.join(' ')}` : '';
      lines.push(`**${who}** _(${time})_${flagStr}  `);
      lines.push(m.text, '');
      if (m.escalation) {
        const cats = m.escalation.categories
          .map((c) => escalationLabel(c as EscalationCategory))
          .join(' / ');
        lines.push(
          `> ⚠️ **上長確認推奨** (${cats})`,
          m.escalation.hints.length > 0
            ? `> 検出語: ${m.escalation.hints.join('、')}`
            : '',
          '',
        );
      }
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
    if (trainFolder) form.append('folder', trainFolder);
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
          folder: trainFolder,
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
  // Keep the audit logger's name copy current (read by a []-deps cb).
  avatarNameRef.current = avatar.name;

  return (
    <div className="space-y-6">
      {/* Top nav row */}
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/dashboard"
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
            trainFolder={trainFolder}
            onChangeFolder={setTrainFolder}
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
  trainFolder,
  onChangeFolder,
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
  trainFolder: string | null;
  onChangeFolder: (folder: string | null) => void;
}) {
  const [mode, setMode] = useState<'video' | 'text'>('text');

  // Compact folder summary derived from the videos list. Skips the
  // synthetic 未分類 bucket so the picker only suggests folders the
  // operator has actually named.
  const folders = useMemo(() => {
    const counts = new Map<string, number>();
    for (const v of videos) {
      const k = v.folder?.trim() || '未分類';
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [videos]);

  const folderOptions = useMemo(
    () => folders.filter(([name]) => name !== '未分類').map(([name]) => name),
    [folders],
  );

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

      <FolderPickerInline
        current={trainFolder}
        options={folderOptions}
        onChange={onChangeFolder}
      />

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

/**
 * Compact folder selector for the training panel. Existing folder names
 * appear as one-click chips; "+ 新規" opens an inline text input so the
 * operator can create a new bucket without leaving the panel.
 */
function FolderPickerInline({
  current,
  options,
  onChange,
}: {
  current: string | null;
  options: string[];
  onChange: (next: string | null) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (creating) inputRef.current?.focus();
  }, [creating]);

  function commit() {
    const next = draft.trim();
    if (next) onChange(next);
    setDraft('');
    setCreating(false);
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-500">
          分類フォルダ
        </span>
        {current && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-[10px] text-neutral-400 hover:text-neutral-900"
          >
            未分類に戻す
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(null)}
          className={`rounded-full border px-2 py-0.5 text-[11px] transition ${
            current === null
              ? 'border-neutral-900 bg-neutral-900 text-white'
              : 'border-neutral-300 bg-white text-neutral-600 hover:border-neutral-900'
          }`}
        >
          📁 未分類
        </button>
        {options.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => onChange(name)}
            className={`max-w-[10rem] truncate rounded-full border px-2 py-0.5 text-[11px] transition ${
              current === name
                ? 'border-neutral-900 bg-neutral-900 text-white'
                : 'border-neutral-300 bg-white text-neutral-600 hover:border-neutral-900'
            }`}
            title={name}
          >
            📂 {name}
          </button>
        ))}
        {creating ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-neutral-900 bg-white px-1 py-0.5">
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commit();
                } else if (e.key === 'Escape') {
                  setDraft('');
                  setCreating(false);
                }
              }}
              onBlur={commit}
              placeholder="フォルダ名"
              className="w-24 bg-transparent text-[11px] outline-none"
            />
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="rounded-full border border-dashed border-neutral-300 px-2 py-0.5 text-[11px] text-neutral-500 transition hover:border-neutral-900 hover:text-neutral-900"
          >
            ＋ 新規
          </button>
        )}
      </div>
      {current && (
        <p className="text-[10px] text-neutral-400">
          このあと学習させる素材は
          <span className="font-medium text-neutral-700">「{current}」</span>
          に保存されます。
        </p>
      )}
    </div>
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
  const escalationCount = messages.filter((m) => m.escalation).length;

  const sortedThreads = useMemo(
    () => [...threads].sort((a, b) => b.updatedAt - a.updatedAt),
    [threads],
  );

  return (
    <section>
      {/* Header: collapse toggle on the left, view tools on the right. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
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
            <span className="text-[10px] text-neutral-400">・ {turns}往復</span>
          )}
        </button>
        <div className="flex items-center gap-1">
          {escalationCount > 0 && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-[11px] font-medium text-amber-800"
              title="上長確認推奨と判定された質問・回答の件数"
            >
              ⚠️ {escalationCount}
            </span>
          )}
          {pinnedCount > 0 && (
            <button
              type="button"
              onClick={() => setShowPinnedOnly((v) => !v)}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] transition ${
                showPinnedOnly
                  ? 'bg-amber-100 text-amber-800'
                  : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900'
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
              className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] transition ${
                searchOpen
                  ? 'bg-neutral-200 text-neutral-900'
                  : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900'
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
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900"
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
        </div>
      </div>

      {open && (
        <div className="mt-3 overflow-hidden rounded-2xl border border-neutral-200 bg-white anim-fade-in">
          {searchOpen && (
            <div className="flex items-center gap-2 border-b border-neutral-100 px-4 py-2">
              <svg
                width="12"
                height="12"
                viewBox="0 0 16 16"
                aria-hidden
                className="shrink-0 text-neutral-400"
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
                <span className="shrink-0 text-[10px] text-neutral-500">
                  {filteredMessages.length} / {messages.length} 件
                </span>
              )}
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setSearchOpen(false);
                }}
                className="shrink-0 text-[11px] text-neutral-400 hover:text-neutral-900"
              >
                閉じる
              </button>
            </div>
          )}

          <div className="flex h-[30rem]">
            {/* Thread sidebar — always visible on sm+ so switching
                conversations is one click, not buried in a menu. */}
            <aside className="hidden w-56 shrink-0 flex-col border-r border-neutral-100 bg-neutral-50/70 sm:flex">
              <div className="p-2">
                <button
                  type="button"
                  onClick={onNewThread}
                  className="w-full rounded-lg bg-neutral-900 py-1.5 text-xs font-medium text-white transition hover:bg-neutral-700"
                >
                  ＋ 新しい会話
                </button>
              </div>
              <div className="flex-1 space-y-1 overflow-y-auto px-2 pb-2">
                {sortedThreads.length === 0 && (
                  <p className="px-2 py-3 text-center text-[10px] text-neutral-400">
                    まだ会話がありません
                  </p>
                )}
                {sortedThreads.map((t) => (
                  <ThreadRow
                    key={t.id}
                    thread={t}
                    current={t.id === currentThreadId}
                    onSwitch={() => onSwitchThread(t.id)}
                    onRename={(title) => onRenameThread(t.id, title)}
                    onDelete={() => onDeleteThread(t.id)}
                  />
                ))}
              </div>
            </aside>

            <div className="flex min-w-0 flex-1 flex-col">
              {/* Mobile fallback: a plain select for switching threads. */}
              <div className="flex items-center gap-2 border-b border-neutral-100 px-3 py-2 sm:hidden">
                <select
                  value={currentThreadId ?? ''}
                  onChange={(e) => {
                    if (e.target.value === '__new__') onNewThread();
                    else if (e.target.value) onSwitchThread(e.target.value);
                  }}
                  className="w-full rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-xs"
                >
                  {sortedThreads.map((t) => (
                    <option key={t.id} value={t.id}>
                      {threadTitle(t)}（{t.messages.length}件）
                    </option>
                  ))}
                  <option value="__new__">＋ 新しい会話</option>
                </select>
              </div>

              <div ref={scrollerRef} className="flex-1 overflow-y-auto p-4">
                {messages.length === 0 && !partialUser && !partialAgent ? (
                  <div className="flex h-full items-center justify-center">
                    <p className="text-center text-xs leading-relaxed text-neutral-400">
                      セッションを開始して話しかけると、
                      <br />
                      ここに会話が記録されます。
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-4">
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
                        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-neutral-900 px-3.5 py-2.5 text-sm text-white opacity-80">
                          <p className="text-[10px] uppercase tracking-wider opacity-60">
                            あなた(入力中)
                          </p>
                          <p className="mt-1 whitespace-pre-wrap leading-relaxed">
                            {partialUser}
                            <span className="ml-0.5 inline-block h-3 w-[2px] animate-pulse bg-white" />
                          </p>
                        </div>
                      </li>
                    )}
                    {partialAgent && (
                      <li className="flex justify-start">
                        <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-neutral-100 px-3.5 py-2.5 text-sm text-neutral-900 opacity-80">
                          <p className="text-[10px] uppercase tracking-wider opacity-60">
                            {avatarName}(話し中)
                          </p>
                          <p className="mt-1 whitespace-pre-wrap leading-relaxed">
                            {partialAgent}
                            <span className="ml-0.5 inline-block h-3 w-[2px] animate-pulse bg-neutral-900" />
                          </p>
                        </div>
                      </li>
                    )}
                  </ul>
                )}
              </div>

              {messages.length > 0 && (
                <div className="flex items-center justify-end border-t border-neutral-100 px-3 py-1.5">
                  <button
                    type="button"
                    onClick={onClearCurrent}
                    className="text-[10px] text-neutral-400 transition hover:text-red-600"
                    title="この会話の内容を空にする(スレッドは残る)"
                  >
                    この会話を空にする
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function ThreadRow({
  thread,
  current,
  onSwitch,
  onRename,
  onDelete,
}: {
  thread: ChatThread;
  current: boolean;
  onSwitch: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState('');
  const [confirming, setConfirming] = useState(false);

  if (renaming) {
    return (
      <div className="rounded-lg bg-white p-2 shadow-sm ring-1 ring-neutral-300">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            onRename(draft);
            setRenaming(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onRename(draft);
              setRenaming(false);
            } else if (e.key === 'Escape') {
              setRenaming(false);
            }
          }}
          className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm focus:border-neutral-900 focus:outline-none"
          placeholder="会話の名前"
        />
        <p className="mt-1 text-[10px] text-neutral-400">
          Enter で確定 / Esc で取消
        </p>
      </div>
    );
  }

  return (
    <div
      className={`relative rounded-lg transition ${
        current
          ? 'bg-white shadow-sm ring-1 ring-neutral-200'
          : 'hover:bg-white/70'
      }`}
    >
      <button
        type="button"
        onClick={onSwitch}
        className="block w-full px-2 py-2 text-left"
      >
        <span
          className={`block truncate text-xs ${
            current ? 'font-medium text-neutral-900' : 'text-neutral-600'
          }`}
        >
          {threadTitle(thread)}
        </span>
        <span className="mt-0.5 block text-[10px] text-neutral-400">
          {thread.messages.length}件 ・{' '}
          {new Date(thread.updatedAt).toLocaleDateString('ja-JP', {
            month: 'numeric',
            day: 'numeric',
          })}
        </span>
      </button>
      {confirming ? (
        <div className="mt-1 flex items-center justify-between gap-2 rounded-md border border-red-200 bg-red-50 px-2 py-1.5">
          <span className="text-[11px] text-red-800">削除しますか?</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-full bg-white px-2 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-100"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => {
                onDelete();
                setConfirming(false);
              }}
              className="rounded-full bg-red-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-red-500"
            >
              削除する
            </button>
          </div>
        </div>
      ) : (
        // Permanent action row (no longer hover-only) so the buttons are
        // discoverable and the hit-targets are large enough to tap on
        // touch / trackpad without precise hovering.
        <div className="flex items-center justify-end gap-1 px-1 pb-1.5">
          <button
            type="button"
            onClick={() => {
              setDraft(thread.title ?? threadTitle(thread));
              setRenaming(true);
            }}
            className="inline-flex items-center gap-1 rounded-md bg-white/80 px-2 py-1 text-[11px] font-medium text-neutral-600 ring-1 ring-neutral-200 transition hover:bg-white hover:text-neutral-900"
            title="名前を変更"
          >
            <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden>
              <path
                d="M11 1.5l3.5 3.5L5 14.5H1.5V11L11 1.5z"
                stroke="currentColor"
                strokeWidth="1.5"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            名前
          </button>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="inline-flex items-center gap-1 rounded-md bg-white/80 px-2 py-1 text-[11px] font-medium text-neutral-600 ring-1 ring-neutral-200 transition hover:bg-red-50 hover:text-red-600 hover:ring-red-200"
            title="この会話を削除"
          >
            <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden>
              <path
                d="M3 4h10M6 4V2.5h4V4M5 4l.5 9.5h5L11 4M7 7v4M9 7v4"
                stroke="currentColor"
                strokeWidth="1.4"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            削除
          </button>
        </div>
      )}
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
  const hasSources = !isUser && !!m.sources && m.sources.length > 0;
  const sourceCount = hasSources
    ? m.sources!.reduce((sum, s) => sum + s.chunks.length, 0)
    : 0;

  return (
    <li className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className="group relative max-w-[85%]">
        {/* Floating action toolbar — appears on hover above the bubble
            so it never shifts the message layout. */}
        <div
          className={`absolute -top-3 z-10 hidden items-center gap-0.5 rounded-full border border-neutral-200 bg-white px-1 py-0.5 shadow-sm group-hover:flex ${
            isUser ? 'left-2' : 'right-2'
          }`}
        >
          <button
            type="button"
            onClick={() => onUpdate({ pinned: !m.pinned })}
            className={`rounded-full px-1 text-[12px] leading-none transition ${
              m.pinned ? 'opacity-100' : 'opacity-40 hover:opacity-100'
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
            className={`rounded-full px-1 text-[12px] leading-none transition ${
              m.note ? 'opacity-100' : 'opacity-40 hover:opacity-100'
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
                className={`rounded-full px-1 text-[12px] leading-none transition ${
                  m.rating === 'up'
                    ? 'opacity-100'
                    : 'opacity-40 hover:opacity-100'
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
                className={`rounded-full px-1 text-[12px] leading-none transition ${
                  m.rating === 'down'
                    ? 'opacity-100'
                    : 'opacity-40 hover:opacity-100'
                }`}
                title="改善が必要"
              >
                👎
              </button>
            </>
          )}
        </div>

        <div
          className={`rounded-2xl px-3.5 py-2.5 text-sm ${
            isUser
              ? 'rounded-br-md bg-neutral-900 text-white'
              : 'rounded-bl-md bg-neutral-100 text-neutral-900'
          }`}
        >
          <div className="flex items-center gap-2 text-[10px] opacity-60">
            <span className="font-medium uppercase tracking-wider">
              {isUser ? 'あなた' : avatarName}
            </span>
            <span>
              {new Date(m.at).toLocaleTimeString('ja-JP', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            {m.pinned && <span title="ピン留め済み">📌</span>}
            {m.rating === 'up' && <span>👍</span>}
            {m.rating === 'down' && <span>👎</span>}
            {m.escalation && (
              <span title="上長確認推奨を検出">⚠️</span>
            )}
          </div>
          <p className="mt-1 whitespace-pre-wrap leading-relaxed">
            <Highlight text={m.text} term={search} />
          </p>

          {m.escalation && (
            <div
              className={`mt-2 rounded-lg border px-2.5 py-2 text-[11px] leading-relaxed ${
                isUser
                  ? 'border-amber-300/60 bg-amber-100/15 text-amber-100'
                  : 'border-amber-400 bg-amber-50 text-amber-900'
              }`}
            >
              <p className="font-semibold">
                ⚠️ 上長確認推奨{!isUser ? '(この回答は参考情報です)' : ''}
              </p>
              <p className="mt-0.5">
                判断カテゴリ:{' '}
                {m.escalation.categories
                  .map((c) => escalationLabel(c as EscalationCategory))
                  .join(' / ')}
              </p>
              {m.escalation.hints.length > 0 && (
                <p
                  className={`mt-0.5 text-[10px] ${
                    isUser ? 'text-amber-100/80' : 'text-amber-800/80'
                  }`}
                >
                  検出語: {m.escalation.hints.join('、')}
                </p>
              )}
              <p
                className={`mt-1 text-[10px] ${
                  isUser ? 'text-amber-100/80' : 'text-amber-800/80'
                }`}
              >
                最終判断は{isUser ? '必ず' : ''}上長・関連部署にご確認ください。
              </p>
            </div>
          )}
          {hasSources && (
            <button
              type="button"
              onClick={() => setSourcesOpen((v) => !v)}
              className="mt-2 inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[10px] text-neutral-600 ring-1 ring-neutral-200 transition hover:text-neutral-900"
            >
              🔍 根拠 {sourceCount}件 {sourcesOpen ? '▲' : '▼'}
            </button>
          )}
          {!isUser && !hasSources && (
            <p
              className="mt-1.5 text-[10px] text-amber-600/80"
              title="この回答は学習素材を検索せずに生成されています。重要な内容は素材や原典で確認してください。"
            >
              ⚠ 根拠未参照(素材を検索せずに回答)
            </p>
          )}
          {hasSources && sourcesOpen && (
            <div className="mt-2 space-y-2 rounded-lg bg-white p-2.5 text-[11px] leading-relaxed ring-1 ring-neutral-200">
              {m.sources!.map((s, si) => (
                <div key={si}>
                  <p className="font-medium text-neutral-500">🔍 {s.query}</p>
                  <ul className="ml-3 mt-0.5 list-disc space-y-0.5 text-neutral-700">
                    {s.chunks.slice(0, 4).map((c, ci) => (
                      <li key={ci}>
                        {c.length > 180 ? c.slice(0, 180) + '…' : c}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {m.note && !noteOpen && (
            <div
              className={`mt-2 rounded-md px-2 py-1 text-[11px] ${
                isUser
                  ? 'bg-white/10 text-white/80'
                  : 'bg-amber-50 text-amber-900'
              }`}
            >
              📝 {m.note}
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
        title={
          current ??
          '回答のルール(口調・専門分野・答えてはいけないこと等)を設定'
        }
      >
        📋 回答ルール{current ? '(設定済み)' : ''}
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
              📋 回答ルールの設定
            </h3>
            <p className="mt-1 text-[11px] leading-relaxed text-neutral-500">
              このブレインの「話し方」と「答え方のルール」をここに書きます。
              口調(です・ます調/くだけた話し方)、得意分野、答えてはいけない
              話題、答えるときの決まりごと(例:必ず根拠を示す)などを自由な
              文章で指示できます。保存すると次の会話開始から反映されます。
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
                空にして保存すると、標準の振る舞いに戻ります。
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
