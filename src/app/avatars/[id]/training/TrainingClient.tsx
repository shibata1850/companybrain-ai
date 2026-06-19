'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PortalMenu from '@/components/PortalMenu';

type Avatar = {
  id: string;
  name: string;
  description: string | null;
  cover_url: string | null;
};

type Material = {
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
  training_videos: Material[];
};

const UNFILED = '__unfiled__';

export default function TrainingClient({ avatarId }: { avatarId: string }) {
  const [data, setData] = useState<DetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filter / search.
  const [activeFolder, setActiveFolder] = useState<string>('__all__');
  const [search, setSearch] = useState('');

  // Add-material form state.
  const [mode, setMode] = useState<'video' | 'text'>('text');
  const [trainFile, setTrainFile] = useState<File | null>(null);
  const [training, setTraining] = useState(false);
  const [trainText, setTrainText] = useState('');
  const [trainTextTitle, setTrainTextTitle] = useState('');
  const [trainTextFolder, setTrainTextFolder] = useState('');
  const [trainFileFolder, setTrainFileFolder] = useState('');
  const [trainingText, setTrainingText] = useState(false);

  // Bulk selection for moving many materials at once.
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMoving, setBulkMoving] = useState(false);

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function bulkMove(target: string | null) {
    if (selectedIds.size === 0) return;
    setBulkMoving(true);
    setError(null);
    try {
      const results = await Promise.all(
        Array.from(selectedIds).map((id) =>
          fetch(`/api/training-videos/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folder: target }),
          }),
        ),
      );
      const failed = results.filter((r) => !r.ok).length;
      if (failed > 0) {
        throw new Error(`${failed} 件の移動に失敗しました`);
      }
      await load();
      clearSelection();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBulkMoving(false);
    }
  }

  async function renameFolder(from: string, to: string) {
    setError(null);
    try {
      const res = await fetch(`/api/avatars/${avatarId}/folders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      // Follow the renamed folder so the filter stays in sync.
      if (activeFolder === from) setActiveFolder(to);
      setFolderDrafts((s) => {
        const next = new Set(s);
        next.delete(from);
        next.add(to);
        return next;
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function deleteFolder(name: string) {
    setError(null);
    try {
      const res = await fetch(`/api/avatars/${avatarId}/folders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: name, to: null }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      if (activeFolder === name) setActiveFolder(UNFILED);
      setFolderDrafts((s) => {
        const next = new Set(s);
        next.delete(name);
        return next;
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // Ad-hoc folder creation from the sidebar.
  const [newFolder, setNewFolder] = useState('');
  const [addingFolder, setAddingFolder] = useState(false);
  const [folderDrafts, setFolderDrafts] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const res = await fetch(`/api/avatars/${avatarId}`, { cache: 'no-store' });
    const json = (await res.json()) as DetailResponse & { error?: string };
    if (!res.ok) {
      setError(json.error || `HTTP ${res.status}`);
      return;
    }
    setData(json);
  }, [avatarId]);

  useEffect(() => {
    load().catch((e) =>
      setError(e instanceof Error ? e.message : String(e)),
    );
  }, [load]);

  // Build folder list with counts, plus the "all" and "unfiled" buckets.
  const folders = useMemo(() => {
    const items = data?.training_videos ?? [];
    const counts = new Map<string, number>();
    for (const m of items) {
      const key = m.folder?.trim() || UNFILED;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    // Include any in-progress drafts so an empty new folder still renders.
    for (const f of folderDrafts) {
      if (!counts.has(f)) counts.set(f, 0);
    }
    const named = Array.from(counts.entries())
      .filter(([k]) => k !== UNFILED)
      .sort((a, b) => a[0].localeCompare(b[0], 'ja'));
    return {
      all: items.length,
      unfiled: counts.get(UNFILED) ?? 0,
      named,
    };
  }, [data, folderDrafts]);

  const visibleMaterials = useMemo(() => {
    const items = data?.training_videos ?? [];
    const filtered = items.filter((m) => {
      if (activeFolder === '__all__') {
        // nothing else
      } else if (activeFolder === UNFILED) {
        if (m.folder?.trim()) return false;
      } else {
        if ((m.folder ?? '').trim() !== activeFolder) return false;
      }
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return (
        (m.file_name ?? '').toLowerCase().includes(q) ||
        (m.summary ?? '').toLowerCase().includes(q) ||
        (m.transcript ?? '').toLowerCase().includes(q)
      );
    });
    return filtered;
  }, [data, activeFolder, search]);

  async function addVideo(e: React.FormEvent) {
    e.preventDefault();
    if (!trainFile) return;
    const form = new FormData();
    form.append('video', trainFile);
    setTraining(true);
    setError(null);
    try {
      const res = await fetch(`/api/avatars/${avatarId}/train`, {
        method: 'POST',
        body: form,
      });
      const json = (await res.json()) as { video_id?: string; error?: string };
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      const folder = trainFileFolder.trim();
      if (folder && json.video_id) {
        await fetch(`/api/training-videos/${json.video_id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folder }),
        });
      }
      setTrainFile(null);
      setTrainFileFolder('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTraining(false);
    }
  }

  async function addText(e: React.FormEvent) {
    e.preventDefault();
    if (!trainText.trim()) return;
    setTrainingText(true);
    setError(null);
    try {
      const res = await fetch(`/api/avatars/${avatarId}/train-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: trainText,
          title: trainTextTitle.trim() || undefined,
        }),
      });
      const json = (await res.json()) as { id?: string; error?: string };
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      const folder = trainTextFolder.trim();
      if (folder && json.id) {
        await fetch(`/api/training-videos/${json.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folder }),
        });
      }
      setTrainText('');
      setTrainTextTitle('');
      setTrainTextFolder('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTrainingText(false);
    }
  }

  function commitNewFolder() {
    const name = newFolder.trim();
    if (!name) {
      setAddingFolder(false);
      return;
    }
    setFolderDrafts((s) => new Set(s).add(name));
    setActiveFolder(name);
    setNewFolder('');
    setAddingFolder(false);
  }

  if (error && !data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 anim-fade-in">
        エラー: {error}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="text-sm text-neutral-400">読み込み中…</div>
    );
  }

  const folderOptions = folders.named.map(([name]) => name);

  return (
    <div className="space-y-6">
      <Link
        href={`/avatars/${avatarId}`}
        className="inline-flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-900"
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
        {data.avatar.name} の会話画面へ戻る
      </Link>

      <header className="flex items-center gap-4 rounded-2xl border border-neutral-200 bg-gradient-to-br from-white to-neutral-50 p-4 shadow-sm">
        <div className="h-12 w-12 overflow-hidden rounded-full bg-neutral-100 ring-2 ring-white shadow">
          {data.avatar.cover_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.avatar.cover_url}
              alt={data.avatar.name}
              className="h-full w-full object-cover"
            />
          ) : null}
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            {data.avatar.name} の学習素材
          </h1>
          <p className="text-xs text-neutral-500">
            合計 {folders.all} 件 ・{' '}
            フォルダ {folders.named.length} 個 ・{' '}
            未分類 {folders.unfiled} 件
          </p>
        </div>
      </header>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 anim-fade-in">
          {error}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-4">
        {/* Sidebar */}
        <aside className="space-y-4 md:col-span-1">
          <div className="rounded-2xl border border-neutral-200 bg-white p-3">
            <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-neutral-400">
              フォルダ
            </p>
            <ul className="mt-1 space-y-0.5">
              <FolderRow
                label="すべて"
                count={folders.all}
                active={activeFolder === '__all__'}
                onClick={() => setActiveFolder('__all__')}
              />
              <FolderRow
                label="未分類"
                count={folders.unfiled}
                active={activeFolder === UNFILED}
                onClick={() => setActiveFolder(UNFILED)}
              />
              {folders.named.map(([name, count]) => (
                <FolderRow
                  key={name}
                  label={name}
                  count={count}
                  active={activeFolder === name}
                  onClick={() => setActiveFolder(name)}
                  onRename={(next) => renameFolder(name, next)}
                  onDelete={() => deleteFolder(name)}
                />
              ))}
            </ul>

            <div className="mt-2 border-t border-neutral-100 pt-2">
              {addingFolder ? (
                <div className="flex items-center gap-1.5 px-1">
                  <input
                    autoFocus
                    value={newFolder}
                    onChange={(e) => setNewFolder(e.target.value)}
                    onBlur={commitNewFolder}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitNewFolder();
                      } else if (e.key === 'Escape') {
                        setNewFolder('');
                        setAddingFolder(false);
                      }
                    }}
                    placeholder="フォルダ名"
                    className="flex-1 rounded-md border border-neutral-300 px-2 py-1 text-xs focus:border-neutral-900 focus:outline-none"
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingFolder(true)}
                  className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900"
                >
                  + 新規フォルダ
                </button>
              )}
            </div>
          </div>
        </aside>

        {/* Main */}
        <div className="space-y-4 md:col-span-3">
          {/* Add-new card */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-neutral-900">
                  新しい学習素材を追加
                </h2>
                <p className="mt-0.5 text-[11px] text-neutral-500">
                  追加先のフォルダを指定できます。空欄なら未分類になります。
                </p>
              </div>
              <div className="flex rounded-full bg-neutral-100 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setMode('text')}
                  className={`rounded-full px-3 py-1 transition ${
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
                  className={`rounded-full px-3 py-1 transition ${
                    mode === 'video'
                      ? 'bg-white text-neutral-900 shadow-sm'
                      : 'text-neutral-500 hover:text-neutral-900'
                  }`}
                >
                  動画
                </button>
              </div>
            </div>

            {mode === 'text' ? (
              <form onSubmit={addText} className="mt-4 space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <input
                    type="text"
                    value={trainTextTitle}
                    onChange={(e) => setTrainTextTitle(e.target.value)}
                    placeholder="タイトル(任意)"
                    className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs focus:border-neutral-900 focus:outline-none"
                  />
                  <FolderPicker
                    value={trainTextFolder}
                    options={folderOptions}
                    activeFolder={
                      activeFolder !== '__all__' && activeFolder !== UNFILED
                        ? activeFolder
                        : ''
                    }
                    onChange={setTrainTextFolder}
                  />
                </div>
                <textarea
                  value={trainText}
                  onChange={(e) => setTrainText(e.target.value)}
                  rows={6}
                  placeholder={`${data.avatar.name} の考え方や知識を貼り付け…`}
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs leading-relaxed focus:border-neutral-900 focus:outline-none"
                />
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-neutral-400">
                    {trainText.length.toLocaleString()} 文字
                  </span>
                  <button
                    type="submit"
                    disabled={!trainText.trim() || trainingText}
                    className="rounded-full bg-neutral-900 px-4 py-2 text-xs font-medium text-white transition hover:bg-neutral-700 disabled:opacity-40"
                  >
                    {trainingText ? '学習中…' : 'テキストから学習'}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={addVideo} className="mt-4 space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <input
                    type="file"
                    accept="video/*"
                    onChange={(e) => setTrainFile(e.target.files?.[0] ?? null)}
                    className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs file:mr-3 file:rounded-md file:border-0 file:bg-neutral-900 file:px-3 file:py-1 file:text-white"
                  />
                  <FolderPicker
                    value={trainFileFolder}
                    options={folderOptions}
                    activeFolder={
                      activeFolder !== '__all__' && activeFolder !== UNFILED
                        ? activeFolder
                        : ''
                    }
                    onChange={setTrainFileFolder}
                  />
                </div>
                <button
                  type="submit"
                  disabled={!trainFile || training}
                  className="rounded-full bg-neutral-900 px-4 py-2 text-xs font-medium text-white transition hover:bg-neutral-700 disabled:opacity-40"
                >
                  {training ? '学習中…' : '動画から学習'}
                </button>
              </form>
            )}
          </div>

          {/* Filter row */}
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="素材を検索(タイトル・本文)"
              className="flex-1 rounded-full border border-neutral-300 bg-white px-4 py-2 text-xs focus:border-neutral-900 focus:outline-none"
            />
            <span className="text-[11px] text-neutral-500">
              {visibleMaterials.length} 件表示
            </span>
            <button
              type="button"
              onClick={() => {
                setSelectionMode((s) => !s);
                clearSelection();
              }}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                selectionMode
                  ? 'bg-neutral-900 text-white hover:bg-neutral-700'
                  : 'border border-neutral-300 bg-white text-neutral-700 hover:border-neutral-900'
              }`}
            >
              {selectionMode ? '選択モード解除' : '選択して一括移動'}
            </button>
          </div>

          {/* Bulk-action bar (appears when one or more cards are selected) */}
          {selectionMode && selectedIds.size > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-neutral-900 bg-neutral-900 px-4 py-2 text-white anim-fade-in">
              <span className="text-xs">{selectedIds.size} 件選択中</span>
              <div className="flex flex-wrap items-center gap-2">
                <BulkFolderPicker
                  options={folderOptions}
                  disabled={bulkMoving}
                  onMove={bulkMove}
                />
                <button
                  type="button"
                  onClick={() => bulkMove(null)}
                  disabled={bulkMoving}
                  className="rounded-full bg-white/15 px-3 py-1 text-[11px] font-medium transition hover:bg-white/25 disabled:opacity-40"
                >
                  未分類へ
                </button>
                <button
                  type="button"
                  onClick={clearSelection}
                  disabled={bulkMoving}
                  className="rounded-full bg-white/0 px-3 py-1 text-[11px] underline-offset-2 transition hover:underline disabled:opacity-40"
                >
                  選択解除
                </button>
              </div>
            </div>
          )}

          {/* Material grid */}
          {visibleMaterials.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-12 text-center">
              <p className="text-sm text-neutral-500">
                該当する素材がありません。
              </p>
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-3 anim-stagger sm:grid-cols-2">
              {visibleMaterials.map((m) => (
                <MaterialCard
                  key={m.id}
                  material={m}
                  folderOptions={folderOptions}
                  selectionMode={selectionMode}
                  selected={selectedIds.has(m.id)}
                  onToggleSelected={() => toggleSelected(m.id)}
                  onReload={load}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function FolderRow({
  label,
  count,
  active,
  onClick,
  // Optional management callbacks; only passed for named folders.
  onRename,
  onDelete,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  onRename?: (next: string) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(label);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  if (renaming && onRename) {
    return (
      <li>
        <div className="flex items-center gap-1.5 rounded-md bg-neutral-100 px-1.5 py-1">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              if (draft.trim() && draft.trim() !== label) {
                void onRename(draft.trim());
              }
              setRenaming(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (draft.trim() && draft.trim() !== label) {
                  void onRename(draft.trim());
                }
                setRenaming(false);
              } else if (e.key === 'Escape') {
                setDraft(label);
                setRenaming(false);
              }
            }}
            className="flex-1 rounded-md border border-neutral-300 px-2 py-1 text-xs focus:border-neutral-900 focus:outline-none"
          />
        </div>
      </li>
    );
  }

  return (
    <li>
      <div
        className={`group flex w-full items-center justify-between rounded-md text-xs transition ${
          active
            ? 'bg-neutral-900 text-white'
            : 'text-neutral-700 hover:bg-neutral-100'
        }`}
      >
        <button
          type="button"
          onClick={onClick}
          className="min-w-0 flex-1 truncate px-2 py-1.5 text-left"
        >
          📁 {label}
        </button>
        <div className="flex shrink-0 items-center gap-1 pr-1">
          <span
            className={`shrink-0 rounded-full px-1.5 text-[10px] ${
              active
                ? 'bg-white/20 text-white'
                : 'bg-neutral-100 text-neutral-500'
            }`}
          >
            {count}
          </span>
          {(onRename || onDelete) && (
            <>
              <button
                ref={buttonRef}
                type="button"
                aria-label={`${label} の操作`}
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen((o) => !o);
                }}
                className={`grid h-5 w-5 place-items-center rounded-full transition ${
                  active
                    ? 'text-white/70 hover:bg-white/15'
                    : 'text-neutral-400 opacity-0 hover:bg-neutral-200 hover:text-neutral-900 group-hover:opacity-100'
                }`}
              >
                <svg width="11" height="11" viewBox="0 0 14 14" aria-hidden>
                  <circle cx="3" cy="7" r="1.1" fill="currentColor" />
                  <circle cx="7" cy="7" r="1.1" fill="currentColor" />
                  <circle cx="11" cy="7" r="1.1" fill="currentColor" />
                </svg>
              </button>
              <PortalMenu
                anchorRef={buttonRef}
                open={menuOpen}
                onClose={() => setMenuOpen(false)}
                align="end"
                width={160}
              >
                {onRename && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setDraft(label);
                      setRenaming(true);
                    }}
                    className="block w-full px-3 py-2 text-left text-xs text-neutral-700 transition hover:bg-neutral-50"
                  >
                    名前を変更
                  </button>
                )}
                {onDelete && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setConfirmingDelete(true);
                    }}
                    className="block w-full px-3 py-2 text-left text-xs text-red-700 transition hover:bg-red-50"
                  >
                    フォルダを削除
                  </button>
                )}
              </PortalMenu>
            </>
          )}
        </div>
      </div>
      {confirmingDelete && onDelete && (
        <div className="mt-1 space-y-2 rounded-md border border-red-200 bg-red-50 p-2 text-[11px] text-red-800 anim-fade-in">
          <p>
            「{label}」フォルダを削除します。
            <br />
            (中の素材は未分類に戻ります)
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="rounded-full bg-white px-2.5 py-1 text-[10px] text-neutral-700"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={async () => {
                await onDelete();
                setConfirmingDelete(false);
              }}
              className="rounded-full bg-red-600 px-2.5 py-1 text-[10px] font-medium text-white hover:bg-red-500"
            >
              削除する
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function FolderPicker({
  value,
  options,
  activeFolder,
  onChange,
}: {
  value: string;
  options: string[];
  activeFolder: string;
  onChange: (v: string) => void;
}) {
  // If user hasn't chosen explicitly and they're already filtering by a
  // folder, default to that one.
  useEffect(() => {
    if (!value && activeFolder) onChange(activeFolder);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFolder]);

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-neutral-400">フォルダ</span>
      <input
        list="folder-options"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="未分類"
        className="flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs focus:border-neutral-900 focus:outline-none"
      />
      <datalist id="folder-options">
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </div>
  );
}

function MaterialCard({
  material,
  folderOptions,
  selectionMode = false,
  selected = false,
  onToggleSelected,
  onReload,
}: {
  material: Material;
  folderOptions: string[];
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelected?: () => void;
  onReload: () => Promise<void> | void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState(material.file_name ?? '');
  const [transcript, setTranscript] = useState(material.transcript ?? '');
  const [folder, setFolder] = useState(material.folder ?? '');
  const [movePickerOpen, setMovePickerOpen] = useState(false);
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
        body: JSON.stringify({
          file_name: title,
          transcript,
          folder: folder.trim() || null,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setMode('view');
      await onReload();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function quickMoveFolder(next: string | null) {
    setError(null);
    try {
      const res = await fetch(`/api/training-videos/${material.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder: next }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      await onReload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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
      await onReload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setDeleting(false);
    }
  }

  if (removed) return null;

  if (mode === 'edit') {
    return (
      <li className="rounded-xl border border-neutral-300 bg-white p-4 anim-fade-in">
        <div className="space-y-3">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="タイトル"
            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
          />
          <FolderPicker
            value={folder}
            activeFolder=""
            options={folderOptions}
            onChange={setFolder}
          />
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={8}
            placeholder="本文・文字起こし"
            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm leading-relaxed focus:border-neutral-900 focus:outline-none"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setMode('view')}
              disabled={saving}
              className="rounded-full border border-neutral-300 px-3 py-1.5 text-xs text-neutral-700 hover:border-neutral-900"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-full bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
            >
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li
      className={`relative rounded-xl border bg-white p-4 transition ${
        selected
          ? 'border-neutral-900 ring-2 ring-neutral-900/10'
          : 'border-neutral-200'
      } ${deleting ? 'anim-fade-out' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        {selectionMode && (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelected}
            aria-label="この素材を選択"
            className="mt-1 h-4 w-4 shrink-0 accent-neutral-900"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ${
                isText
                  ? 'bg-amber-50 text-amber-700 ring-amber-200'
                  : 'bg-sky-50 text-sky-700 ring-sky-200'
              }`}
            >
              {isText ? 'テキスト' : '動画'}
            </span>
            <FolderQuickMenu
              current={material.folder}
              options={folderOptions}
              onChange={quickMoveFolder}
              forceOpen={movePickerOpen}
              onForceClose={() => setMovePickerOpen(false)}
            />
          </div>
          <p className="mt-1.5 truncate text-sm font-medium text-neutral-900">
            {material.file_name ?? material.id}
          </p>
          {material.summary && !expanded && (
            <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-neutral-500">
              {material.summary}
            </p>
          )}
        </div>
        <CardMenu
          onMove={() => setMovePickerOpen(true)}
          onEdit={() => setMode('edit')}
          onDelete={() => setConfirmDelete(true)}
        />
      </div>

      {material.transcript && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-[11px] text-neutral-500 transition hover:text-neutral-900"
        >
          {expanded ? '本文を閉じる' : '本文を見る'}
        </button>
      )}

      {expanded && material.transcript && (
        <p className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs leading-relaxed text-neutral-700 anim-fade-in">
          {material.transcript}
        </p>
      )}

      {confirmDelete && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 anim-fade-in">
          <span>この素材を削除します。元に戻せません。</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              disabled={deleting}
              className="rounded-full bg-white px-3 py-1 text-[11px] text-neutral-700"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={doDelete}
              disabled={deleting}
              className="rounded-full bg-red-600 px-3 py-1 text-[11px] font-medium text-white hover:bg-red-500 disabled:opacity-50"
            >
              {deleting ? '削除中…' : '削除する'}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-2 text-[11px] text-red-600">{error}</p>
      )}
    </li>
  );
}

function FolderQuickMenu({
  current,
  options,
  onChange,
  forceOpen,
  onForceClose,
}: {
  current: string | null;
  options: string[];
  onChange: (next: string | null) => void;
  forceOpen?: boolean;
  onForceClose?: () => void;
}) {
  const [openSelf, setOpenSelf] = useState(false);
  const open = openSelf || !!forceOpen;
  const setOpen = (next: boolean) => {
    setOpenSelf(next);
    if (!next) onForceClose?.();
  };
  const [draft, setDraft] = useState('');
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(!open)}
        title="クリックでフォルダを変更"
        className="inline-flex items-center gap-1 rounded-full border border-neutral-300 bg-white px-2 py-0.5 text-[11px] font-medium text-neutral-700 transition hover:border-neutral-900 hover:bg-neutral-50"
      >
        📁 {current?.trim() || '未分類'}
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
        width={208}
      >
        <button
          type="button"
          onClick={() => {
            onChange(null);
            setOpen(false);
          }}
          className="block w-full px-3 py-2 text-left text-xs text-neutral-700 hover:bg-neutral-50"
        >
          📁 未分類へ
        </button>
        <div className="border-t border-neutral-100">
          {options.length === 0 && (
            <p className="px-3 py-2 text-[11px] text-neutral-400">
              既存フォルダなし
            </p>
          )}
          {options.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => {
                onChange(o);
                setOpen(false);
              }}
              className={`block w-full truncate px-3 py-2 text-left text-xs transition hover:bg-neutral-50 ${
                o === current ? 'font-medium text-neutral-900' : 'text-neutral-700'
              }`}
            >
              📁 {o}
            </button>
          ))}
        </div>
        <div className="border-t border-neutral-100 p-2">
          <div className="flex items-center gap-1">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && draft.trim()) {
                  onChange(draft.trim());
                  setDraft('');
                  setOpen(false);
                }
              }}
              placeholder="新規フォルダ名"
              className="flex-1 rounded-md border border-neutral-300 px-2 py-1 text-[11px] focus:border-neutral-900 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => {
                if (draft.trim()) {
                  onChange(draft.trim());
                  setDraft('');
                  setOpen(false);
                }
              }}
              className="rounded-md bg-neutral-900 px-2 py-1 text-[11px] font-medium text-white hover:bg-neutral-700"
            >
              追加
            </button>
          </div>
        </div>
      </PortalMenu>
    </>
  );
}

function BulkFolderPicker({
  options,
  disabled,
  onMove,
}: {
  options: string[];
  disabled?: boolean;
  onMove: (target: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="rounded-full bg-white px-3 py-1 text-[11px] font-medium text-neutral-900 transition hover:bg-white/90 disabled:opacity-40"
      >
        フォルダへ移動 ▾
      </button>
      <PortalMenu
        anchorRef={buttonRef}
        open={open}
        onClose={() => setOpen(false)}
        align="end"
        width={224}
      >
        <div>
          {options.length === 0 && (
            <p className="px-3 py-2 text-[11px] text-neutral-400">
              既存フォルダなし
            </p>
          )}
          {options.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => {
                onMove(o);
                setOpen(false);
              }}
              className="block w-full truncate px-3 py-2 text-left text-xs text-neutral-700 transition hover:bg-neutral-50"
            >
              📁 {o}
            </button>
          ))}
        </div>
        <div className="border-t border-neutral-100 p-2">
          <div className="flex items-center gap-1">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && draft.trim()) {
                  onMove(draft.trim());
                  setDraft('');
                  setOpen(false);
                }
              }}
              placeholder="新規フォルダ"
              className="flex-1 rounded-md border border-neutral-300 px-2 py-1 text-[11px] focus:border-neutral-900 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => {
                if (draft.trim()) {
                  onMove(draft.trim());
                  setDraft('');
                  setOpen(false);
                }
              }}
              className="rounded-md bg-neutral-900 px-2 py-1 text-[11px] font-medium text-white hover:bg-neutral-700"
            >
              追加
            </button>
          </div>
        </div>
      </PortalMenu>
    </>
  );
}

function CardMenu({
  onEdit,
  onDelete,
  onMove,
}: {
  onEdit: () => void;
  onDelete: () => void;
  onMove?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="shrink-0">
      <button
        ref={buttonRef}
        type="button"
        aria-label="素材の操作メニュー"
        onClick={() => setOpen((o) => !o)}
        className="grid h-7 w-7 place-items-center rounded-full text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
          <circle cx="3" cy="7" r="1.2" fill="currentColor" />
          <circle cx="7" cy="7" r="1.2" fill="currentColor" />
          <circle cx="11" cy="7" r="1.2" fill="currentColor" />
        </svg>
      </button>
      <PortalMenu
        anchorRef={buttonRef}
        open={open}
        onClose={() => setOpen(false)}
        align="end"
        width={160}
      >
        {onMove && (
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onMove();
            }}
            className="block w-full px-3 py-2 text-left text-xs text-neutral-700 transition hover:bg-neutral-50"
          >
            📁 フォルダを移動
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            onEdit();
          }}
          className="block w-full px-3 py-2 text-left text-xs text-neutral-700 transition hover:bg-neutral-50"
        >
          編集
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            onDelete();
          }}
          className="block w-full px-3 py-2 text-left text-xs text-red-700 transition hover:bg-red-50"
        >
          削除
        </button>
      </PortalMenu>
    </div>
  );
}
