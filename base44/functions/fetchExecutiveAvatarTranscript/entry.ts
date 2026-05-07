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

    const session = await base44.asServiceRole.entities.AvatarConversationSession.get(
      avatarConversationSessionId
    );

    if (!session) {
      return Response.json({ error: "Session not found" }, { status: 404 });
    }

    const liveAvatarKey = Deno.env.get("LIVEAVATAR_API_KEY");
    let transcript = "";

    // LiveAvatar Transcript API 呼び出し
    if (session.provider === "liveavatar" && liveAvatarKey && session.sessionId) {
      try {
        const res = await fetch(
          `https://api.liveavatar.com/sessions/${session.sessionId}/transcript`,
          {
            headers: { "X-API-KEY": liveAvatarKey },
          }
        );

        if (res.ok) {
          const data = await res.json();
          transcript = data.transcript || data.text || "";
        }
      } catch (_e) {
        // 取得失敗時はスキップ
      }
    }

    // セッション更新
    if (transcript) {
      await base44.asServiceRole.entities.AvatarConversationSession.update(
        avatarConversationSessionId,
        { transcript }
      );
    }

    return Response.json({
      success: true,
      transcript: transcript || "",
      message: transcript
        ? "文字起こしが取得されました。"
        : "文字起こしが利用できません。",
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});