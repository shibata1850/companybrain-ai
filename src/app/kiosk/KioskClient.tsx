'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import StreamingStage, {
  type StageState,
  type StreamingStageHandle,
  type TranscriptMessage,
} from '@/components/StreamingStage';
import KotonohaStage, {
  type KotonohaFinish,
} from '@/components/KotonohaStage';
import OrbStage from '@/components/OrbStage';

/**
 * キオスク(公開ディスプレイ)画面。LEDビジョン・店頭サイネージ用。
 *
 * 見た目は「コトノハ」演出(学習した文字たちの銀河)に一本化した。
 * 音声セッションは StreamingStage の headless モードが裏で駆動し、
 * この画面は状態を受け取って KotonohaStage に流すだけ。
 *
 * - URL の ?k=<アクセスキー> とサーバー環境変数の照合だけで動く
 *   (ログイン画面を出さない。会話できるのは環境変数で固定された
 *   1ブレインのみ)
 * - 待機ループ(文字の銀河+縦書きの問いかけ)→ タッチで会話開始 →
 *   無音が続くと自動終了して待機へ戻る、の無人運転
 * - 会話は actor「kiosk」として監査ログへ記録する。現地に
 *   「会話は記録されます」の掲示を併用すること
 *
 * URL パラメータ(?k= 以外は省略可):
 *   look=orb|sumi|dot  仕上げ。オーブ(ガラス球・既定)/ 墨 / ドット(8bit)
 *   brand=…         左上の催事名(既定: NEXT GEN AI SCHOOL)
 *   foot=…          下部の案内(会場・開始日など。記録告知は常に付く)
 *   c=…             銀河の核になる一文字(既定: ブレイン名の名の頭文字)
 *   q=…|…|…        待機中の縦書き問いかけ(| 区切りで差し替え)
 *   demo=1          リハーサルモード。キー・API・音声なしで演出だけを
 *                   自動再生する(現地の映り確認・社内プレビュー用)
 */

const AUTO_END_SILENCE_MS = 45_000;

/** 待機中にローテーションする問いかけ(?q= で差し替え可)。 */
const DEFAULT_QUESTIONS = [
  '「AIって、なに?」',
  '「何を持ち帰れるの?」',
  '「あなたは人間?」',
];

/** リハーサルモード用の語彙(本番は学習素材から自動抽出)。 */
const DEMO_WORDS = [
  '学', '問', '声', '知', '手', '作', '話', '言', '葉', '考',
  '答', '数', '図', '工', '規', '程', '桜', '駅', '川', '北',
  '上', '岩', '未', '来', '仕', '組', '道', '具', 'AI',
  '展勝地', '鬼剣舞', '北上川', 'つまずき', '定時',
];

/** リハーサルモードで自動再生する会話(表示のみ・音は出ない)。 */
const DEMO_TURNS = [
  {
    q: '「このスクール、誰でも通えるんですか?」',
    a: '学生、社会人、企業の方。パソコンが苦手でも、少人数で進めるから大丈夫です。',
  },
  {
    q: '「あなたは人間ですか?」',
    a: 'AIです。SOFTDOINGのAI社員、北上綾といいます。',
  },
];

/** 会話画面(コトノハの conv モード)を出す状態。 */
const CONV_STATUSES: ReadonlySet<StageState['status']> = new Set([
  'connecting',
  'reconnecting',
  'connected',
  'listening',
  'thinking',
  'searching',
  'speaking',
]);

type KioskAvatar = {
  id: string;
  name: string;
  description: string | null;
  cover_url: string | null;
};

