import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { videoProjectId } = await req.json();

    const project = await base44.asServiceRole.entities.VideoProject.get(videoProjectId);

    if (!project?.heygenJobId) {
      return Response.json({ error: "heygenJobId not found" }, { status: 400 });
    }

    const heygenApiKey = Deno.env.get("HEYGEN_API_KEY");

    if (!heygenApiKey) {
      return Response.json({ error: "HEYGEN_API_KEY is not set" }, { status: 500 });
    }

    const heygenRes = await fetch(
      `https://api.heygen.com/v3/lipsyncs/${project.heygenJobId}`,
      {
        method: "GET",
        headers: {
          "X-Api-Key": heygenApiKey,
        },
      }
    );

    if (!heygenRes.ok) {
      const errorText = await heygenRes.text();
      return Response.json({ error: "HeyGen status error", detail: errorText }, { status: 500 });
    }

    const data = await heygenRes.json();

    const status = data.status || data.data?.status || "processing";
    const outputVideoUrl =
      data.video_url ||
      data.output_video_url ||
      data.data?.video_url ||
      data.data?.output_video_url ||
      "";

    let mappedStatus = "processing";

    if (["completed", "success", "done"].includes(status)) {
      mappedStatus = "completed";
    } else if (["failed", "error"].includes(status)) {
      mappedStatus = "failed";
    }

    await base44.asServiceRole.entities.VideoProject.update(videoProjectId, {
      status: mappedStatus,
      outputVideoUrl: outputVideoUrl || project.outputVideoUrl || "",
      errorMessage: mappedStatus === "failed" ? JSON.stringify(data) : "",
    });

    return Response.json({
      status: mappedStatus,
      outputVideoUrl,
      raw: data,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});