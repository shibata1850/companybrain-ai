import React, { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Film, Upload, Loader2, Play, RefreshCw, Clapperboard, CheckCircle2, RefreshCcw } from "lucide-react";

const ACCEPTED = ".mp4,.mov,.webm";
const LIPSYNC_MODES = [
  { value: "speed",     label: "Speed（高速）" },
  { value: "precision", label: "Precision（高精度）" },
];

export default function VideoUploader({ savedProject, onVideoUploaded, onProjectUpdate }) {
  const { toast } = useToast();
  const fileRef = useRef(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [lipsyncMode, setLipsyncMode] = useState("speed");

  const project = savedProject;
  const hasAudio = !!(project?.audioFileUri);
  const hasVideo = !!(project?.videoFileUri);
  const isAudioReady = project?.status === "audio_ready";
  const canLipsync = hasAudio && hasVideo && isAudioReady;
  const isProcessing = project?.status === "processing";

  // Upload video mutation
  const uploadMutation = useMutation({
    mutationFn: async (file) => {
      const uploadRes = await base44.integrations.Core.UploadPrivateFile({ file });
      const fileUri = uploadRes.file_uri;
      const signedRes = await base44.integrations.Core.CreateFileSignedUrl({ file_uri: fileUri, expires_in: 3600 });
      await base44.entities.VideoProject.update(project.id, { videoFileUri: fileUri });
      return { fileUri, signedUrl: signedRes.signed_url };
    },
    onSuccess: ({ signedUrl, fileUri }) => {
      setPreviewUrl(signedUrl);
      onVideoUploaded?.({ videoFileUri: fileUri });
      toast({ title: "アップロード完了", description: "動画素材を保存しました。" });
    },
    onError: (err) => {
      toast({ title: "エラー", description: err.message, variant: "destructive" });
    },
  });

  // Lipsync mutation
  const lipsyncMutation = useMutation({
    mutationFn: async () => {
      const res = await base44.functions.invoke("createHeygenLipsync", {
        videoProjectId: project.id,
        mode: lipsyncMode,
      });
      return res.data;
    },
    onSuccess: (data) => {
      onProjectUpdate?.({ status: "processing", heygenJobId: data.heygenJobId, lipsyncMode });
      toast({ title: "リップシンク生成開始", description: `Job ID: ${data.heygenJobId}` });
    },
    onError: (err) => {
      toast({ title: "エラー", description: err.message, variant: "destructive" });
    },
  });

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadMutation.mutate(file);
  };

  const handlePreview = async () => {
    if (!project?.videoFileUri) return;
    const signedRes = await base44.integrations.Core.CreateFileSignedUrl({
      file_uri: project.videoFileUri,
      expires_in: 3600,
    });
    setPreviewUrl(signedRes.signed_url);
  };

  return (
    <Card className="border-violet-500/20 bg-violet-500/5">
      <CardContent className="p-4 space-y-4">
        {/* ヘッダー */}
        <div className="flex items-center gap-2">
          <Film className="w-4 h-4 text-violet-600" />
          <p className="text-sm font-semibold text-violet-700">動画素材アップロード</p>
          {hasVideo && (
            <Badge variant="outline" className="text-[10px] border-violet-500/30 text-violet-600 ml-auto">
              アップロード済み
            </Badge>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          自撮り動画またはアバター用動画をアップロードしてください。（MP4 / MOV / WebM）
        </p>

        {/* 動画プレビュー */}
        {previewUrl ? (
          <video
            controls
            className="w-full rounded-lg border border-border/50 max-h-48 bg-black"
            src={previewUrl}
          />
        ) : hasVideo ? (
          <button
            className="w-full flex items-center justify-center gap-2 p-4 rounded-lg border border-dashed border-violet-500/30 text-violet-600 text-xs hover:bg-violet-500/5 transition-colors"
            onClick={handlePreview}
          >
            <Play className="w-4 h-4" /> 動画をプレビュー
          </button>
        ) : null}

        {/* アップロードボタン */}
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPTED}
          className="hidden"
          onChange={handleFileChange}
        />
        <Button
          variant="outline"
          className="w-full gap-2 border-violet-500/30 text-violet-700 hover:bg-violet-500/10"
          onClick={() => fileRef.current?.click()}
          disabled={uploadMutation.isPending}
        >
          {uploadMutation.isPending
            ? <><Loader2 className="w-4 h-4 animate-spin" /> アップロード中...</>
            : hasVideo
              ? <><RefreshCw className="w-4 h-4" /> 動画を差し替える</>
              : <><Upload className="w-4 h-4" /> 動画素材をアップロード</>
          }
        </Button>

        {/* リップシンクセクション */}
        {canLipsync && (
          <div className="space-y-3 pt-2 border-t border-violet-500/20">
            <p className="text-xs font-semibold text-violet-700">HeyGenリップシンク生成</p>

            {/* モード選択 */}
            <div className="flex gap-2">
              {LIPSYNC_MODES.map(m => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setLipsyncMode(m.value)}
                  className={`flex-1 py-1.5 rounded-md text-[11px] font-medium border transition-all ${
                    lipsyncMode === m.value
                      ? "bg-violet-500/10 text-violet-700 border-violet-500/40"
                      : "border-border text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <Button
              className="w-full gap-2 bg-violet-600 hover:bg-violet-700 text-white"
              onClick={() => lipsyncMutation.mutate()}
              disabled={lipsyncMutation.isPending || isProcessing}
            >
              {lipsyncMutation.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" /> 送信中...</>
                : isProcessing
                  ? <><RefreshCcw className="w-4 h-4 animate-spin" /> 処理中...</>
                  : <><Clapperboard className="w-4 h-4" /> リップシンク生成を開始</>
              }
            </Button>

            {/* 処理中ステータス */}
            {isProcessing && project?.heygenJobId && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-violet-500/5 border border-violet-500/20 text-xs text-violet-700">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>Job ID: <span className="font-mono">{project.heygenJobId}</span></span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}