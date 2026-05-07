import React, { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Upload, Loader2, Play, Video, CheckCircle2 } from "lucide-react";

const ACCEPT = ".mp4,.mov,.webm";

export default function VideoUploader({ savedProject, onVideoUploaded }) {
  const { toast } = useToast();
  const fileRef = useRef(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [uploading, setUploading] = useState(false);

  // 既存のvideoFileUriがあれば署名付きURLを取得
  useEffect(() => {
    if (savedProject?.videoFileUri && !previewUrl) {
      base44.integrations.Core.CreateFileSignedUrl({ file_uri: savedProject.videoFileUri })
        .then(({ signed_url }) => setPreviewUrl(signed_url))
        .catch(() => {});
    }
  }, [savedProject?.videoFileUri]);

  const uploadMutation = useMutation({
    mutationFn: async (file) => {
      setUploading(true);
      // 1. プライベートアップロード
      const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
      // 2. VideoProject更新
      const updated = await base44.entities.VideoProject.update(savedProject.id, {
        videoFileUri: file_uri,
      });
      // 3. 署名付きURL取得
      const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({ file_uri });
      return { updated, signed_url, file_uri };
    },
    onSuccess: ({ updated, signed_url }) => {
      setPreviewUrl(signed_url);
      setUploading(false);
      onVideoUploaded?.(updated);
      toast({ title: "動画アップロード完了", description: "動画ファイルを保存しました。" });
    },
    onError: (err) => {
      setUploading(false);
      toast({ title: "エラー", description: err.message, variant: "destructive" });
    },
  });

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadMutation.mutate(file);
  };

  const isUploaded = !!savedProject?.videoFileUri;

  return (
    <Card className="border-violet-500/20 bg-violet-500/5">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Video className="w-4 h-4 text-violet-600" />
          <p className="text-sm font-semibold text-violet-700">動画素材アップロード</p>
          {isUploaded && (
            <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-600 ml-auto gap-1">
              <CheckCircle2 className="w-2.5 h-2.5" /> アップロード済み
            </Badge>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          自撮り動画またはアバター用素材（mp4 / mov / webm）をアップロードしてください。
        </p>

        {/* プレビュー */}
        {previewUrl && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Play className="w-3 h-3" /> 動画プレビュー
            </p>
            <video controls className="w-full rounded-lg max-h-48 bg-black" src={previewUrl}>
              お使いのブラウザは動画再生に対応していません。
            </video>
          </div>
        )}

        {/* アップロードボタン */}
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={handleFileChange}
        />
        <Button
          className="w-full gap-2 bg-violet-600 hover:bg-violet-700 text-white"
          onClick={() => fileRef.current?.click()}
          disabled={uploading || uploadMutation.isPending}
        >
          {uploading || uploadMutation.isPending
            ? <><Loader2 className="w-4 h-4 animate-spin" /> アップロード中...</>
            : <><Upload className="w-4 h-4" /> {isUploaded ? "動画を差し替える" : "動画をアップロード"}</>
          }
        </Button>
      </CardContent>
    </Card>
  );
}