import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useClientCompanyId } from "@/lib/useClientCompanyId";
import { useAuth } from "@/lib/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import {
  Brain, Plus, LogOut, Pencil, MessageCircle, Loader2,
  Users, Sparkles,
} from "lucide-react";

const STATUS_OPTIONS = [
  { value: "draft", label: "下書き" },
  { value: "active", label: "稼働中" },
  { value: "archived", label: "アーカイブ" },
];

const STATUS_BADGE = {
  draft: { label: "下書き", className: "bg-slate-100 text-slate-600 hover:bg-slate-100" },
  active: { label: "稼働中", className: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" },
  archived: { label: "アーカイブ", className: "bg-slate-100 text-slate-400 hover:bg-slate-100" },
};

export default function BrainPersonDashboard() {
  const navigate = useNavigate();
  const clientCompanyId = useClientCompanyId();
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [editingId, setEditingId] = useState(null);

  const { data: persons = [], isLoading } = useQuery({
    queryKey: ["brain-persons", clientCompanyId],
    queryFn: () => api.listBrainPersons(),
    enabled: !!clientCompanyId,
  });

  const sorted = useMemo(() => {
    const order = { active: 0, draft: 1, archived: 2 };
    return [...persons].sort((a, b) => {
      const oa = order[a.status] ?? 99;
      const ob = order[b.status] ?? 99;
      if (oa !== ob) return oa - ob;
      return (b.created_at || "").localeCompare(a.created_at || "");
    });
  }, [persons]);

  const editingPerson = useMemo(
    () => persons.find((p) => p.id === editingId) || null,
    [persons, editingId],
  );

  const openStudio = (id) => navigate(`/studio?personId=${encodeURIComponent(id)}`);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-700">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
              <Brain className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900">CompanyBrain AI</div>
              <div className="text-[11px] text-slate-500 tracking-widest uppercase">Brain Persons</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-sm text-slate-500 hidden sm:block">{user?.email}</div>
            <Button
              variant="ghost"
              size="sm"
              onClick={logout}
              className="text-slate-500 hover:text-slate-900"
            >
              <LogOut className="w-4 h-4 mr-1" />
              ログアウト
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">
              会社の Brain Person
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              経営者・上司・熟練社員から生まれた AI アバターを管理します。
            </p>
          </div>
          <Button
            onClick={() => navigate("/upload")}
            className="bg-gradient-to-br from-cyan-500 to-blue-600 hover:opacity-90 text-white shadow-md shadow-cyan-500/20"
          >
            <Plus className="w-4 h-4 mr-1" />
            新しい Brain を追加
          </Button>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-24 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            読み込み中...
          </div>
        )}

        {!isLoading && sorted.length === 0 && (
          <Card className="border-dashed border-2 border-slate-200">
            <CardContent className="py-16 text-center">
              <Users className="w-10 h-10 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500 mb-4">まだ Brain Person がいません。</p>
              <Button onClick={() => navigate("/upload")} variant="outline">
                <Plus className="w-4 h-4 mr-1" />
                最初の Brain を作る
              </Button>
            </CardContent>
          </Card>
        )}

        {!isLoading && sorted.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {sorted.map((p) => (
              <BrainPersonCard
                key={p.id}
                person={p}
                onOpen={() => openStudio(p.id)}
                onEdit={() => setEditingId(p.id)}
              />
            ))}
          </div>
        )}
      </main>

      <EditBrainPersonDialog
        person={editingPerson}
        open={!!editingPerson}
        onOpenChange={(open) => !open && setEditingId(null)}
        onSaved={async () => {
          await queryClient.invalidateQueries({ queryKey: ["brain-persons"] });
          setEditingId(null);
          toast({ title: "保存しました" });
        }}
      />
    </div>
  );
}

