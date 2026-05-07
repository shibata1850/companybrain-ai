import React from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, FileText, AlertTriangle, HelpCircle, Target, Shield } from "lucide-react";

const SCOPE_LABELS = {
  public: "公開",
  internal: "社内",
  executive: "経営者",
  admin_only: "管理者",
};

export default function ExtractionPreview({ extracted }) {
  if (!extracted) return null;

  const { summary, key_points, faq_candidates, risk_notes, tags } = extracted;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-primary">
        <Sparkles className="w-4 h-4" />
        AI抽出結果
        <Badge variant="secondary" className="ml-auto text-[10px]">すべてdraft（要承認）</Badge>
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
            <Badge variant="outline" className="text-[10px] ml-1">{key_points.length}件のチャンクを生成</Badge>
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
            <Badge variant="outline" className="text-[10px] ml-1">{faq_candidates.length}件のチャンクを生成</Badge>
          </div>
          <div className="space-y-4">
            {faq_candidates.map((faq, i) => (
              <div key={i} className="border-b border-border/40 last:border-0 pb-3 last:pb-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="text-sm font-medium">Q: {faq.question}</p>
                  {faq.recommended_scope && (
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      <Shield className="w-2.5 h-2.5 mr-1" />
                      {SCOPE_LABELS[faq.recommended_scope] || faq.recommended_scope}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">A: {faq.answer}</p>
                {faq.source_quote && (
                  <p className="text-xs text-muted-foreground/60 mt-1 italic border-l-2 border-border pl-2">
                    「{faq.source_quote}」
                  </p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {risk_notes?.length > 0 && (
        <Card className="p-4 bg-amber-500/5 border-amber-500/20">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 mb-2">
            <AlertTriangle className="w-3.5 h-3.5" /> リスク・注意事項
          </div>
          <ul className="space-y-1">
            {risk_notes.map((note, i) => (
              <li key={i} className="text-sm text-amber-700 flex gap-2">
                <span className="shrink-0">•</span>
                <span>{note}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {tags?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map(tag => (
            <Badge key={tag} variant="secondary" className="text-[11px]">{tag}</Badge>
          ))}
        </div>
      )}
    </div>
  );
}