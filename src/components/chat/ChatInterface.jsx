import React, { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Send, Loader2, Brain, User, RotateCcw } from "lucide-react";
import ReactMarkdown from "react-markdown";

const CLIENT_ID = "demo-company-001";

const modeLabels = {
  external: "社外向けAI",
  internal: "社内向けAI",
  executive: "経営者向けAI",
};

const modeInstructions = {
  external: "あなたは会社の公式な窓口AIです。社外の顧客やパートナーに対して丁寧で信頼感のある回答をしてください。社内機密は回答に含めないでください。",
  internal: "あなたは社内向けアシスタントAIです。従業員向けに社内ルール、ナレッジ、業務手順について詳しく回答してください。",
  executive: "あなたは経営者向けアドバイザーAIです。経営判断、戦略策定、リスク分析の観点から、すべてのナレッジを活用して回答してください。",
};

export default function ChatInterface({ mode, companyData, knowledgeData, philosophyData }) {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const buildContext = () => {
    const company = companyData?.[0];
    let ctx = "";
    if (company) {
      ctx += `【会社情報】\n会社名: ${company.companyName}\n業種: ${company.industry || ""}\n概要: ${company.description || ""}\nサービス: ${company.services || ""}\nターゲット: ${company.targetCustomer || ""}\n回答トーン: ${company.tone || "professional"}\n\n`;
    }
    if (philosophyData?.length > 0) {
      ctx += "【企業理念・価値観】\n";
      philosophyData.forEach((p) => { ctx += `${p.title}: ${p.content}\n`; });
      ctx += "\n";
    }
    const scopedKnowledge = (knowledgeData || []).filter(
      (k) => k.status === "approved" && (k.scope === "all" || k.scope === mode)
    );
    if (scopedKnowledge.length > 0) {
      ctx += "【ナレッジ】\n";
      scopedKnowledge.forEach((k) => { ctx += `${k.title}: ${k.content?.slice(0, 500) || ""}\n`; });
    }
    return ctx;
  };

  const chatMutation = useMutation({
    mutationFn: async (question) => {
      const context = buildContext();
      const systemPrompt = `${modeInstructions[mode]}\n\n以下の企業データを基に回答してください。回答は必ず日本語で、企業の口調に合わせてください。\n\n${context}`;
      const response = await base44.integrations.Core.InvokeLLM({
        prompt: `${systemPrompt}\n\n質問: ${question}`,
        response_json_schema: {
          type: "object",
          properties: { answer: { type: "string" } },
        },
      });
      await base44.entities.ChatLog.create({
        clientCompanyId: CLIENT_ID,
        mode,
        question,
        answer: response.answer,
        sessionId: Date.now().toString(),
      });
      queryClient.invalidateQueries({ queryKey: ["chatLogs"] });
      return response.answer;
    },
    onSuccess: (answer) => {
      setMessages((prev) => [...prev, { role: "assistant", content: answer }]);
    },
  });

  const handleSend = () => {
    if (!input.trim()) return;
    const q = input.trim();
    setMessages((prev) => [...prev, { role: "user", content: q }]);
    setInput("");
    chatMutation.mutate(q);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)]">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
          <Brain className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">{modeLabels[mode]}</h2>
          <p className="text-[11px] text-muted-foreground">
            {companyData?.[0]?.companyName || "CompanyBrain AI"} — {mode === "external" ? "社外公開範囲" : mode === "internal" ? "社内限定" : "全データアクセス"}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center mb-4">
              <Brain className="w-8 h-8 text-primary/50" />
            </div>
            <h3 className="font-semibold text-lg mb-1">{modeLabels[mode]}</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              登録された企業情報とナレッジを基に、AIが会社らしく回答します。質問を入力してください。
            </p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
            {msg.role === "assistant" && (
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                <Brain className="w-4 h-4 text-primary" />
              </div>
            )}
            <Card className={`p-4 max-w-[75%] text-sm ${
              msg.role === "user"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card border-border/50"
            }`}>
              <ReactMarkdown className="prose prose-sm dark:prose-invert max-w-none [&>p]:mb-2 [&>p:last-child]:mb-0">
                {msg.content}
              </ReactMarkdown>
            </Card>
            {msg.role === "user" && (
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-1">
                <User className="w-4 h-4 text-muted-foreground" />
              </div>
            )}
          </div>
        ))}
        {chatMutation.isPending && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Brain className="w-4 h-4 text-primary" />
            </div>
            <Card className="p-4 bg-card border-border/50">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
            </Card>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-4 border-t border-border">
        <div className="flex gap-2 items-end max-w-3xl mx-auto">
          <Button size="icon" variant="ghost" onClick={() => setMessages([])} className="shrink-0">
            <RotateCcw className="w-4 h-4" />
          </Button>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="質問を入力..."
            rows={1}
            className="resize-none min-h-[44px] max-h-32"
          />
          <Button onClick={handleSend} disabled={!input.trim() || chatMutation.isPending} className="shrink-0 gap-1">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}