function BrainPersonCard({ person, onOpen, onEdit }) {
  const status = STATUS_BADGE[person.status] || STATUS_BADGE.draft;
  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <Badge className={status.className}>{status.label}</Badge>
        </div>
        <h3 className="text-lg font-semibold text-slate-900 leading-tight truncate">
          {person.full_name || "Untitled Brain"}
        </h3>
        <div className="text-xs text-slate-500 mt-1 min-h-[16px] truncate">
          {[person.role_title, person.department].filter(Boolean).join(" / ") || "（役職・部署 未設定）"}
        </div>
        {person.expertise_domain && (
          <p className="text-sm text-slate-600 mt-3 line-clamp-2">{person.expertise_domain}</p>
        )}
        <div className="flex flex-wrap gap-1 mt-4">
          {person.internal_use_allowed && (
            <Badge variant="outline" className="text-[10px] border-slate-200 text-slate-500">社内利用 可</Badge>
          )}
          {person.external_use_allowed && (
            <Badge variant="outline" className="text-[10px] border-amber-200 text-amber-700 bg-amber-50">社外利用 可</Badge>
          )}
        </div>
        <div className="flex gap-2 mt-5">
          <Button onClick={onOpen} size="sm" className="flex-1">
            <MessageCircle className="w-4 h-4 mr-1" />
            対話を開く
          </Button>
          <Button onClick={onEdit} size="sm" variant="outline">
            <Pencil className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function EditBrainPersonDialog({ person, open, onOpenChange, onSaved }) {
  const { toast } = useToast();
  const [form, setForm] = useState(null);

  // Reset local form when a new person is selected
  React.useEffect(() => {
    if (person) {
      setForm({
        full_name: person.full_name || "",
        role_title: person.role_title || "",
        department: person.department || "",
        expertise_domain: person.expertise_domain || "",
        speaking_style: person.speaking_style || "",
        values_note: person.values_note || "",
        status: person.status || "draft",
        internal_use_allowed: !!person.internal_use_allowed,
        external_use_allowed: !!person.external_use_allowed,
      });
    } else {
      setForm(null);
    }
  }, [person]);

  const saveMut = useMutation({
    mutationFn: (body) => api.updateBrainPerson(person.id, body),
    onSuccess: () => onSaved?.(),
    onError: (err) => toast({
      title: "保存に失敗しました",
      description: err?.message || "通信エラーの可能性があります。",
      variant: "destructive",
    }),
  });

  if (!form) return null;

  const update = (k, v) => setForm((s) => ({ ...s, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Brain Person を編集</DialogTitle>
          <DialogDescription>
            アバターの基本情報・話し方・利用範囲を設定します。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="full_name">表示名</Label>
            <Input
              id="full_name"
              value={form.full_name}
              onChange={(e) => update("full_name", e.target.value)}
              placeholder="例: 橋本社長"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="role_title">役職</Label>
              <Input
                id="role_title"
                value={form.role_title}
                onChange={(e) => update("role_title", e.target.value)}
                placeholder="例: 代表取締役"
              />
            </div>
            <div>
              <Label htmlFor="department">部署</Label>
              <Input
                id="department"
                value={form.department}
                onChange={(e) => update("department", e.target.value)}
                placeholder="例: 経営本部"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="expertise_domain">専門領域</Label>
            <Input
              id="expertise_domain"
              value={form.expertise_domain}
              onChange={(e) => update("expertise_domain", e.target.value)}
              placeholder="例: 営業戦略、顧客対応"
            />
          </div>
          <div>
            <Label htmlFor="speaking_style">話し方の特徴</Label>
            <Textarea
              id="speaking_style"
              value={form.speaking_style}
              onChange={(e) => update("speaking_style", e.target.value)}
              rows={2}
              placeholder="例: 結論から話す、データを必ず添える"
            />
          </div>
          <div>
            <Label htmlFor="values_note">価値観メモ</Label>
            <Textarea
              id="values_note"
              value={form.values_note}
              onChange={(e) => update("values_note", e.target.value)}
              rows={3}
              placeholder="例: 顧客の声を最優先にし、長期的な関係を重視する"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="status">ステータス</Label>
              <Select value={form.status} onValueChange={(v) => update("status", v)}>
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col justify-end gap-3 pb-1">
              <div className="flex items-center justify-between">
                <Label htmlFor="internal_use_allowed" className="text-sm font-normal text-slate-600">社内利用</Label>
                <Switch
                  id="internal_use_allowed"
                  checked={form.internal_use_allowed}
                  onCheckedChange={(v) => update("internal_use_allowed", v)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="external_use_allowed" className="text-sm font-normal text-slate-600">社外利用</Label>
                <Switch
                  id="external_use_allowed"
                  checked={form.external_use_allowed}
                  onCheckedChange={(v) => update("external_use_allowed", v)}
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saveMut.isPending}>
            キャンセル
          </Button>
          <Button
            onClick={() => saveMut.mutate(form)}
            disabled={saveMut.isPending || !form.full_name.trim()}
          >
            {saveMut.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
