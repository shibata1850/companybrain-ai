import React, { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import {
  Save, CheckCircle2, Edit3, Volume2, Clock, FileText,
  Loader2, Play, Pause, AlertCircle, Bot
} from "lucide-react";

const VOICE_OPTIONS = [
  { value: "alloy",   label: "Alloy（中性的）" },
  { value: "echo",    label: "Echo（男性的）" },
  { value: "fable",   label: "Fable（落ち着いた）" },
  { value: "onyx",    label: "Onyx（低音）" },
  { value: "nova",    label: "Nova（女性的）" },
  { value: "shimmer", label: "Shimmer（明るい）" },
];

export default function ScriptResult({ result, savedProject, onSave, onApprove, isSaving, isApproving, onAudioGenerated }) {
  const { toast } = useToast();
  const audioRef = useRef(null);
  const [editMode, setEditMode] = useState(false);
  const [editedScript, setEditedScript] = useState(result.script || "");
  const [selectedVoice, setSelectedVoice] = useState("alloy");
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState(savedProject?.audioFileUrl || null);

  const isApproved = savedProject?.scriptStatus === "approved";
  const isSaved = !!savedProject;
  const hasAudio = !!audioUrl;

  const handleSave = () => {
    onSave(editedScript);
    setEditMode(false);
  };

  const speechMutation = useMutation({
    mutationFn: async () => {
      const res = await base44.functions.invoke("generateSpeech", {
        videoProjectId: savedProject.id,
        voice: selectedVoice,
      });
      return res.data;
    },
    onSuccess: (data) => {
      setAudioUrl(data.audioFileUrl);
      if (onAudioGenerated) onAudioGenerated(data);
      toast({ title: "音声生成完了", description: "AIによる音声が生成されました。" });
    },
    onError: (err) => {
      toast({ title: "エラー", description: err.message, variant: "destructive" });
    },
  });

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm font-semibold">{result.title}</CardTitle>
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            {result.estimatedDuration && (
              <Badge variant="outline" className="gap-1 text-[10px]">
                <Clock className="w-2.5 h-2.5" />
                {result.estimatedDuration}
              </Badge>
            )}
            {result.totalCharCount && (
              <Badge variant="outline" className="gap-1 text-[10px]">
                <FileText className="w-2.5 h-2.5" />
                {result.totalCharCount}字
              </Badge>
            )}
            {isApproved && (
              <Badge className="gap-1 text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                <CheckCircle2 className="w-2.5 h-2.5" /> 承認済み
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* シーン構成 */}
        {result.scenes?.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">シーン構成</p>
            <div className="space-y-2">
              {result.scenes.map((scene, i) => (
                <div key={i} className="p-3 rounded-lg bg-muted/40 border border-border/40 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">{scene.name}</span>
                    {scene.duration && (
                      <Badge variant="secondary" className="text-[10px]">{scene.duration}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-foreground/80 leading-relaxed">{scene.text}</p>
                  {scene.note && (
                    <p className="text-[10px] text-muted-foreground italic">📝 {scene.note}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 台本全文 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground">台本全文</p>
            {!isApproved && (
              <Button
                size="sm" variant="ghost"
                className="h-6 text-xs gap-1"
                onClick={() => { setEditMode(!editMode); setEditedScript(result.script); }}
              >
                <Edit3 className="w-3 h-3" />
                {editMode ? "キャンセル" : "編集"}
              </Button>
            )}
          </div>

          {editMode ? (
            <Textarea
              value={editedScript}
              onChange={e => setEditedScript(e.target.value)}
              rows={12}
              className="text-sm resize-none font-mono"
            />
          ) : (
            <div className="p-4 rounded-lg bg-muted/30 border border-border/40 text-sm leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto">
              {savedProject?.script || result.script}
            </div>
          )}
        </div>

        {/* 台本アクションボタン */}
        <div className="flex flex-wrap gap-2">
          {editMode ? (
            <Button size="sm" className="gap-1.5" onClick={handleSave} disabled={isSaving}>
              <Save className="w-3.5 h-3.5" />
              {isSaving ? "保存中..." : "保存する"}
            </Button>
          ) : !isSaved ? (
            <Button size="sm" className="gap-1.5" onClick={() => onSave(editedScript)} disabled={isSaving}>
              <Save className="w-3.5 h-3.5" />
              {isSaving ? "保存中..." : "台本を保存する"}
            </Button>
          ) : !isApproved ? (
            <>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditMode(true)}>
                <Edit3 className="w-3.5 h-3.5" /> 編集する
              </Button>
              <Button
                size="sm"
                className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={onApprove}
                disabled={isApproving}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                {isApproving ? "承認中..." : "台本を承認する"}
              </Button>
            </>
          ) : null}
        </div>

        {/* 音声生成セクション（承認済みのみ） */}
        {isApproved && (
          <div className="pt-2 border-t border-border/40 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5" /> 音声生成
            </p>

            {/* ボイス選択 */}
            {!hasAudio && (
              <div className="space-y-2">
                <p className="text-[11px] text-muted-foreground">ボイスを選択</p>
                <div className="flex flex-wrap gap-1.5">
                  {VOICE_OPTIONS.map(v => (
                    <button
                      key={v.value}
                      type="button"
                      onClick={() => setSelectedVoice(v.value)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all ${
                        selectedVoice === v.value
                          ? "bg-blue-500/10 text-blue-600 border-blue-500/40"
                          : "border-border text-muted-foreground hover:bg-muted/50"
                      }`}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
                <Button
                  size="sm"
                  className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={() => speechMutation.mutate()}
                  disabled={speechMutation.isPending}
                >
                  {speechMutation.isPending
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 生成中...</>
                    : <><Volume2 className="w-3.5 h-3.5" /> 音声を生成する</>
                  }
                </Button>
              </div>
            )}

            {/* 生成済み音声プレイヤー */}
            {hasAudio && (
              <div className="space-y-2">
                {/* AI生成音声注記 */}
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/20">
                  <Bot className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <p className="text-[11px] text-amber-700">この音声はAI生成音声です</p>
                </div>

                {/* プレイヤー */}
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border border-border/40">
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-8 w-8 shrink-0"
                    onClick={togglePlay}
                  >
                    {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  </Button>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{result.title}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {VOICE_OPTIONS.find(v => v.value === (savedProject?.ttsVoice || selectedVoice))?.label || "AI音声"}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[10px] gap-1 shrink-0">
                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" /> 生成済み
                  </Badge>
                </div>

                <audio
                  ref={audioRef}
                  src={audioUrl}
                  onEnded={() => setIsPlaying(false)}
                  className="hidden"
                />

                {/* 再生成 */}
                <Button
                  size="sm" variant="outline"
                  className="gap-1.5 text-xs"
                  onClick={() => { setAudioUrl(null); setIsPlaying(false); }}
                >
                  別のボイスで再生成
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}