import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Zap, Loader2, CheckCircle2, RefreshCw, AlertCircle } from "lucide-react";

const MODES = [
  { value: "speed",     label: "Speed（高速）",    desc: "処理が速い" },
  { value: "precision", label: "Precision（高精度）", desc: "口の動きが精密" },
];

export default function LipsyncGenerator({ savedProject, onLipsyncStarted }) {
  const { toast } = useToast();
  const [lipsyncMode, setLipsyncMode] = useState("speed");

  const isProcessing = savedProject?.status === "processing";
  const isCompleted  = savedProject?.status === "completed";
  const jobId        = savedProject?.heygenJobId;

  const startMutation = useMutation({
    mutationFn: async () => {
      const res = await base44.functions.invoke("createHeygenLipsync", {
        videoProjectId: savedProject.id,
        lipsyncMode,
      });
      return res.data;
    },
    onSuccess: (data) => {
      onLipsyncStarted?.(data);
      toast({ title: "リップシンク生成開始", description: "HeyGenで処理を開始しました。" });
    },
    onError: (err) => {
      toast({ title: "エラー", description: err.message, variant: "destructive" });
    },
  });

  const checkMutation = useMutation({
    mutationFn: async () => {
      const res = await base44.functions.invoke("createHeygenLipsync", {
        videoProjectId: savedProject.id,
        checkStatus: true,
      });
      return res.data;
    },
    onSuccess: (data) => {
      onLipsyncStarted?.(data);
      if (data.status === "completed") {
        toast({ title: "動画生成完了", description: "出力動画が準備できました。" });
      } else {
        toast({ title: "処理中", description: `現在のステータス: ${data.heygenStatus || data.status}` });
      }
    },
    onError: (err) => {
      toast({ title: "エラー", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Card className="border-orange-500/20 bg-orange-500/5">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-orange-600" />
          <p className="text-sm font-semibold text-orange-700">HeyGenリップシンク生成</p>
          {isProcessing && (
            <Badge variant="outline" className="text-[10px] border-orange-500/30 text-orange-600 ml-auto gap-1">
              <Loader2 className="w-2.5 h-2.5 animate-spin" /> 処理中
            </Badge>
          )}
          {isCompleted && (
            <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-600 ml-auto gap-1">
              <CheckCircle2 className="w-2.5 h-2.5" /> 完了
            </Badge>
          )}
        </div>

        {/* 処理中の場合はジョブID表示と確認ボタンのみ */}
        {isProcessing ? (
          <div className="space-y-3">
            {jobId && (
              <div className="p-2.5 rounded-lg bg-muted/40 border border-border/40">
                <p className="text-[11px] text-muted-foreground">Job ID: <span className="font-mono text-foreground">{jobId}</span></p>
              </div>
            )}
            <Button
              className="w-full gap-2"
              variant="outline"
              onClick={() => checkMutation.mutate()}
              disabled={checkMutation.isPending}
            >
              {checkMutation.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" /> 確認中...</>
                : <><RefreshCw className="w-4 h-4" /> 処理状況を確認する</>
              }
            </Button>
          </div>
        ) : isCompleted ? (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <p className="text-xs text-emerald-700">リップシンク動画の生成が完了しました。</p>
          </div>
        ) : (
          <>
            {/* モード選択 */}
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">生成モード</p>
              <div className="flex gap-2">
                {MODES.map(m => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setLipsyncMode(m.value)}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-all text-left ${
                      lipsyncMode === m.value
                        ? "bg-orange-500/10 text-orange-700 border-orange-500/40"
                        : "border-border text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    <div>{m.label}</div>
                    <div className="text-[10px] opacity-70 mt-0.5">{m.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/20">
              <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-700 leading-relaxed">
                HeyGen APIを使用してリップシンク動画を生成します。処理には数分かかる場合があります。
              </p>
            </div>

            <Button
              className="w-full gap-2 bg-orange-600 hover:bg-orange-700 text-white"
              onClick={() => startMutation.mutate()}
              disabled={startMutation.isPending}
            >
              {startMutation.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" /> 生成開始中...</>
                : <><Zap className="w-4 h-4" /> リップシンク生成を開始する</>
              }
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}