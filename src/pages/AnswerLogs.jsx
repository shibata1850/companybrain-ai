import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { ClipboardList, Search, X, Download } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import { useClientCompanyId } from "@/lib/useClientCompanyId";

const CHANNELS = [
  { value: "all", label: "全チャネル" },
  { value: "public", label: "社外向け" },
  { value: "internal", label: "社内向け" },
  { value: "executive", label: "経営者向け" },
  { value: "admin_test", label: "管理者テスト" },
];

const FEEDBACK_LABELS = {
  good: "良い回答",
  bad: "改善が必要",
  needs_improvement: "改善が必要",
  none: "フィードバックなし",
};

const channelColors = {
  public: "bg-blue-500/10 text-blue-600 border-blue-500/30",
  internal: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  executive: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  admin_test: "bg-destructive/10 text-destructive border-destructive/30",
};

export default function AnswerLogs() {
  const CLIENT_ID = useClientCompanyId();
  const [keyword, setKeyword] = useState("");
  const [selectedChannel, setSelectedChannel] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ["conversationLogs", CLIENT_ID],
    queryFn: () =>
      base44.entities.ConversationLog.filter({ clientCompanyId: CLIENT_ID })
        .then(logs => logs.sort((a, b) => new Date(b.created_date) - new Date(a.created_date))),
  });

  // フィルタリングロジック
  const filteredLogs = useMemo(() => {
    return conversations.filter((log) => {
      // キーワード検索
      const keywordMatch =
        !keyword ||
        log.question?.toLowerCase().includes(keyword.toLowerCase()) ||
        log.answer?.toLowerCase().includes(keyword.toLowerCase());

      // チャネルフィルタ
      const channelMatch = selectedChannel === "all" || log.channel === selectedChannel;

      // 日付範囲フィルタ
      let dateMatch = true;
      if (dateFrom) {
        const logDate = new Date(log.created_date).toISOString().split("T")[0];
        dateMatch = dateMatch && logDate >= dateFrom;
      }
      if (dateTo) {
        const logDate = new Date(log.created_date).toISOString().split("T")[0];
        dateMatch = dateMatch && logDate <= dateTo;
      }

      return keywordMatch && channelMatch && dateMatch;
    });
  }, [conversations, keyword, selectedChannel, dateFrom, dateTo]);

  const handleReset = () => {
    setKeyword("");
    setSelectedChannel("all");
    setDateFrom("");
    setDateTo("");
  };

  const handleExport = () => {
    const csv = [
      ["日時", "チャネル", "質問", "回答", "信頼度", "フィードバック"].join(","),
      ...filteredLogs.map(log => [
        new Date(log.created_date).toLocaleString("ja-JP"),
        CHANNELS.find(c => c.value === log.channel)?.label || log.channel,
        `"${(log.question || "").replace(/"/g, '""')}"`,
        `"${(log.answer || "").replace(/"/g, '""')}"`,
        (log.confidence * 100).toFixed(0) + "%",
        FEEDBACK_LABELS[log.feedback] || log.feedback,
      ].join(","))
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `answer-logs-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="回答ログ"
        description="過去のAI回答を検索・管理できます。"
      />

      {/* フィルタセクション */}
      <Card className="border-border/50">
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Search className="w-4 h-4 text-primary" />
            検索・フィルタ
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* キーワード検索 */}
          <div className="space-y-2">
            <label className="text-xs font-medium">キーワード検索</label>
            <Input
              placeholder="質問内容や回答を検索..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="text-sm"
            />
          </div>

          {/* チャネル・日付フィルタ行 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-medium">チャネル</label>
              <Select value={selectedChannel} onValueChange={setSelectedChannel}>
                <SelectTrigger className="text-sm h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHANNELS.map(ch => (
                    <SelectItem key={ch.value} value={ch.value}>{ch.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium">開始日</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 border border-input rounded-md text-sm bg-background"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium">終了日</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full px-3 py-2 border border-input rounded-md text-sm bg-background"
              />
            </div>
          </div>

          {/* ボタン */}
          <div className="flex gap-2 pt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleReset}
              className="text-xs gap-1"
            >
              <X className="w-3 h-3" /> リセット
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleExport}
              disabled={filteredLogs.length === 0}
              className="text-xs gap-1 ml-auto"
            >
              <Download className="w-3 h-3" /> CSV出力
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 結果カウント */}
      <div className="text-sm text-muted-foreground">
        {filteredLogs.length}件の回答ログ
      </div>

      {/* ログテーブル */}
      {isLoading ? (
        <Card className="border-border/50 p-8 text-center">
          <p className="text-sm text-muted-foreground">読み込み中...</p>
        </Card>
      ) : filteredLogs.length === 0 ? (
        <Card className="border-border/50 p-8 text-center">
          <ClipboardList className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">該当するログがありません</p>
        </Card>
      ) : (
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-2">
          {filteredLogs.map((log) => (
            <Card key={log.id} className="border-border/50 p-4 hover:bg-muted/30 transition-colors">
              <div className="space-y-3">
                {/* ヘッダー行 */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 flex-1">
                    <Badge
                      variant="outline"
                      className={`text-[10px] border ${
                        channelColors[log.channel] || "bg-muted text-muted-foreground"
                      }`}
                    >
                      {CHANNELS.find(c => c.value === log.channel)?.label || log.channel}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(log.created_date).toLocaleString("ja-JP", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {log.confidence != null && (
                      <Badge variant="secondary" className="text-[10px]">
                        信頼度 {Math.round(log.confidence * 100)}%
                      </Badge>
                    )}
                    {log.needHumanReview && (
                      <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-600 bg-amber-500/5">
                        確認必要
                      </Badge>
                    )}
                  </div>
                </div>

                {/* 質問 */}
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">質問</p>
                  <p className="text-sm text-foreground line-clamp-2">{log.question}</p>
                </div>

                {/* 回答 */}
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">回答</p>
                  <p className="text-sm text-foreground/90 line-clamp-3">{log.answer}</p>
                </div>

                {/* フッター */}
                <div className="flex items-center justify-between pt-2 border-t border-border/40">
                  <div className="flex items-center gap-2">
                    {log.feedback && log.feedback !== "none" && (
                      <Badge variant="outline" className="text-[10px]">
                        {FEEDBACK_LABELS[log.feedback] || log.feedback}
                      </Badge>
                    )}
                    {log.usedSources?.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        参照: {log.usedSources.length}件
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}