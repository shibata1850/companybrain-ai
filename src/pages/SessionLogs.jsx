import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { ChevronDown, ChevronUp, Search, Award } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import { useClientCompanyId } from "@/lib/useClientCompanyId";

export default function SessionLogs() {
  const CLIENT_ID = useClientCompanyId();
  const [keyword, setKeyword] = useState("");
  const [purposeFilter, setPurposeFilter] = useState("all");
  const [expandedId, setExpandedId] = useState(null);

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["sessions", CLIENT_ID],
    queryFn: () =>
      base44.entities.AvatarConversationSession.filter({
        clientCompanyId: CLIENT_ID,
      }).then((s) => s.sort((a, b) => new Date(b.created_date) - new Date(a.created_date))),
  });

  const { data: avatars = {} } = useQuery({
    queryKey: ["avatarsMap", CLIENT_ID],
    queryFn: async () => {
      const list = await base44.entities.ExecutiveAvatarProfile.filter({
        clientCompanyId: CLIENT_ID,
      });
      return Object.fromEntries(list.map((a) => [a.id, a.avatarName]));
    },
  });

  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      const keywordMatch = !keyword || avatars[s.avatarProfileId]?.toLowerCase().includes(keyword.toLowerCase());
      const purposeMatch = purposeFilter === "all" || s.purpose === purposeFilter;
      return keywordMatch && purposeMatch;
    });
  }, [sessions, keyword, purposeFilter, avatars]);

  const purposes = [...new Set(sessions.map((s) => s.purpose))];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="セッションログ"
        description="ExecutiveBrain Avatar との会話履歴を確認できます。"
      />

      {/* フィルタ */}
      <Card className="border-border/50">
        <CardContent className="p-4 space-y-3">
          <div className="flex gap-3">
            <Input
              placeholder="アバター名で検索..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="text-sm flex-1"
            />
            <Select value={purposeFilter} onValueChange={setPurposeFilter}>
              <SelectTrigger className="w-40 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全て</SelectItem>
                {purposes.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* ログリスト */}
      {isLoading ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground">読み込み中...</p>
        </Card>
      ) : filteredSessions.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground">セッションログがありません。</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredSessions.map((session) => {
            const isExpanded = expandedId === session.id;
            const durationMin = Math.round(session.durationSeconds / 60);

            return (
              <Card key={session.id} className="border-border/50 hover:shadow-md transition-shadow">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : session.id)}
                  className="w-full text-left p-4 flex items-start justify-between gap-4"
                >
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold">{avatars[session.avatarProfileId]}</h4>
                      <Badge variant="outline" className="text-[10px]">
                        {session.purpose}
                      </Badge>
                      {session.evaluationScore !== undefined && (
                        <Badge className="gap-1 text-[10px] bg-primary/10 text-primary border-0">
                          <Award className="w-3 h-3" /> {Math.round(session.evaluationScore)}点
                        </Badge>
                      )}
                      {session.needHumanReview && (
                        <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-600">
                          確認推奨
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>
                        {new Date(session.created_date).toLocaleString("ja-JP", {
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <span>時間: {durationMin}分</span>
                      {session.summary && <span className="line-clamp-1">{session.summary}</span>}
                    </div>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                  )}
                </button>

                {isExpanded && (
                  <div className="border-t border-border p-4 space-y-4">
                    {session.summary && (
                      <div className="space-y-2">
                        <p className="text-sm font-medium">セッション要約</p>
                        <p className="text-sm text-muted-foreground">{session.summary}</p>
                      </div>
                    )}

                    {session.evaluationScore !== undefined && (
                      <div className="space-y-2">
                        <p className="text-sm font-medium">評価スコア</p>
                        <div className="flex items-center gap-4">
                          <div className="text-2xl font-bold text-primary">{Math.round(session.evaluationScore)}</div>
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary"
                              style={{ width: `${Math.min(session.evaluationScore, 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {session.advice && (
                      <div className="space-y-2">
                        <p className="text-sm font-medium">フィードバック</p>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{session.advice}</p>
                      </div>
                    )}

                    {session.actionItems?.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-sm font-medium">アクションアイテム</p>
                        <ul className="text-sm text-muted-foreground space-y-1">
                          {session.actionItems.map((item, i) => (
                            <li key={i} className="flex gap-2">
                              <span>→</span> {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {session.transcript && (
                      <details className="space-y-2">
                        <summary className="text-sm font-medium cursor-pointer hover:text-primary">
                          会話記録を表示
                        </summary>
                        <div className="bg-muted/30 rounded-lg p-3 text-xs whitespace-pre-wrap max-h-64 overflow-y-auto font-mono">
                          {session.transcript}
                        </div>
                      </details>
                    )}

                    <div className="flex gap-2 pt-2 border-t">
                      <Button size="sm" variant="outline" className="text-xs">
                        Q&Aレビューに登録
                      </Button>
                      <Button size="sm" variant="outline" className="text-xs">
                        ナレッジ候補に追加
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}