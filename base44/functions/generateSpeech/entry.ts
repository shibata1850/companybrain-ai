import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { videoProjectId, voice = "alloy" } = await req.json();
    if (!videoProjectId) {
      return Response.json({ error: "videoProjectId is required" }, { status: 400 });
    }

    const project = await base44.asServiceRole.entities.VideoProject.get(videoProjectId);
    if (!project) {
      return Response.json({ error: "VideoProject not found" }, { status: 404 });
    }
    if (project.scriptStatus !== "approved") {
      return Response.json({ error: "台本が承認されていません" }, { status: 400 });
    }

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
      return Response.json({ error: "OPENAI_API_KEY is not set" }, { status: 500 });
    }

    // OpenAI TTS API
    const ttsRes = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",
        input: project.script,
        voice,
        response_format: "mp3",
      }),
    });

    if (!ttsRes.ok) {
      const detail = await ttsRes.text();
      return Response.json({ error: "OpenAI TTS error", detail }, { status: 500 });
    }

    const audioBuffer = await ttsRes.arrayBuffer();
    const audioBlob = new Blob([audioBuffer], { type: "audio/mpeg" });

    // プライベートストレージにアップロード
    const { file_uri } = await base44.asServiceRole.integrations.Core.UploadPrivateFile({
      file: audioBlob,
    });

    // 公開URLも取得（5分有効）
    const { signed_url: audioFileUrl } = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
      file_uri,
      expires_in: 3600,
    });

    // VideoProject に保存
    await base44.asServiceRole.entities.VideoProject.update(videoProjectId, {
      audioFileUri: file_uri,
      audioFileUrl,
      voiceMode: "openai_tts",
      ttsVoice: voice,
      status: "audio_ready",
    });

    return Response.json({ success: true, audioFileUrl, audioFileUri: file_uri });

  } catch (error) {
    console.error("[generateSpeech]", error?.message);
    return Response.json({ error: error?.message || "Unexpected error" }, { status: 500 });
  }
});