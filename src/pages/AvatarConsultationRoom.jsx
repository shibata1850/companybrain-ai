import React, { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { AlertCircle, Send, Loader2, RotateCcw, User, Brain } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import ReactMarkdown from "react-markdown";

const CLIENT_ID = "69fc3d9af68187d823c1a41b";

const PURPOSES = [
  { value: "consultation", label: "仕事相談" },
  { value: "training", label: "新人研修" },
  { value: "roleplay", label: "営業ロールプレイ" },
  { value: "decision_making", label: "経営判断の論点整理" },
  { value: "customer_service", label: "顧客対応確認" },
];

export default function AvatarConsultationRoom() {
  const { toast } = useToast();
  const scrollRef = useRef(null);
  const [selectedAvatarId, setSelectedAvatarId] = useState("");
  const [selectedPurpose, setSelectedPurpose] = useState("consultation");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [sessionId, setSessionId] = useState(null);

  const { data: avatars = [] } = useQuery({
    queryKey: ["activeAvatars", CLIENT_ID],
    queryFn: () =>
      base44.entities.ExecutiveAvatarProfile.filter({
        clientCompanyId: CLIENT_ID,
        status: "active",
        consentStatus: "approved",
      }),
  });

  const { data: session } = useQuery({
    queryKey: ["session", sessionId],
    queryFn: () =>
      sessionId ? base44.entities.AvatarConversationSession.get(sessionId) : null,
    enabled: !!sessionId,
    refetchInterval: 2000,
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const startSessionMutation = useMutation({
    mutationFn: () =>
      base44.functions.invoke("startExecutiveAvatarSession", {
        clientCompanyId: CLIENT_ID,
        avatarProfileId: selectedAvatarId,
        purpose: selectedPurpose,
      }),
    onSuccess: (res) => {
      const data = res.data;
      setSessionId(data.session.id);
      if (data.session.embedUrl) {
        // LiveAvatar埋め込みURL
        window.open(data.session.embedUrl, "_blank");
      }
      toast({ title: "セッション開始", description: "相談室が開始されました。" });
    },
    onError: (err) => {
      toast({ title: "エラー", description: err.message, variant: "destructive" });
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (message) => {
      if (!sessionId) return;
      // TEXT_FALLBACK モードではテキストチャットで対応
      const res = await base44.functions.invoke("askCompanyBrain", {
        clientCompanyId: CLIENT_ID,
        question: message,
        channel: "executive",
      });
      return res.data;
    },
    onSuccess: (data) => {
      setMessages((prev) => [...prev, { role: "assistant", ...data }]);
    },
    onError: (err) => {
      toast({ title: "エラー", description: err.message, variant: "destructive" });
    },
  });

  const handleSend = () => {
    if (!input.trim() || !sessionId) return;
    const q = input.trim();
    setMessages((prev) => [...prev, { role: "user", content: q }]);
    setInput("");
    sendMessageMutation.mutate(q);
  };

  if (avatars.length === 0) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <PageHeader
          title="アバター相談室"
          description="ExecutiveBrain Avatar に経営判断や業務について相談できます。"
        />
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground">
            利用可能なアバターがありません。まずアバターを作成してください。
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="アバター相談室"
        description="ExecutiveBrain Avatar に経営判断や業務について相談できます。"
      />

      {!sessionId ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">セッション設定</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">アバター選択</label>
              <Select value={selectedAvatarId} onValueChange={setSelectedAvatarId}>
                <SelectTrigger>
                  <SelectValue placeholder="アバターを選択" />
                </SelectTrigger>
                <SelectContent>
                  {avatars.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.avatarName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">相談内容</label>
              <Select value={selectedPurpose} onValueChange={setSelectedPurpose}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PURPOSES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={() => startSessionMutation.mutate()}
              disabled={!selectedAvatarId || startSessionMutation.isPending}
              className="w-full gap-2 bg-primary hover:bg-primary/90"
            >
              {startSessionMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "相談を開始"
              )}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-50 border border-blue-200">
            <AlertCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-sm text-blue-700 leading-relaxed">
              <p className="font-medium">AIアバターについて</p>
              <p className="mt-1">
                このアバターはAIにより生成された教育・判断支援用アバターです。本人そのものではありません。最終判断は人間の責任者が行います。
              </p>
            </div>
          </div>

          <Card className="flex flex-col" style={{ height: "500px" }}>
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
                    <Brain className="w-6 h-6 text-primary/50" />
                  </div>
                  <p className="text-sm text-muted-foreground">質問をどうぞ。</p>
                </div>
              ) : (
                messages.map((msg, i) => (
                  <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    {msg.role === "assistant" && (
                      <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                        <Brain className="w-3.5 h-3.5 text-primary" />
                      </div>
                    )}
                    <div
                      className={`max-w-[70%] rounded-xl px-4 py-3 text-sm ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted/60 text-foreground"
                      }`}
                    >
                      {msg.role === "user" ? (
                        <p>{msg.content}</p>
                      ) : (
                        <ReactMarkdown className="prose prose-sm dark:prose-invert max-w-none [&>p]:mb-1 [&>p:last-child]:mb-0">
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
                ))
              )}
              {sendMessageMutation.isPending && (
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

            <div className="border-t border-border p-3 flex gap-2 items-end">
              <Button size="icon" variant="ghost" className="shrink-0 h-9 w-9">
                <RotateCcw className="w-3.5 h-3.5" />
              </Button>
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="質問を入力... (Shift+Enterで改行)"
                rows={1}
                className="resize-none min-h-[40px] max-h-24 flex-1 text-sm"
              />
              <Button
                onClick={handleSend}
                disabled={!input.trim() || sendMessageMutation.isPending}
                className="shrink-0 h-9"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}