function newSessionId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `k_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 全画面オーバーレイを document.body 直下に描く。アプリのレイアウトは
 * PageTransition(transform 祖先)で包まれており、その中の `fixed` は
 * 潰れて表示されない(AvatarScene と同じ既知問題)ため、ポータルで
 * レイアウトの外に出す。
 */
function FullScreen({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

/**
 * ブレイン名から銀河の核になる一文字を導く。「北上 綾」のような
 * 姓名なら名の頭文字(綾)、空白が無ければ先頭の一文字。
 */
function deriveCoreChar(name: string): string {
  const parts = name.trim().split(/\s+/);
  const given = parts[parts.length - 1] || name.trim();
  return [...given][0] ?? '脳';
}

export default function KioskClient() {
  const params = useSearchParams();
  const kioskKey = params.get('k') || '';
  const isDemo = params.get('demo') === '1';
  // 仕上げ: オーブ(Apple風のガラス球)が既定。墨/ドットはコトノハ演出。
  const lookParam = params.get('look');
  const look: 'orb' | KotonohaFinish =
    lookParam === 'sumi' || lookParam === 'dot' ? lookParam : 'orb';
  const brand = params.get('brand') ?? 'NEXT GEN AI SCHOOL';
  const footParam = params.get('foot');
  const foot = footParam
    ? `${footParam} ・ 会話は記録されます`
    : '会話は記録されます';
  const qParam = params.get('q');
  const questions = useMemo(() => {
    const list = (qParam ?? '')
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean);
    return list.length > 0 ? list : DEFAULT_QUESTIONS;
  }, [qParam]);

  const [avatar, setAvatar] = useState<KioskAvatar | null>(null);
  const [glyphs, setGlyphs] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const stageRef = useRef<StreamingStageHandle>(null);
  const sessionIdRef = useRef<string>(newSessionId());

  // 会話状態(headless の StreamingStage から受け取る)。音量だけは
  // 毎フレーム変わるので ref に逃がし、React の再描画を状態変化と
  // 字幕の更新時に限る(24時間稼働するサイネージの負荷対策)。
  const levelsRef = useRef({ mic: 0, agent: 0 });
  const [stage, setStage] = useState<{
    status: StageState['status'];
    captionUser: string;
    captionAgent: string;
    error: string | null;
  }>({ status: 'idle', captionUser: '', captionAgent: '', error: null });
  const handleStageState = useCallback((s: StageState) => {
    levelsRef.current = { mic: s.micLevel, agent: s.agentLevel };
    setStage((prev) =>
      prev.status === s.status &&
      prev.captionUser === s.captionUser &&
      prev.captionAgent === s.captionAgent &&
      prev.error === s.error
        ? prev
        : {
            status: s.status,
            captionUser: s.captionUser,
            captionAgent: s.captionAgent,
            error: s.error,
          },
    );
  }, []);

  // 表示するブレインの情報(名前・コトノハ語彙)を取得。
  useEffect(() => {
    if (!kioskKey || isDemo) return;
    let cancelled = false;
    fetch(`/api/kiosk/info?k=${encodeURIComponent(kioskKey)}`)
      .then(async (r) => {
        const json = (await r.json()) as {
          avatar?: KioskAvatar;
          glyphs?: string[];
          error?: string;
        };
        if (cancelled) return;
        if (!r.ok || !json.avatar) {
          setLoadError(json.error || `HTTP ${r.status}`);
        } else {
          setAvatar(json.avatar);
          setGlyphs(Array.isArray(json.glyphs) ? json.glyphs : []);
        }
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [kioskKey, isDemo]);

  // 会話の監査記録(確定メッセージごとに送る)。
  const handleMessage = useCallback(
    (m: TranscriptMessage) => {
      void fetch('/api/kiosk/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: kioskKey,
          entries: [
            {
              role: m.role,
              content: m.text,
              session_id: sessionIdRef.current,
            },
          ],
        }),
        keepalive: true,
      }).catch(() => {});
    },
    [kioskKey],
  );

  const handleLiveChange = useCallback((isLive: boolean) => {
    if (isLive) sessionIdRef.current = newSessionId();
  }, []);

  // ---- リハーサル(デモ)モード: 演出だけを自動再生 ----
  const [demo, setDemo] = useState<{
    mode: 'attract' | 'conv';
    status: StageState['status'];
    capUser: string;
    capAgent: string;
  }>({ mode: 'attract', status: 'idle', capUser: '', capAgent: '' });
  useEffect(() => {
    if (!isDemo) return;
    let alive = true;
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms));
    const type = async (
      text: string,
      apply: (s: string) => void,
      cps: number,
    ) => {
      for (let i = 1; i <= text.length && alive; i++) {
        apply(text.slice(0, i));
        await sleep(1000 / cps);
      }
    };
    void (async () => {
      while (alive) {
        setDemo({ mode: 'attract', status: 'idle', capUser: '', capAgent: '' });
        await sleep(10_000);
        for (const turn of DEMO_TURNS) {
          if (!alive) return;
          setDemo({
            mode: 'conv',
            status: 'listening',
            capUser: '',
            capAgent: '',
          });
          await type(turn.q, (s) => setDemo((d) => ({ ...d, capUser: s })), 14);
          if (!alive) return;
          setDemo((d) => ({ ...d, status: 'thinking' }));
          await sleep(1500);
          if (!alive) return;
          setDemo((d) => ({ ...d, status: 'speaking' }));
          await type(
            turn.a,
            (s) => setDemo((d) => ({ ...d, capAgent: s })),
            10,
          );
          await sleep(1500);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [isDemo]);

  if (isDemo) {
    return (
      <FullScreen>
      <div className="fixed inset-0 z-[100] bg-black">
        {look === 'orb' ? (
          <OrbStage
            mode={demo.mode}
            status={demo.status}
            levels={levelsRef}
            captionUser={demo.capUser}
            captionAgent={demo.capAgent}
            questions={questions}
            brand={brand}
            foot={foot}
            onStart={() => {}}
            onEnd={() => {}}
            simulateLevels
          />
        ) : (
          <KotonohaStage
            finish={look}
            mode={demo.mode}
            status={demo.status}
            levels={levelsRef}
            captionUser={demo.capUser}
            captionAgent={demo.capAgent}
            coreChar={params.get('c') || '綾'}
            words={DEMO_WORDS}
            questions={questions}
            brand={brand}
            foot={foot}
            onStart={() => {}}
            onEnd={() => {}}
            simulateLevels
          />
        )}
      </div>
      </FullScreen>
    );
  }

  // 設定・キー不備の案内(スタッフ向け)。
  if (!kioskKey || loadError) {
    return (
      <FullScreen>
        <div className="fixed inset-0 z-[100] grid place-items-center bg-neutral-50 p-8 text-center">
          <div>
            <p className="text-lg font-bold text-neutral-800">
              キオスクを表示できません
            </p>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-neutral-500">
              {!kioskKey
                ? 'URL にアクセスキーが付いていません。管理者が発行したブックマーク(/kiosk?k=…)から開いてください。'
                : `設定を確認してください: ${loadError}`}
            </p>
          </div>
        </div>
      </FullScreen>
    );
  }

  if (!avatar) {
    return (
      <FullScreen>
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black">
          <p className="text-sm text-neutral-500">準備しています…</p>
        </div>
      </FullScreen>
    );
  }

  const mode = CONV_STATUSES.has(stage.status) ? 'conv' : 'attract';

  return (
    <FullScreen>
    <div className="fixed inset-0 z-[100] bg-black">
      {/* 音声セッションの駆動(画面は描かない)。 */}
      <StreamingStage
        ref={stageRef}
        avatarId={avatar.id}
        coverUrl={avatar.cover_url}
        avatarName={avatar.name}
        onMessage={handleMessage}
        kioskKey={kioskKey}
        onLiveChange={handleLiveChange}
        autoEndAfterSilenceMs={AUTO_END_SILENCE_MS}
        headless
        onStageState={handleStageState}
      />
      {look === 'orb' ? (
        <OrbStage
          mode={mode}
          status={stage.status}
          levels={levelsRef}
          captionUser={stage.captionUser}
          captionAgent={stage.captionAgent}
          questions={questions}
          brand={brand}
          foot={foot}
          error={stage.error}
          onStart={() => stageRef.current?.start()}
          onEnd={() => stageRef.current?.stop()}
        />
      ) : (
        <KotonohaStage
          finish={look}
          mode={mode}
          status={stage.status}
          levels={levelsRef}
          captionUser={stage.captionUser}
          captionAgent={stage.captionAgent}
          coreChar={params.get('c') || deriveCoreChar(avatar.name)}
          words={glyphs}
          questions={questions}
          brand={brand}
          foot={foot}
          error={stage.error}
          onStart={() => stageRef.current?.start()}
          onEnd={() => stageRef.current?.stop()}
        />
      )}
    </div>
    </FullScreen>
  );
}
