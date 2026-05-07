import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Save, CheckCircle2, Edit3, Volume2, Clock, FileText } from "lucide-react";
import AudioGenerator from "@/components/script/AudioGenerator";
import VideoUploader from "@/components/script/VideoUploader";

export default function ScriptResult({ result, savedProject, onSave, onApprove, isSaving, isApproving, onProjectUpdate }) {
  const [editMode, setEditMode] = useState(false);
  const [editedScript, setEditedScript] = useState(result.script || "");

  const isApproved = savedProject?.scriptStatus === "approved";
  const isSaved = !!savedProject;

  const handleSave = () => {
    onSave(editedScript);
    setEditMode(false);
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm font-semibold">{result.title}</CardTitle>
          <div className="flex items-center gap-2 shrink-0">
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
              {editMode ? editedScript : (savedProject?.script || result.script)}
            </div>
          )}
        </div>

        {/* アクションボタン */}
        <div className="flex flex-wrap gap-2 pt-1">
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
              <Button
                size="sm" variant="outline"
                className="gap-1.5"
                onClick={() => setEditMode(true)}
              >
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

        {/* 音声生成セクション（承認後のみ） */}
        {isApproved && savedProject && (
          <AudioGenerator
            savedProject={savedProject}
            onAudioGenerated={onProjectUpdate}
          />
        )}

        {/* 動画素材アップロード（承認後のみ） */}
        {isApproved && savedProject && (
          <VideoUploader
            savedProject={savedProject}
            onVideoUploaded={onProjectUpdate}
            onLipsync={() => {/* TODO: リップシンク処理 */}}
          />
        )}
      </CardContent>
    </Card>
  );
}