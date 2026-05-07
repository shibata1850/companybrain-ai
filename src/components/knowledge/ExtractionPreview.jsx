import React from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, FileText, AlertTriangle, HelpCircle, Target, Shield } from "lucide-react";

export default function ExtractionPreview({ extracted }) {
  if (!extracted) return null;

  const { summary, key_points, faq_candidates, caution_notes, recommended_scope } = extracted;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-primary">
        <Sparkles className="w-4 h-4" />
        AI抽出結果
        {recommended_scope && (
          <Badge variant="outline" className="ml-auto text-[10px]">
            推奨スコープ: {recommended_scope}
          </Badge>
        )}
      </div>

      {summary && (
        <Card className="p-4 bg-muted/30 border-border/50">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground mb-2">
            <FileText className="w-3.5 h-3.5" /> 要約
          </div>
          <p className="text-sm leading-relaxed">{summary}</p>
        </Card>
      )}

      {key_points?.length > 0 && (
        <Card className="p-4 bg-muted/30 border-border/50">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground mb-2">
            <Target className="w-3.5 h-3.5" /> 主要ポイント
          </div>
          <ul className="space-y-1">
            {key_points.map((pt, i) => (
              <li key={i} className="text-sm flex gap-2">
                <span className="text-primary font-bold shrink-0">{i + 1}.</span>
                <span>{pt}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {faq_candidates?.length > 0 && (
        <Card className="p-4 bg-muted/30 border-border/50">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground mb-2">
            <HelpCircle className="w-3.5 h-3.5" /> FAQ候補
          </div>
          <div className="space-y-3">
            {faq_candidates.map((faq, i) => (
              <div key={i}>
                <p className="text-sm font-medium">Q: {faq.question}</p>
                <p className="text-sm text-muted-foreground mt-0.5">A: {faq.answer}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {caution_notes?.length > 0 && (
        <Card className="p-4 bg-amber-500/5 border-amber-500/20">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 mb-2">
            <AlertTriangle className="w-3.5 h-3.5" /> 注意事項
          </div>
          <ul className="space-y-1">
            {caution_notes.map((note, i) => (
              <li key={i} className="text-sm text-amber-700">{note}</li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}