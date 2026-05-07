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

    // プラン制限チェック
    const PLAN_LIMITS = {
      Light: { videoSecondsLimitMonthly: 0 },
      Standard: { videoSecondsLimitMonthly: 600 },
      Professional: { videoSecondsLimitMonthly: 1800 },
      Enterprise: { videoSecondsLimitMonthly: null },
    };

    const company = await base44.asServiceRole.entities.ClientCompany.get(project.clientCompanyId);
    const planName = company?.planName || "Light";
    const limits = PLAN_LIMITS[planName] || PLAN_LIMITS.Light;

    // Light プランで動画生成をブロック
    if (planName === "Light") {
      return Response.json({
        error: "Video generation is not available in Light plan",
        message: "動画生成機能はLight プランでは利用できません。上位プランへのアップグレードをお願いします。",
        limitExceeded: true,
      }, { status: 403 });
    }

    // 当月の動画生成秒数をチェック
    if (limits.videoSecondsLimitMonthly !== null) {
      const currentMonth = new Date().toISOString().slice(0, 7);
      const videos = await base44.asServiceRole.entities.VideoProject.filter({
        clientCompanyId: project.clientCompanyId,
      }).then(v => v.filter(x => x.created_date?.startsWith(currentMonth) && x.durationSeconds));

      const videoSeconds = videos.reduce((sum, v) => sum + (v.durationSeconds || 0), 0);
      if (videoSeconds >= limits.videoSecondsLimitMonthly) {
        return Response.json({
          error: "Video generation limit exceeded",
          message: `月間動画生成時間の上限（${limits.videoSecondsLimitMonthly}秒）に達しています。`,
          limitExceeded: true,
        }, { status: 429 });
      }
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

    await base44.asServiceRole.entities.UsageRecord.create({
      clientCompanyId: project.clientCompanyId,
      usageType: "lipsync",
      provider: "heygen",
      units: project.durationSeconds || 0,
      unitName: "seconds",
      estimatedCostUsd: 0,
      metadata: JSON.stringify({ videoProjectId, mode, jobId }),
    });

    return Response.json({ heygenJobId: jobId, raw: data });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});