import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { avatarConversationSessionId } = await req.json();

    if (!avatarConversationSessionId) {
      return Response.json({ error: "Missing sessionId" }, { status: 400 });
    }

    // セッション取得
    const session = await base44.asServiceRole.entities.AvatarConversationSession.get(
      avatarConversationSessionId
    );

    if (!session) {
      return Response.json({ error: "Session not found" }, { status: 404 });
    }

    const liveAvatarKey = Deno.env.get("LIVEAVATAR_API_KEY");

    // LiveAvatar Stop Session API 呼び出し
    let transcript = "";
    if (session.provider === "liveavatar" && liveAvatarKey && session.sessionId) {
      try {
        const laRes = await fetch(`https://api.liveavatar.com/sessions/${session.sessionId}`, {
          method: "DELETE",
          headers: { "X-API-KEY": liveAvatarKey },
        });

        if (laRes.ok) {
          // Transcript 取得試行
          try {
            const txRes = await fetch(
              `https://api.liveavatar.com/sessions/${session.sessionId}/transcript`,
              {
                headers: { "X-API-KEY": liveAvatarKey },
              }
            );
            if (txRes.ok) {
              const txData = await txRes.json();
              transcript = txData.transcript || txData.text || "";
            }
          } catch (_e) {
            // Transcript失敗は続行
          }
        }
      } catch (_e) {
        // Stop失敗は続行
      }
    }

    // セッション終了時刻・期間計算
    const startDate = new Date(session.created_date);
    const endDate = new Date();
    const durationSeconds = Math.round((endDate - startDate) / 1000);

    // セッション更新
    const updateData = {
      endedAt: endDate.toISOString(),
      durationSeconds,
      status: "completed",
    };

    if (transcript) {
      updateData.transcript = transcript;
    }

    const updated = await base44.asServiceRole.entities.AvatarConversationSession.update(
      avatarConversationSessionId,
      updateData
    );

    // UsageRecord に記録（live_avatar_session の場合のみ）
    if (session.provider === "liveavatar") {
      await base44.asServiceRole.entities.UsageRecord.create({
        clientCompanyId: session.clientCompanyId,
        usageType: "live_avatar_session",
        provider: "liveavatar",
        units: durationSeconds,
        unitName: "seconds",
        estimatedCostUsd: 0,
        metadata: JSON.stringify({
          avatarConversationSessionId,
          avatarProfileId: session.avatarProfileId,
          purpose: session.purpose,
        }),
      });
    }

    return Response.json({
      success: true,
      session: updated,
      message: "セッションが終了しました。",
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});