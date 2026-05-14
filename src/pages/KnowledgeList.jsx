import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { CheckCircle, XCircle, Search, FileText, Globe, Users, Crown, Layers } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import { useClientCompanyId } from "@/lib/useClientCompanyId";

const statusMap = {
  pending: { label: "承認待ち", className: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  approved: { label: "承認済み", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  rejected: { label: "却下", className: "bg-destructive/10 text-destructive border-destructive/20" },
};

const scopeMap = {
  all: { label: "すべて", icon: Layers },
  external: { label: "社外", icon: Globe },
  internal: { label: "社内", icon: Users },
  executive: { label: "経営者", icon: Crown },
};

export default function KnowledgeList() {
  const CLIENT_ID = useClientCompanyId();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["knowledge"],
    queryFn: () => base44.entities.Knowledge.filter({ clientCompanyId: CLIENT_ID }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Knowledge.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge"] });
      toast({ title: "更新しました" });
    },
  });

  const filtered = items.filter((item) => {
    const matchSearch = !search || item.title?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || item.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <PageHeader title="ナレッジ一覧・承認管理" description="登録されたナレッジ資料の確認と承認を行います。" />

      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="検索..." className="pl-9" />
        </div>
        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList>
            <TabsTrigger value="all">すべて</TabsTrigger>
            <TabsTrigger value="pending">承認待ち</TabsTrigger>
            <TabsTrigger value="approved">承認済み</TabsTrigger>
            <TabsTrigger value="rejected">却下</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center bg-card border-border/50">
          <FileText className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-muted-foreground text-sm">ナレッジがありません。</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => {
            const st = statusMap[item.status] || statusMap.pending;
            const sc = scopeMap[item.scope] || scopeMap.all;
            const ScopeIcon = sc.icon;
            return (
              <Card key={item.id} className="p-5 bg-card border-border/50">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-sm truncate">{item.title}</h3>
                      <Badge variant="outline" className={`text-[10px] ${st.className}`}>{st.label}</Badge>
                      <Badge variant="outline" className="text-[10px] gap-1">
                        <ScopeIcon className="w-3 h-3" /> {sc.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{item.content || item.summary || "内容なし"}</p>
                    {item.tags && (
                      <div className="flex gap-1 mt-2">
                        {item.tags.split(",").map((tag, i) => (
                          <Badge key={i} variant="secondary" className="text-[10px]">{tag.trim()}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  {item.status === "pending" && (
                    <div className="flex gap-1.5 shrink-0">
                      <Button size="sm" variant="outline" className="gap-1 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10"
                        onClick={() => updateMutation.mutate({ id: item.id, data: { status: "approved" } })}>
                        <CheckCircle className="w-3.5 h-3.5" /> 承認
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                        onClick={() => updateMutation.mutate({ id: item.id, data: { status: "rejected" } })}>
                        <XCircle className="w-3.5 h-3.5" /> 却下
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}