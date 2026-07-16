import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { understandMaterial } from '@/lib/gemini';
import { saveExtractedRules } from '@/lib/materialRules';
import { authorizeAvatar } from '@/lib/authServer';
import { enforceRateLimit } from '@/lib/rateLimit';
import { reportError } from '@/lib/errorReport';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * 既存の学習素材を再解析する。文字起こし済みのテキストに対して
 * 「理解」(要約+振る舞いルールの抽出)をやり直し、結果を保存する。
 *
 * 理解機能の導入前に学習された素材にルール抽出を効かせるための
 * 後方互換ルート。再アップロードや再文字起こしは行わない。
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const db = supabaseAdmin();

  const { data: existing, error: getErr } = await db
    .from('training_videos')
    .select('id, avatar_id, transcript, status')
    .eq('id', params.id)
    .single();
  if (getErr || !existing) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  // Only the owner of the parent brain may reanalyze its material.
  const auth = await authorizeAvatar(existing.avatar_id as string, { requireOwner: true });
  if (!auth.ok) {
    return NextResponse.json({ error: 'forbidden' }, { status: auth.status });
  }
  // 依頼で作成されたブレインは素材ロック(内容の変更不可)。再解析は
  // summary と extracted_rules(=毎回注入される振る舞い)を書き換える
  // ため、train / train-text / uploads と同じくここでも拒否する。
  if (auth.fromRequest) {
    return NextResponse.json(
      {
        error: '依頼で作成されたブレインの素材は変更できません。',
        code: 'request_brain_locked',
      },
      { status: 403 },
    );
  }
  const limited = enforceRateLimit(`reanalyze:${auth.me.email}`, 10, 60_000);
  if (limited) return limited;

  const transcript =
    typeof existing.transcript === 'string' ? existing.transcript.trim() : '';
  if (!transcript) {
    return NextResponse.json(
      { error: 'この素材には解析できる本文がありません。' },
      { status: 400 },
    );
  }

  try {
    const understood = await understandMaterial(transcript);
    if (understood.summary) {
      const { error: sumErr } = await db
        .from('training_videos')
        .update({ summary: understood.summary })
        .eq('id', params.id);
      if (sumErr) {
        throw new Error(`要約の保存に失敗しました: ${sumErr.message}`);
      }
    }
    const rulesSaved = await saveExtractedRules(
      params.id as string,
      understood.rules,
    );
    if (!rulesSaved && understood.rules.length > 0) {
      // 列が無い(0023 未適用)環境では「成功したのに何も変わらない」
      // という見え方になるため、正直にエラーとして返す。
      return NextResponse.json(
        {
          error:
            'ルールを保存できませんでした(データベース更新 0023 が未適用の可能性があります)。',
        },
        { status: 500 },
      );
    }
    revalidatePath(`/avatars/${existing.avatar_id}`);
    return NextResponse.json({
      summary: understood.summary,
      rules: understood.rules,
    });
  } catch (e) {
    reportError(e, {
      route: 'POST /api/training-videos/[id]/reanalyze',
      actor: auth.me.email,
    });
    return NextResponse.json(
      { error: '再解析に失敗しました。時間をおいてもう一度お試しください。' },
      { status: 500 },
    );
  }
}
