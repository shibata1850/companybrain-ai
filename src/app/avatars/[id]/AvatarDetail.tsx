'use client';

import Link from 'next/link';
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import StreamingStage, {
  type TranscriptMessage,
  type TranscriptSource,
} from '@/components/StreamingStage';
import { detectEscalation } from '@/lib/escalation';
import useIsMobile from '@/lib/useIsMobile';
import PhotoCropper from '@/components/PhotoCropper';
import PortalMenu from '@/components/PortalMenu';

type Avatar = {
  id: string;
  name: string;
  description: string | null;
  persona_prompt: string | null;
  cover_url: string | null;
  voice: string | null;
  language: string | null;
  request_id: string | null;
  /** false のとき、共有された(閲覧・会話のみの)ブレイン。編集系は隠す。 */
  can_edit?: boolean;
  shared?: boolean;
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
  /** 会話画面では使わない。素材管理画面(?materials=full)でのみ返る。 */
  transcript?: string | null;
  folder: string | null;
  created_at: string;
};

type DetailResponse = {
  avatar: Avatar;
  training_videos: TrainingVideo[];
};

export default function AvatarDetail({ id }: { id: string }) {
  const [data, setData] = useState<DetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Training panel state.
  const [trainFile, setTrainFile] = useState<File | null>(null);
  // 動画アップロード時の本人同意チェック(利用規約 第6条)。送信ごとに確認。
  const [trainConsent, setTrainConsent] = useState(false);
  const [training, setTraining] = useState(false);
  const [trainText, setTrainText] = useState('');
  const [trainTextTitle, setTrainTextTitle] = useState('');
  const [trainFolder, setTrainFolder] = useState<string | null>(null);
  const [trainingText, setTrainingText] = useState(false);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [trainingDoc, setTrainingDoc] = useState(false);
  // 学習完了の控えめな通知と、ファイル入力クリア用のキー。
  const [learnedNote, setLearnedNote] = useState<string | null>(null);
  const [fileResetKey, setFileResetKey] = useState(0);
  const learnedTimerRef = useRef<number | null>(null);
  const flashLearned = useCallback((msg = '学習が完了しました') => {
    setLearnedNote(msg);
    if (learnedTimerRef.current) window.clearTimeout(learnedTimerRef.current);
    learnedTimerRef.current = window.setTimeout(
      () => setLearnedNote(null),
      4000,
    );
  }, []);

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
  // フリープラン(音声0分)はテキスト回答のみなので、声の変更
  // オプション自体を出さない。管理者と、依頼で作成されたブレイン
  // (プラン制限外で音声可)は表示を維持する。
  const [planVoiceAllowed, setPlanVoiceAllowed] = useState(true);

  useEffect(() => {
    fetch('/api/plan', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (j.role === 'admin') return;
        if (j.plan?.limits?.monthlyVoiceMinutes === 0) {
          setPlanVoiceAllowed(false);
        }
      })
      .catch(() => {});
  }, []);

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

  // ブレイン情報・設定・素材は右上メニューに集約(LINE 型)。既定は閉じる。
  const [menuOpen, setMenuOpen] = useState(false);

  // xl(1280px)以上では、メニューの中身を右レールに常時表示する。
  // 初回描画は false(モバイル扱い)で、マウント後に確定する。
  const isWideDesktop = useIsMobile('(min-width: 1280px)');

  // スマホはブレイン画面を [学習 | 会話 | 設定] の3面スワイプにする
  // (LINE のタブと同じ操作系。タブのタップでも切り替えられる)。
  // CSS スクロールスナップ実装なので、慣性・追従はブラウザ任せで滑らか。
  const isPhone = useIsMobile();
  const paneScrollerRef = useRef<HTMLDivElement | null>(null);
  const [activePane, setActivePane] = useState(1);
  const goToPane = useCallback((i: number) => {
    const el = paneScrollerRef.current;
    if (!el) return;
    el.scrollTo({ left: el.clientWidth * i, behavior: 'smooth' });
  }, []);
  // 初期表示は中央の「会話」。
  // 以前は effect(isPhone 依存)で合わせていたが、データ読み込み前は
  // スケルトン表示でスワイプ面がまだ存在せず、初期化が空振りして左端
  // (学習)が見えるバグがあった。面の DOM が生まれた瞬間に呼ばれる
  // callback ref にすることで、読み込みタイミングに依存しなくする。
  const paneInitDoneRef = useRef(false);
  const attachPaneScroller = useCallback((el: HTMLDivElement | null) => {
    paneScrollerRef.current = el;
    if (!el || paneInitDoneRef.current) return;
    requestAnimationFrame(() => {
      el.scrollLeft = el.clientWidth;
      setActivePane(1);
      paneInitDoneRef.current = true;
    });
  }, []);
  // サイドバー等で別ブレインへ切り替えたときも「会話」から始める
  // (コンポーネントが再マウントされない遷移への保険)。
  useEffect(() => {
    paneInitDoneRef.current = false;
    const el = paneScrollerRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollLeft = el.clientWidth;
      setActivePane(1);
      paneInitDoneRef.current = true;
    });
  }, [id]);

  // ホームの「質問する」大ボタン・最近使った一覧のために、開いたブレインを
  // 端末に記録する(会話スレッドと同じく端末ローカルで良い情報)。
  useEffect(() => {
    const a = data?.avatar;
    if (!a) return;
    try {
      const KEY = 'cb-recent-brains';
      const prev: Array<{ id: string; name: string; at: number }> = JSON.parse(
        localStorage.getItem(KEY) || '[]',
      );
      const next = [
        { id: a.id, name: a.name, at: Date.now() },
        ...prev.filter((r) => r && typeof r.id === 'string' && r.id !== a.id),
      ].slice(0, 5);
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // 記録できなくても本体機能には影響しない。
    }
  }, [data]);

  // Photo cropping flow — the round avatar thumbnail.
  // (背景写真(stage)は通話UIの一本化で廃止した)
  const [cropperSrc, setCropperSrc] = useState<string | null>(null);
  const [cropperBusy, setCropperBusy] = useState(false);
  const coverFileInputRef = useRef<HTMLInputElement>(null);

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

  async function addTrainingVideo(e: React.FormEvent) {
    e.preventDefault();
    if (!trainFile) return;
    if (!trainConsent) {
      setError('被写体ご本人の同意の確認が必要です(利用規約 第6条)。');
      return;
    }
    const form = new FormData();
    form.append('video', trainFile);
    form.append('consent', 'true');
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
      setTrainConsent(false);
      setFileResetKey((k) => k + 1);
      await load();
      flashLearned('動画を学習しました');
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
      flashLearned('テキストを学習しました');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTrainingText(false);
    }
  }

  async function addTrainingDocument(e: React.FormEvent) {
    e.preventDefault();
    if (!docFile) return;
    const form = new FormData();
    form.append('document', docFile);
    if (trainFolder) form.append('folder', trainFolder);
    setTrainingDoc(true);
    setError(null);
    try {
      const res = await fetch(`/api/avatars/${id}/train-document`, {
        method: 'POST',
        body: form,
      });
      // サーバーが JSON でなく HTML エラーページを返す場合(500/413/504 等)
      // があるため、text で受けてから JSON を試み、分かりやすい文言を出す。
      const raw = await res.text();
      let json: { error?: string } = {};
      try {
        json = raw ? (JSON.parse(raw) as { error?: string }) : {};
      } catch {
        throw new Error(
          res.status === 413
            ? 'ファイルが大きすぎます。分割してお試しください。'
            : `サーバーでエラーが発生しました(${res.status})。時間をおいて再度お試しください。`,
        );
      }
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setDocFile(null);
      setFileResetKey((k) => k + 1);
      await load();
      flashLearned('文書を学習しました');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTrainingDoc(false);
    }
  }

  function openFilePicker() {
    coverFileInputRef.current?.click();
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
        new File([blob], 'cover.jpg', { type: 'image/jpeg' }),
      );
      const res = await fetch(`/api/avatars/${id}/photo`, {
        method: 'POST',
        body: form,
      });
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

  // Prevents double-save when both onBlur and Enter fire for the same
  // edit (or when one fires while the previous save is still in flight).
  const commitInFlightRef = useRef(false);

  async function commitNameEdit() {
    if (!editingName || commitInFlightRef.current) return;
    const next = nameDraft.trim();
    if (!next || next === data?.avatar.name) {
      setEditingName(false);
      return;
    }
    commitInFlightRef.current = true;
    try {
      const ok = await saveMeta({ name: next });
      if (ok) setEditingName(false);
    } finally {
      commitInFlightRef.current = false;
    }
  }

  async function commitDescEdit() {
    if (!editingDesc || commitInFlightRef.current) return;
    const next = descDraft.trim();
    if (next === (data?.avatar.description ?? '')) {
      setEditingDesc(false);
      return;
    }
    commitInFlightRef.current = true;
    try {
      const ok = await saveMeta({ description: next || null });
      if (ok) setEditingDesc(false);
    } finally {
      commitInFlightRef.current = false;
    }
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
  // 共有された(閲覧・会話のみの)ブレインは編集不可。旧レスポンスとの
  // 後方互換のため、can_edit が明示的に false のときだけ編集を隠す。
  const canEdit = avatar.can_edit !== false;
  // Keep the audit logger's name copy current (read by a []-deps cb).
  avatarNameRef.current = avatar.name;
  // 声の変更を出すか: プランで音声が使えるユーザー、または依頼で
  // 作成されたブレイン(プラン制限外で音声可)のときだけ。
  const showVoiceOption = planVoiceAllowed || avatar.request_id != null;

  // ブレイン情報 / 詳細設定 / 共有 / 学習素材のまとまり。スマホ〜lg では
  // 右上メニューの中に、xl 以上では右レールに常時表示する(定義は1箇所)。
  // ブレイン設定(情報・背景・声・共有)と学習(素材)を分けて持つ。
  // スマホはスワイプ切替の別ページに、PC はレール/メニューで縦に並べる。
  const brainSettingsBlock = (
    <>
          <div className="flex items-center gap-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
          <div className="relative shrink-0">
            <div className="h-14 w-14 overflow-hidden rounded-full bg-neutral-100 ring-2 ring-white shadow sm:h-16 sm:w-16">
            {avatar.cover_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatar.cover_url}
                alt={avatar.name}
                className="h-full w-full object-cover"
              />
            ) : null}
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={() => openFilePicker()}
              aria-label="アバター写真を変更"
              className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-neutral-900 text-white shadow-md transition hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:ring-offset-2"
            >
              <svg width="9" height="9" viewBox="0 0 16 16" aria-hidden>
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
          )}
        </div>
        <div className="min-w-0 flex-1">
          {editingName && canEdit ? (
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
              className="w-full rounded-md border border-neutral-300 bg-white px-2 py-1 text-xl sm:text-2xl font-bold tracking-tight focus:border-neutral-900 focus:outline-none"
            />
          ) : (
            <div className="flex items-center gap-2">
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => {
                    setNameDraft(avatar.name);
                    setEditingName(true);
                  }}
                  className="block max-w-full truncate rounded-md text-left text-xl sm:text-2xl font-bold tracking-tight transition hover:bg-neutral-100"
                  title="クリックで編集"
                >
                  {avatar.name}
                </button>
              ) : (
                <h1 className="block max-w-full truncate text-xl sm:text-2xl font-bold tracking-tight">
                  {avatar.name}
                </h1>
              )}
              {avatar.request_id && (
                <span className="shrink-0 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                  依頼で作成
                </span>
              )}
              {!canEdit && (
                <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  共有
                </span>
              )}
            </div>
          )}

          {editingDesc && canEdit ? (
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
              className="mt-0.5 w-full rounded-md border border-neutral-300 bg-white px-2 py-0.5 text-xs focus:border-neutral-900 focus:outline-none"
            />
          ) : canEdit ? (
            <button
              type="button"
              onClick={() => {
                setDescDraft(avatar.description ?? '');
                setEditingDesc(true);
              }}
              className="block max-w-full truncate rounded-md text-left text-xs text-neutral-500 transition hover:bg-neutral-100"
              title="クリックで編集"
            >
              {avatar.description || '+ 説明を追加'}
            </button>
          ) : (
            avatar.description && (
              <p className="mt-0.5 block max-w-full truncate text-xs text-neutral-500">
                {avatar.description}
              </p>
            )
          )}
        </div>
        </div>
          {/* 共有相手(閲覧・会話のみ)には声・言語・回答ルールの変更を出さない。 */}
      {canEdit && (
      /* Collapsible settings: 声 / 言語 / 回答ルール. Closed by default
          to keep the top of the page compact. A vertical settings list
          (iOS/Linear 風)で、各行に現在値を出す。小さなピルより読みやすく
          タップ範囲も広い。 */
      <details className="group overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-bold text-neutral-700 transition hover:bg-neutral-50">
          <span>詳細設定</span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            aria-hidden
            className="text-neutral-400 transition-transform group-open:rotate-180"
          >
            <path
              d="M4 6l4 4 4-4"
              stroke="currentColor"
              strokeWidth="1.6"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </summary>
        <div className="divide-y divide-neutral-100 border-t border-neutral-100 px-2">
          {showVoiceOption && (
            <VoicePicker
              current={avatar.voice}
              onChange={async (v) => {
                await saveMeta({ voice: v });
              }}
              disabled={savingMeta}
            />
          )}
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
      </details>
      )}

      {/* 所有者のみ・エンタープライズ限定の共有パネル。 */}
      {canEdit && <SharePanel avatarId={avatar.id} />}
    </>
  );
  const trainingBlock = (
    <>
          {!canEdit ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-neutral-900">共有されたブレイン</h2>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  閲覧・会話のみ
                </span>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-neutral-600">
                このブレインは同じ会社のメンバーから共有されています。
                会話はできますが、素材の追加・編集・削除、声や回答ルールの
                変更はできません。変更が必要な場合は作成者にご相談ください。
              </p>
            </div>
          ) : avatar.request_id ? (
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-5">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-neutral-900">学習させる</h2>
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                  依頼で作成
                </span>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-neutral-600">
                このブレインは管理者が依頼を受けて作成したものです。
                内容を保つため、素材の追加・学習はできません。
                変更が必要な場合は管理者にご相談ください。
              </p>
            </div>
          ) : (
            <TrainingPanel
              avatarId={avatar.id}
              avatarName={avatar.name}
              videos={training_videos}
              trainFile={trainFile}
              onPickFile={setTrainFile}
              onSubmitVideo={addTrainingVideo}
              submittingVideo={training}
              videoConsent={trainConsent}
              onChangeVideoConsent={setTrainConsent}
              trainText={trainText}
              onChangeText={setTrainText}
              trainTextTitle={trainTextTitle}
              onChangeTextTitle={setTrainTextTitle}
              onSubmitText={addTrainingText}
              submittingText={trainingText}
              docFile={docFile}
              onPickDoc={setDocFile}
              onSubmitDoc={addTrainingDocument}
              submittingDoc={trainingDoc}
              trainFolder={trainFolder}
              onChangeFolder={setTrainFolder}
              learnedNote={learnedNote}
              fileResetKey={fileResetKey}
            />
          )}
    </>
  );
  const settingsStack = (
    <>
      {brainSettingsBlock}
      {trainingBlock}
    </>
  );

  // 会話ビュー: ワンボタンのリアルタイム通話。チャットUIは廃止した
  // (将来、別機能として再実装する)。会話内容のサーバー監査記録
  // (audit_logs。質問数カウントの基盤でもある)とローカル保存は、
  // onMessage 経由で従来どおり続ける。
  const callView = (
    <div className="flex min-h-0 flex-1 flex-col sm:min-h-[30rem] sm:rounded-3xl sm:border sm:border-neutral-200 sm:bg-white sm:shadow-sm">
      <StreamingStage
        avatarId={avatar.id}
        coverUrl={avatar.cover_url}
        avatarName={avatar.name}
        onMessage={handleTranscriptMessage}
      />
    </div>
  );

  return (
    /* スマホはアプリ型シェル: 高さを画面に固定し、スクロールは会話だけに
       する(ページと会話の二重スクロールが操作感を悪くしていた)。
       上の 5rem = ヘッダー3.5rem + main 上余白1.5rem。下の負マージンは
       layout が下部ナビ用に入れる余白の打ち消し(この画面はナビ非表示)。 */
    <div className="mx-auto flex h-[calc(100dvh-5rem)] w-full max-w-2xl flex-col -mb-[calc(6rem+env(safe-area-inset-bottom))] sm:mb-0 sm:block sm:h-auto xl:max-w-5xl">
      <div className="flex min-h-0 flex-1 flex-col sm:block xl:flex xl:flex-row xl:items-start xl:gap-6">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col space-y-3 sm:block xl:flex-1">
      {/* LINE 型チャットヘッダー: 戻る / 相手(ブレイン)/ メニュー。
          情報・設定・素材は右上メニューに集約し、画面は会話を主役にする。 */}
      <div className="flex shrink-0 items-center gap-2 rounded-none border-b border-neutral-200/80 bg-white px-1 py-1.5 sm:rounded-2xl sm:border sm:border-neutral-200 sm:px-2.5 sm:py-2 sm:shadow-sm">
        <Link
          href="/dashboard"
          aria-label="ブレイン一覧へ戻る"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900"
        >
          <svg width="16" height="16" viewBox="0 0 12 12" aria-hidden>
            <path
              d="M7.5 2.5L4 6l3.5 3.5"
              stroke="currentColor"
              strokeWidth="1.5"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
        <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-neutral-100">
          {avatar.cover_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatar.cover_url}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h1 className="truncate text-sm font-bold tracking-tight">
              {avatar.name}
            </h1>
            {avatar.request_id && (
              <span className="shrink-0 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                依頼で作成
              </span>
            )}
            {!canEdit && (
              <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                共有
              </span>
            )}
          </div>
          <p className="truncate text-xs text-neutral-500">
            {canEdit ? `学習素材 ${training_videos.length}件` : '閲覧・会話のみ'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          className={`hidden shrink-0 rounded-full px-3 py-2 text-xs font-bold transition sm:block xl:hidden ${
            menuOpen
              ? 'bg-neutral-900 text-white'
              : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
          }`}
        >
          {menuOpen ? '閉じる' : 'メニュー'}
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 anim-fade-in">
          {error}
        </div>
      )}

      {isPhone ? (
        <>
          {/* 3面切替タブ(LINE のタブと同じ)。スワイプでもタップでも動く。 */}
          <div
            role="tablist"
            aria-label="ブレイン画面の切り替え"
            className="flex shrink-0 rounded-xl bg-neutral-100 p-0.5 text-sm font-bold"
          >
            {['学習させる', '会話', '設定'].map((label, i) => (
              <button
                key={label}
                type="button"
                role="tab"
                aria-selected={activePane === i}
                onClick={() => goToPane(i)}
                className={`flex-1 rounded-lg py-1.5 transition ${
                  activePane === i
                    ? 'bg-white text-neutral-900 shadow-sm'
                    : 'text-neutral-500'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* スワイプ面。スクロールスナップで1面ずつ止まる。 */}
          <div
            ref={attachPaneScroller}
            onScroll={(e) => {
              const el = e.currentTarget;
              const i = Math.round(el.scrollLeft / el.clientWidth);
              if (i !== activePane) setActivePane(i);
            }}
            className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <div className="h-full w-full shrink-0 snap-center overflow-y-auto pr-1.5">
              <div className="space-y-3 pb-6 pt-1">{trainingBlock}</div>
            </div>
            <div className="flex h-full w-full shrink-0 snap-center flex-col px-0.5">
              {callView}
            </div>
            <div className="h-full w-full shrink-0 snap-center overflow-y-auto pl-1.5">
              <div className="space-y-3 pb-6 pt-1">{brainSettingsBlock}</div>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* sm〜lg: 右上メニュー。xl: 右レール(settingsStack)。 */}
          {!isWideDesktop && menuOpen && (
            <div className="max-h-[55dvh] space-y-3 overflow-y-auto anim-fade-in-up sm:max-h-none sm:overflow-visible">
              {settingsStack}
            </div>
          )}
          {callView}
        </>
      )}

        </div>

        {/* xl 以上の右レール: メニューの中身を常時表示する。PC の広さを
            使い、素材追加・設定・共有を会話と並べて見えるようにする。 */}
        {isWideDesktop && (
          <aside className="w-80 shrink-0 space-y-3">{settingsStack}</aside>
        )}
      </div>

      {/* 写真変更用の hidden input。メニュー開閉と無関係に参照できるよう
          ルート直下に置く。 */}
        <input
          ref={coverFileInputRef}
          type="file"
          accept="image/*"
          onChange={onFilePicked}
          className="hidden"
        />

      <PhotoCropper
        src={cropperSrc ?? ''}
        open={!!cropperSrc}
        busy={cropperBusy}
        onConfirm={saveCroppedPhoto}
        onCancel={cancelCrop}
        aspect={1}
        cropShape="round"
        outputWidth={512}
        outputHeight={512}
        title="アバター写真をトリミング"
        hint="丸く切り抜かれた範囲がアバター写真になります。"
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
  videoConsent,
  onChangeVideoConsent,
  trainText,
  onChangeText,
  trainTextTitle,
  onChangeTextTitle,
  onSubmitText,
  submittingText,
  docFile,
  onPickDoc,
  onSubmitDoc,
  submittingDoc,
  trainFolder,
  onChangeFolder,
  learnedNote,
  fileResetKey,
}: {
  avatarId: string;
  avatarName: string;
  videos: TrainingVideo[];
  trainFile: File | null;
  onPickFile: (f: File | null) => void;
  onSubmitVideo: (e: React.FormEvent) => void;
  submittingVideo: boolean;
  /** 動画の被写体本人の同意確認(利用規約 第6条)。 */
  videoConsent: boolean;
  onChangeVideoConsent: (v: boolean) => void;
  trainText: string;
  onChangeText: (v: string) => void;
  trainTextTitle: string;
  onChangeTextTitle: (v: string) => void;
  onSubmitText: (e: React.FormEvent) => void;
  submittingText: boolean;
  docFile: File | null;
  onPickDoc: (f: File | null) => void;
  onSubmitDoc: (e: React.FormEvent) => void;
  submittingDoc: boolean;
  trainFolder: string | null;
  onChangeFolder: (folder: string | null) => void;
  /** 学習完了時の控えめな通知(数秒で消える)。null で非表示。 */
  learnedNote: string | null;
  /** これが変わるとファイル入力を再マウントして選択をクリアする。 */
  fileResetKey: number;
}) {
  const [mode, setMode] = useState<'video' | 'text' | 'document'>('text');

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
          <p className="mt-1 text-xs leading-relaxed text-neutral-500">
            {avatarName} の発言や考え方を追加するほど、会話が本人らしくなります。
          </p>
        </div>
      </div>

      {/* スマホ: アイコン+ラベルの3タイル。文字だけの小さなボタンは
          押しづらく、何を選んでいるかも分かりにくかった。 */}
      <div className="grid grid-cols-3 gap-2 sm:hidden">
        <button
          type="button"
          onClick={() => setMode('text')}
          className={`rounded-xl border-2 px-1 pb-2 pt-2.5 text-center transition active:scale-[0.98] ${
            mode === 'text'
              ? 'border-neutral-900 bg-neutral-900 text-white'
              : 'border-neutral-200 bg-white text-neutral-600'
          }`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden className="mx-auto">
            <path
              d="M4 6h16M4 12h16M4 18h10"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <span className="mt-1 block text-xs font-bold">テキスト</span>
        </button>
        <button
          type="button"
          onClick={() => setMode('document')}
          className={`rounded-xl border-2 px-1 pb-2 pt-2.5 text-center transition active:scale-[0.98] ${
            mode === 'document'
              ? 'border-neutral-900 bg-neutral-900 text-white'
              : 'border-neutral-200 bg-white text-neutral-600'
          }`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden className="mx-auto">
            <path
              d="M6 2h9l5 5v15H6z M14 2v6h6"
              stroke="currentColor"
              strokeWidth="1.8"
              fill="none"
              strokeLinejoin="round"
            />
          </svg>
          <span className="mt-1 block text-xs font-bold">ファイル</span>
        </button>
        <button
          type="button"
          onClick={() => setMode('video')}
          className={`rounded-xl border-2 px-1 pb-2 pt-2.5 text-center transition active:scale-[0.98] ${
            mode === 'video'
              ? 'border-neutral-900 bg-neutral-900 text-white'
              : 'border-neutral-200 bg-white text-neutral-600'
          }`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden className="mx-auto">
            <rect x="3" y="5" width="13" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" fill="none" />
            <path d="M16 10l5-3v10l-5-3z" fill="currentColor" />
          </svg>
          <span className="mt-1 block text-xs font-bold">動画</span>
        </button>
      </div>

      <div className="hidden rounded-full bg-neutral-100 p-0.5 text-xs sm:flex">
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
          onClick={() => setMode('document')}
          className={`flex-1 rounded-full px-3 py-1 transition ${
            mode === 'document'
              ? 'bg-white text-neutral-900 shadow-sm'
              : 'text-neutral-500 hover:text-neutral-900'
          }`}
        >
          文書
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

      {/* 学習完了の控えめな通知。数秒で消える。 */}
      {learnedNote && (
        <div
          role="status"
          className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 anim-fade-in"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden>
            <path
              d="M3 8.5l3 3L13 5"
              stroke="currentColor"
              strokeWidth="1.8"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {learnedNote}
        </div>
      )}

      {mode === 'video' ? (
        <form onSubmit={onSubmitVideo} className="space-y-3">
          <input
            key={`video-${fileResetKey}`}
            type="file"
            accept="video/*"
            onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs file:mr-3 file:rounded-md file:border-0 file:bg-neutral-900 file:px-3 file:py-1 file:text-white"
          />
          <label className="flex items-start gap-2 text-xs leading-relaxed text-neutral-600">
            <input
              type="checkbox"
              checked={videoConsent}
              onChange={(e) => onChangeVideoConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-neutral-900"
            />
            <span>
              動画に映っているご本人から、本サービスでの利用(AIによる口調・考え方の再現を含む)について同意を得ています(
              <a
                href="/terms"
                target="_blank"
                className="underline hover:text-neutral-900"
              >
                利用規約 第6条
              </a>
              )
            </span>
          </label>
          <button
            type="submit"
            disabled={!trainFile || !videoConsent || submittingVideo}
            className="w-full rounded-full bg-neutral-900 px-4 py-2 text-xs font-medium text-white transition hover:bg-neutral-700 active:scale-[0.99] disabled:opacity-40"
          >
            {submittingVideo ? '学習中…' : '動画から学習'}
          </button>
        </form>
      ) : mode === 'document' ? (
        <form onSubmit={onSubmitDoc} className="space-y-3">
          <input
            key={`doc-${fileResetKey}`}
            type="file"
            accept=".pdf,.docx,.xlsx,.xls,.csv,.txt,.md,application/pdf"
            onChange={(e) => onPickDoc(e.target.files?.[0] ?? null)}
            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs file:mr-3 file:rounded-md file:border-0 file:bg-neutral-900 file:px-3 file:py-1 file:text-white"
          />
          <p className="text-xs leading-relaxed text-neutral-400">
            PDF・Word(.docx)・Excel(.xlsx)・CSV・テキストに対応。文書内の
            文字を読み取って学習します(画像だけの PDF は読み取れません)。
          </p>
          {docFile && (
            <p className="truncate text-xs text-neutral-600">
              選択中: {docFile.name}
            </p>
          )}
          <button
            type="submit"
            disabled={!docFile || submittingDoc}
            className="w-full rounded-full bg-neutral-900 px-4 py-2 text-xs font-medium text-white transition hover:bg-neutral-700 active:scale-[0.99] disabled:opacity-40"
          >
            {submittingDoc ? '学習中…' : '文書から学習'}
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
            <span className="text-xs text-neutral-400">
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
          <p className="text-xs uppercase tracking-wider text-neutral-400">
            学習素材 ({videos.length})
          </p>
          <Link
            href={`/avatars/${avatarId}/training`}
            className="inline-flex items-center gap-0.5 text-xs font-medium text-neutral-700 transition hover:text-neutral-900"
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
                className="flex items-center justify-between rounded-md px-2 py-1.5 text-xs text-neutral-700 hover:bg-neutral-50"
              >
                <span className="truncate">{name}</span>
                <span className="ml-2 shrink-0 rounded-full bg-neutral-100 px-1.5 text-xs text-neutral-500">
                  {count}
                </span>
              </li>
            ))}
            {folders.length > 6 && (
              <li className="px-2 text-xs text-neutral-400">
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
        <span className="text-xs font-medium uppercase tracking-wider text-neutral-500">
          分類フォルダ
        </span>
        {current && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-xs text-neutral-400 hover:text-neutral-900"
          >
            未分類に戻す
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(null)}
          className={`rounded-full border px-2 py-0.5 text-xs transition ${
            current === null
              ? 'border-neutral-900 bg-neutral-900 text-white'
              : 'border-neutral-300 bg-white text-neutral-600 hover:border-neutral-900'
          }`}
        >
          未分類
        </button>
        {options.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => onChange(name)}
            className={`max-w-[10rem] truncate rounded-full border px-2 py-0.5 text-xs transition ${
              current === name
                ? 'border-neutral-900 bg-neutral-900 text-white'
                : 'border-neutral-300 bg-white text-neutral-600 hover:border-neutral-900'
            }`}
            title={name}
          >
            {name}
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
              className="w-24 bg-transparent text-xs outline-none"
            />
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="rounded-full border border-dashed border-neutral-300 px-2 py-0.5 text-xs text-neutral-500 transition hover:border-neutral-900 hover:text-neutral-900"
          >
            ＋ 新規
          </button>
        )}
      </div>
      {current && (
        <p className="text-xs text-neutral-400">
          このあと学習させる素材は
          <span className="font-medium text-neutral-700">「{current}」</span>
          に保存されます。
        </p>
      )}
    </div>
  );
}

/* ===========================================================
 * Setting rows / pickers
 * =========================================================== */

const SettingRow = forwardRef<
  HTMLButtonElement,
  {
    icon: React.ReactNode;
    title: string;
    subtitle: string;
    value: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
  }
>(function SettingRow({ icon, title, subtitle, value, onClick, disabled }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center gap-3.5 rounded-xl px-2 py-3.5 text-left transition hover:bg-neutral-50 disabled:opacity-40"
    >
      <span
        aria-hidden
        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-neutral-100 text-neutral-700"
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold leading-tight text-neutral-900">
          {title}
        </span>
        <span className="mt-0.5 block truncate text-[12px] text-neutral-500">
          {subtitle}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-neutral-500">
        {value}
        <svg width="8" height="13" viewBox="0 0 8 14" aria-hidden className="text-neutral-400">
          <path
            d="M1 1l5 6-5 6"
            stroke="currentColor"
            strokeWidth="1.6"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </button>
  );
});

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
      <SettingRow
        disabled={disabled}
        onClick={() => setOpen(true)}
        icon={
          <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden>
            <path
              d="M3 3h10M3 7h10M3 11h6"
              stroke="currentColor"
              strokeWidth="1.5"
              fill="none"
              strokeLinecap="round"
            />
          </svg>
        }
        title="回答ルール"
        subtitle="口調・答え方の決まりごと"
        value={
          current ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
              設定済み
            </span>
          ) : (
            <span className="text-neutral-400">未設定</span>
          )
        }
      />
      {open && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4 anim-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-sm font-bold text-neutral-900">
              回答ルールの設定
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-neutral-500">
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
              <p className="text-xs text-neutral-400">
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
      <SettingRow
        ref={buttonRef}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        icon={
          <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden>
            <path d="M6 3a2 2 0 0 1 4 0v6a2 2 0 1 1-4 0V3z" fill="currentColor" />
            <path
              d="M3 9a5 5 0 0 0 10 0M8 14v1.5"
              stroke="currentColor"
              strokeWidth="1.2"
              fill="none"
              strokeLinecap="round"
            />
          </svg>
        }
        title="声"
        subtitle="会話で話す声のトーン"
        value={label}
      />
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
              <span className="font-bold">{v.id}</span>
              <span className="text-xs text-neutral-400">{v.hint}</span>
            </button>
          ))}
        </div>
        <div className="border-t border-neutral-100 px-3 py-2 text-xs leading-relaxed text-neutral-400">
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
      <SettingRow
        ref={buttonRef}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        icon={
          <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden>
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" fill="none" />
            <path
              d="M2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12"
              stroke="currentColor"
              strokeWidth="1.1"
              fill="none"
            />
          </svg>
        }
        title="言語"
        subtitle="音声認識の対象言語"
        value={currentLabel}
      />
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
                <span className="text-xs text-neutral-400">{l.id}</span>
              </button>
            );
          })}
        </div>
        <div className="border-t border-neutral-100 px-3 py-2 text-xs leading-relaxed text-neutral-400">
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

/* ===========================================================
 * 共有パネル(所有者のみ・エンタープライズ限定)
 * 同じ会社のメンバーに、閲覧・会話のみでブレインを共有する。
 * =========================================================== */

type ShareConfig = {
  enabled: boolean;
  shared_with_org?: boolean;
  shared_emails?: string[];
  members?: string[];
};

function SharePanel({ avatarId }: { avatarId: string }) {
  const [config, setConfig] = useState<ShareConfig | null>(null);
  const [sharedWithOrg, setSharedWithOrg] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/avatars/${avatarId}/share`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j: ShareConfig) => {
        if (!alive) return;
        setConfig(j);
        setSharedWithOrg(j.shared_with_org === true);
        setSelected(new Set((j.shared_emails ?? []).map((e) => e.toLowerCase())));
      })
      .catch(() => {
        if (alive) setConfig({ enabled: false });
      });
    return () => {
      alive = false;
    };
  }, [avatarId]);

  // 個人アカウント(組織なし)や取得失敗時はパネル自体を出さない。
  if (!config || !config.enabled) return null;

  const members = config.members ?? [];

  function toggleMember(email: string) {
    setSaved(false);
    setSelected((prev) => {
      const next = new Set(prev);
      const key = email.toLowerCase();
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setErr(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/avatars/${avatarId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shared_with_org: sharedWithOrg,
          emails: Array.from(selected),
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setSaved(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const sharedCount = sharedWithOrg ? members.length : selected.size;

  return (
    <details className="group overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2.5 text-sm font-bold text-neutral-700 transition hover:bg-neutral-50">
        <span className="flex items-center gap-2">
          社員に共有
          {sharedCount > 0 && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
              {sharedWithOrg ? '会社全体' : `${sharedCount}人`}
            </span>
          )}
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          aria-hidden
          className="text-neutral-400 transition-transform group-open:rotate-180"
        >
          <path
            d="M4 6l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.6"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </summary>
      <div className="space-y-3 border-t border-neutral-100 p-4">
        <p className="text-xs leading-relaxed text-neutral-500">
          同じ会社のメンバーに、このブレインを共有できます。共有された相手は
          <span className="font-medium text-neutral-700">閲覧・会話のみ</span>
          可能で、素材の追加・編集・削除、声や回答ルールの変更はできません。
        </p>

        <label className="flex items-start gap-2.5 rounded-lg border border-neutral-200 p-3">
          <input
            type="checkbox"
            checked={sharedWithOrg}
            onChange={(e) => {
              setSaved(false);
              setSharedWithOrg(e.target.checked);
            }}
            className="mt-0.5 h-4 w-4 shrink-0 accent-neutral-900"
          />
          <span>
            <span className="block text-xs font-medium text-neutral-900">
              会社全体に共有する
            </span>
            <span className="block text-xs text-neutral-500">
              自社の全メンバーが閲覧・会話できます。
            </span>
          </span>
        </label>

        {!sharedWithOrg && (
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-neutral-500">
              共有するメンバーを選ぶ
            </p>
            {members.length === 0 ? (
              <p className="text-xs text-neutral-400">
                共有できるメンバーがいません。
              </p>
            ) : (
              <ul className="max-h-56 space-y-1 overflow-y-auto">
                {members.map((email) => {
                  const checked = selected.has(email.toLowerCase());
                  return (
                    <li key={email}>
                      <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs text-neutral-700 transition hover:bg-neutral-50">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleMember(email)}
                          className="h-4 w-4 shrink-0 accent-neutral-900"
                        />
                        <span className="truncate">{email}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {err && (
          <p className="rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700">
            {err}
          </p>
        )}

        <div className="flex items-center justify-end gap-2">
          {saved && (
            <span className="text-xs text-emerald-600">保存しました</span>
          )}
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-full bg-neutral-900 px-4 py-2 text-xs font-medium text-white transition hover:bg-neutral-700 active:scale-[0.99] disabled:opacity-40"
          >
            {saving ? '保存中…' : '共有設定を保存'}
          </button>
        </div>
      </div>
    </details>
  );
}
