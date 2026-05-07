import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { videoProjectId, mode = "speed" } = await req.json();

    const project = await base44.asServiceRole.entities.VideoProject.get(videoProjectId);

    if (!project) {
      return Response.json({ error: "VideoProject not found" }, { status: 404 });
    }

    if (!project.videoFileUri || !project.audioFileUri) {
      return Response.json(
        { error: "Both videoFileUri and audioFileUri are required." },
        { status: 400 }
      );
    }

    // 会社情報とプラン取得
    const company = await base44.asServiceRole.entities.ClientCompany.get(project.clientCompanyId);
    const planName = company?.planName || "Light";

    // プラン別リップシンク月間上限
    const PLAN_LIMITS = {
      Light: 0,
      Standard: 600,
      Professional: 1800,
      Enterprise: null,
    };

    const monthlyLimit = PLAN_LIMITS[planName];

    // Lightプランでブロック
    if (monthlyLimit === 0) {
      await base44.asServiceRole.entities.VideoProject.update(videoProjectId, {
        status: "failed",
        errorMessage: "動画生成上限を超過しています",
      });
      return Response.json({
        error: "Feature not available",
        message: "リップシンク生成はLightプランでは利用できません。上位プランへのアップグレードをお願いします。",
        limitExceeded: true,
      }, { status: 403 });
    }

    // 当月の使用秒数をカウント
    const currentMonth = new Date().toISOString().slice(0, 7);
    const usageRecords = await base44.asServiceRole.entities.UsageRecord.filter({
      clientCompanyId: project.clientCompanyId,
      usageType: "lipsync",
    }).then(records => records.filter(r => r.created_date?.startsWith(currentMonth)));

    const totalUsedSeconds = usageRecords.reduce((sum, r) => sum + (r.units || 0), 0);
    const requestedSeconds = project.durationSeconds || 0;

    // 上限チェック（Enterpriseは無制限）
    if (monthlyLimit !== null && totalUsedSeconds + requestedSeconds > monthlyLimit) {
      await base44.asServiceRole.entities.VideoProject.update(videoProjectId, {
        status: "failed",
        errorMessage: "動画生成上限を超過しています",
      });
      return Response.json({
        error: "Usage limit exceeded",
        message: `月間リップシンク生成上限（${monthlyLimit}秒）を超過します。`,
        limitExceeded: true,
      }, { status: 429 });
    }

    const { signed_url: videoUrl } = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
      file_uri: project.videoFileUri,
      expires_in: 86400,
    });

    const { signed_url: audioUrl } = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
      file_uri: project.audioFileUri,
      expires_in: 86400,
    });

    const heygenApiKey = Deno.env.get("HEYGEN_API_KEY");

    if (!heygenApiKey) {
      return Response.json({ error: "HEYGEN_API_KEY is not set" }, { status: 500 });
    }

    const heygenRes = await fetch("https://api.heygen.com/v3/lipsyncs", {
      method: "POST",
      headers: {
        "X-Api-Key": heygenApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        video: { type: "url", url: videoUrl },
        audio: { type: "url", url: audioUrl },
        mode,
        title: project.title || "CompanyBrain AI Lipsync",
        enable_dynamic_duration: true,
        enable_speech_enhancement: true,
      }),
    });

    if (!heygenRes.ok) {
      const errorText = await heygenRes.text();
      await base44.asServiceRole.entities.VideoProject.update(videoProjectId, {
        status: "failed",
        errorMessage: errorText,
      });
      return Response.json({ error: "HeyGen error", detail: errorText }, { status: 500 });
    }

    const data = await heygenRes.json();
    const jobId = data.lipsync_id || data.id || data.data?.lipsync_id || data.data?.id;

    await base44.asServiceRole.entities.VideoProject.update(videoProjectId, {
      heygenJobId: jobId,
      lipsyncMode: mode,
      status: "processing",
    });

    // UsageRecordに記録（HeyGen APIを呼び出す前に利用制限チェック済み）
    await base44.asServiceRole.entities.UsageRecord.create({
      clientCompanyId: project.clientCompanyId,
      usageType: "lipsync",
      provider: "heygen",
      units: requestedSeconds,
      unitName: "seconds",
      estimatedCostUsd: 0,
      metadata: JSON.stringify({ videoProjectId, mode, jobId }),
    });

    return Response.json({ heygenJobId: jobId, raw: data });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});