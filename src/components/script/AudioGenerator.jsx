import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Volume2, Loader2, Play, AlertCircle } from "lucide-react";

const VOICES = [
  { value: "cedar",   label: "Cedar（落ち着いた）" },
  { value: "alloy",   label: "Alloy（ニュートラル）" },
  { value: "echo",    label: "Echo（明瞭）" },
  { value: "fable",   label: "Fable（温かみ）" },
  { value: "onyx",    label: "Onyx（重厚）" },
  { value: "nova",    label: "Nova（明るい）" },
  { value: "shimmer", label: "Shimmer（柔らか）" },
];

export default function AudioGenerator({ savedProject, onAudioGenerated }) {
  const { toast } = useToast();
  const [voice, setVoice] = useState("cedar");
  const [audioUrl, setAudioUrl] = useState(savedProject?.audioFileUrl || null);

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await base44.functions.invoke("generateSpeech", {
        videoProjectId: savedProject.id,
        voice,
      });
      return res.data;
    },
    onSuccess: (data) => {
      setAudioUrl(data.audioFileUrl);
      onAudioGenerated?.(data);
      toast({ title: "音声生成完了", description: "音声ファイルを再生できます。" });
    },
    onError: (err) => {
      toast({ title: "エラー", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Card className="border-blue-500/20 bg-blue-500/5">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Volume2 className="w-4 h-4 text-blue-600" />
          <p className="text-sm font-semibold text-blue-700">音声生成</p>
          <Badge variant="outline" className="text-[10px] border-blue-500/30 text-blue-600 ml-auto">
            承認済み台本
          </Badge>
        </div>

        {/* ボイス選択 */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">ボイス選択</p>
          <div className="flex flex-wrap gap-1.5">
            {VOICES.map(v => (
              <button
                key={v.value}
                type="button"
                onClick={() => setVoice(v.value)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-all ${
                  voice === v.value
                    ? "bg-blue-500/10 text-blue-700 border-blue-500/40"
                    : "border-border text-muted-foreground hover:bg-muted/50"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {/* AI生成音声の注記 */}
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/20">
          <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-700 leading-relaxed">
            この音声はAI生成音声です。実際の利用前に内容・品質をご確認ください。
          </p>
        </div>

        {/* 音声プレイヤー */}
        {audioUrl && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Play className="w-3 h-3" /> 生成音声
            </p>
            <audio controls className="w-full h-10" src={audioUrl}>
              お使いのブラウザは音声再生に対応していません。
            </audio>
          </div>
        )}

        {/* 生成ボタン */}
        <Button
          className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white"
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
        >
          {generateMutation.isPending
            ? <><Loader2 className="w-4 h-4 animate-spin" /> 音声生成中...</>
            : <><Volume2 className="w-4 h-4" /> {audioUrl ? "音声を再生成する" : "音声を生成する"}</>
          }
        </Button>
      </CardContent>
    </Card>
  );
}