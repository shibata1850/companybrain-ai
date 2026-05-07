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

    // 利用制限チェック
    const PLAN_LIMITS = {
      Light: { monthlyAnswers: 1000, videoMinutes: 0 },
      Standard: { monthlyAnswers: 5000, videoMinutes: 10 },
      Professional: { monthlyAnswers: 20000, videoMinutes: 30 },
      Enterprise: { monthlyAnswers: null, videoMinutes: null },
    };

    const company = await base44.asServiceRole.entities.ClientCompany.get(project.clientCompanyId);
    const planName = company?.planName || "Light";
    const limits = PLAN_LIMITS[planName] || PLAN_LIMITS.Light;
    const currentMonth = new Date().toISOString().slice(0, 7);

    // Lightプランでは動画生成をブロック
    if (limits.videoMinutes === 0) {
      return Response.json({
        error: "Feature not available",
        message: "Lightプランでは動画生成機能は利用できません。",
        limitExceeded: true,
      }, 403);
    }

    // 当月の動画生成時間をカウント
    const monthlyVideos = await base44.asServiceRole.entities.VideoProject.filter({
      clientCompanyId: project.clientCompanyId,
    }).then(v => v.filter(x => x.created_date?.startsWith(currentMonth) && x.status === "completed"));

    const totalVideoSeconds = monthlyVideos.reduce((sum, v) => sum + (v.durationSeconds || 0), 0);
    const totalVideoMinutes = Math.ceil(totalVideoSeconds / 60);

    if (limits.videoMinutes !== null && totalVideoMinutes >= limits.videoMinutes) {
      return Response.json({
        error: "Usage limit exceeded",
        message: `月間動画生成時間の上限（${limits.videoMinutes}分）に達しています。`,
        limitExceeded: true,
      }, 429);
    }

    if (!project.videoFileUri || !project.audioFileUri) {
      return Response.json(
        { error: "Both videoFileUri and audioFileUri are required." },
        { status: 400 }
      );
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