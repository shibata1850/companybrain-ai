import React, { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import {
  Brain, Send, Loader2, Building2, Briefcase, HelpCircle,
  MessageSquare, AlertCircle, RotateCcw, User, ChevronDown, ChevronUp
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useClientCompanyId } from "@/lib/useClientCompanyId";

export default function PublicAIPreview() {
  const CLIENT_ID = useClientCompanyId();
  const { toast } = useToast();
  const scrollRef = useRef(null);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [openFaq, setOpenFaq] = useState(null);

  // 会社情報
  const { data: companies = [] } = useQuery({
    queryKey: ["clientCompany", CLIENT_ID],
    queryFn: () => base44.entities.ClientCompany.filter({ id: CLIENT_ID }),
  });
  const company = companies[0] || null;

  // public + approved の KnowledgeChunk のみ取得
  const { data: chunks = [] } = useQuery({
    queryKey: ["publicChunks", CLIENT_ID],
    queryFn: () =>
      base44.entities.KnowledgeChunk.filter({
        clientCompanyId: CLIENT_ID,
        audienceScope: "public",
        status: "approved",
      }),
  });

  // カテゴリ別に分類
  const companyChunks = chunks.filter(c => c.category === "company");
  const serviceChunks = chunks.filter(c => c.category === "service");
  const faqChunks = chunks.filter(
    c => c.chunkText?.startsWith("Q:") || c.title?.startsWith("FAQ:")
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const chatMutation = useMutation({
    mutationFn: async (question) => {
      const res = await base44.functions.invoke("askCompanyBrain", {
        clientCompanyId: CLIENT_ID,
        question,
        channel: "public",
      });
      return res.data;
    },
    onSuccess: (data) => {
      setMessages(prev => [...prev, { role: "assistant", ...data }]);
    },
    onError: (err) => {
      const errorMsg = err.response?.data?.message || err.message || "質問の送信に失敗しました";
      toast({ title: "エラー", description: errorMsg, variant: "destructive" });
    },
  });

  const handleSend = () => {
    if (!input.trim()) return;
    const q = input.trim();
    setMessages(prev => [...prev, { role: "user", content: q }]);
    setInput("");
    chatMutation.mutate(q);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* ヘッダー */}
      <div className="bg-card border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <Brain className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold">{company?.companyName || "CompanyBrain AI"}</p>
            <p className="text-[10px] text-muted-foreground">社外向けAIプレビュー</p>
          </div>
        </div>
        <Badge variant="outline" className="text-[10px] border-blue-500/30 text-blue-600 bg-blue-500/5">
          公開プレビュー
        </Badge>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">

        {/* 会社説明 */}
        {(company || companyChunks.length > 0) && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Building2 className="w-4 h-4 text-primary" />
              <h2 className="text-base font-semibold">会社について</h2>
            </div>
            <Card className="border-border/50">
              <CardContent className="p-5 space-y-3">
                {company?.companyOverview && (
                  <p className="text-sm text-muted-foreground leading-relaxed">{company.companyOverview}</p>
                )}
                {companyChunks.map(chunk => (
                  <div key={chunk.id} className="pt-2 border-t border-border/40 first:border-0 first:pt-0">
                    <p className="text-xs font-medium mb-1">{chunk.title}</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">{chunk.chunkText}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>
        )}

        {/* サービス説明 */}
        {(company?.mainServices || serviceChunks.length > 0) && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Briefcase className="w-4 h-4 text-primary" />
              <h2 className="text-base font-semibold">サービス・ソリューション</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {company?.mainServices && serviceChunks.length === 0 && (
                <Card className="border-border/50 md:col-span-2">
                  <CardContent className="p-5">
                    <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{company.mainServices}</p>
                  </CardContent>
                </Card>
              )}
              {serviceChunks.map(chunk => (
                <Card key={chunk.id} className="border-border/50">
                  <CardContent className="p-5">
                    <p className="text-xs font-semibold mb-2">{chunk.title}</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">{chunk.chunkText}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* よくある質問 */}
        {faqChunks.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <HelpCircle className="w-4 h-4 text-primary" />
              <h2 className="text-base font-semibold">よくある質問</h2>
            </div>
            <div className="space-y-2">
              {faqChunks.map((chunk, i) => {
                const lines = chunk.chunkText?.split("\n") || [];
                const q = lines.find(l => l.startsWith("Q:"))?.replace("Q:", "").trim() || chunk.title;
                const a = lines.find(l => l.startsWith("A:"))?.replace("A:", "").trim() || "";
                const isOpen = openFaq === i;
                return (
                  <Card key={chunk.id} className="border-border/50 overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors"
                      onClick={() => setOpenFaq(isOpen ? null : i)}
                    >
                      <span className="text-sm font-medium pr-4">{q}</span>
                      {isOpen ? <ChevronUp className="w-4 h-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" />}
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-4 border-t border-border/40">
                        <p className="text-sm text-muted-foreground leading-relaxed pt-3">{a}</p>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </section>
        )}

        {/* チャットUI */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare className="w-4 h-4 text-primary" />
            <h2 className="text-base font-semibold">AIに質問する</h2>
          </div>
          <Card className="border-border/50 flex flex-col" style={{ height: "480px" }}>
            {/* メッセージエリア */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center mb-3">
                    <Brain className="w-6 h-6 text-primary/50" />
                  </div>
                  <p className="text-sm text-muted-foreground">ご質問をどうぞ。AIがお答えします。</p>
                </div>
              )}

              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "assistant" && (
                    <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                      <Brain className="w-3.5 h-3.5 text-primary" />
                    </div>
                  )}
                  <div className={`max-w-[78%] rounded-xl px-4 py-3 text-sm ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/60 text-foreground"
                  }`}>
                    {msg.role === "user" ? (
                      <p>{msg.content}</p>
                    ) : (
                      <ReactMarkdown className="prose prose-sm dark:prose-invert max-w-none [&>p]:mb-2 [&>p:last-child]:mb-0">
                        {msg.answer}
                      </ReactMarkdown>
                    )}
                  </div>
                  {msg.role === "user" && (
                    <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-1">
                      <User className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                  )}
                </div>
              ))}

              {chatMutation.isPending && (
                <div className="flex gap-2">
                  <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Brain className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <div className="bg-muted/60 rounded-xl px-4 py-3">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  </div>
                </div>
              )}
            </div>

            {/* 入力エリア */}
            <div className="border-t border-border p-3 flex gap-2 items-end">
              <Button size="icon" variant="ghost" className="shrink-0 h-9 w-9" onClick={() => setMessages([])}>
                <RotateCcw className="w-3.5 h-3.5" />
              </Button>
              <Textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="質問を入力... (Shift+Enterで改行)"
                rows={1}
                className="resize-none min-h-[40px] max-h-28 flex-1 text-sm"
              />
              <Button
                onClick={handleSend}
                disabled={!input.trim() || chatMutation.isPending}
                className="shrink-0 h-9"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </Card>
        </section>

        {/* 免責注記 */}
        <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/5 border border-amber-500/20">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 leading-relaxed">
            この回答はAIによる自動回答です。正式な契約条件や個別判断は担当者へご確認ください。
          </p>
        </div>

      </div>
    </div>
  );
}