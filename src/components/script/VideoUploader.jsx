import React, { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Film, Upload, Loader2, Play, RefreshCw, Clapperboard } from "lucide-react";

const ACCEPTED = ".mp4,.mov,.webm";

export default function VideoUploader({ savedProject, onVideoUploaded, onLipsync }) {
  const { toast } = useToast();
  const fileRef = useRef(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  const hasAudio = savedProject?.status === "audio_ready" || savedProject?.audioFileUri;
  const hasVideo = !!savedProject?.videoFileUri;
  const canLipsync = hasAudio && hasVideo;

  const uploadMutation = useMutation({
    mutationFn: async (file) => {
      // 1. Upload private file
      const uploadRes = await base44.integrations.Core.UploadPrivateFile({ file });
      const fileUri = uploadRes.file_uri;

      // 2. Create signed URL for preview
      const signedRes = await base44.integrations.Core.CreateFileSignedUrl({ file_uri: fileUri, expires_in: 3600 });

      // 3. Update VideoProject
      await base44.entities.VideoProject.update(savedProject.id, { videoFileUri: fileUri });

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

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadMutation.mutate(file);
  };

  const handlePreview = async () => {
    if (!savedProject?.videoFileUri) return;
    const signedRes = await base44.integrations.Core.CreateFileSignedUrl({
      file_uri: savedProject.videoFileUri,
      expires_in: 3600,
    });
    setPreviewUrl(signedRes.signed_url);
  };

  return (
    <Card className="border-violet-500/20 bg-violet-500/5">
      <CardContent className="p-4 space-y-4">
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
        {(previewUrl || hasVideo) && (
          <div className="space-y-1.5">
            {previewUrl ? (
              <video
                controls
                className="w-full rounded-lg border border-border/50 max-h-48 bg-black"
                src={previewUrl}
              />
            ) : (
              <button
                className="w-full flex items-center justify-center gap-2 p-4 rounded-lg border border-dashed border-violet-500/30 text-violet-600 text-xs hover:bg-violet-500/5 transition-colors"
                onClick={handlePreview}
              >
                <Play className="w-4 h-4" /> 動画をプレビュー
              </button>
            )}
          </div>
        )}

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

        {/* リップシンク生成ボタン */}
        {canLipsync && (
          <Button
            className="w-full gap-2 bg-violet-600 hover:bg-violet-700 text-white"
            onClick={onLipsync}
          >
            <Clapperboard className="w-4 h-4" /> リップシンク生成
          </Button>
        )}
      </CardContent>
    </Card>
  );
}