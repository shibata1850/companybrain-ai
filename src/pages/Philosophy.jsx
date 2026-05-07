import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Plus, Heart, Pencil, Trash2, Target, Eye, Compass, Scale, BookOpen } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";

const CLIENT_ID = "demo-company-001";

const categoryMap = {
  mission: { label: "ミッション", icon: Target, color: "text-blue-500 bg-blue-500/10" },
  vision: { label: "ビジョン", icon: Eye, color: "text-purple-500 bg-purple-500/10" },
  values: { label: "バリュー", icon: Heart, color: "text-rose-500 bg-rose-500/10" },
  criteria: { label: "判断基準", icon: Scale, color: "text-amber-500 bg-amber-500/10" },
  policy: { label: "ポリシー", icon: Compass, color: "text-emerald-500 bg-emerald-500/10" },
  other: { label: "その他", icon: BookOpen, color: "text-gray-500 bg-gray-500/10" },
};

export default function Philosophy() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ category: "mission", title: "", content: "", priority: 1 });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["philosophy"],
    queryFn: () => base44.entities.Philosophy.filter({ clientCompanyId: CLIENT_ID }),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Philosophy.create({ ...data, clientCompanyId: CLIENT_ID }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["philosophy"] });
      closeDialog();
      toast({ title: "登録完了" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Philosophy.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["philosophy"] });
      closeDialog();
      toast({ title: "更新完了" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Philosophy.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["philosophy"] });
      toast({ title: "削除完了" });
    },
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ category: "mission", title: "", content: "", priority: 1 });
    setDialogOpen(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setForm({ category: item.category, title: item.title, content: item.content, priority: item.priority || 1 });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditing(null);
  };

  const handleSave = () => {
    if (editing) {
      updateMutation.mutate({ id: editing.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const grouped = Object.keys(categoryMap).reduce((acc, key) => {
    acc[key] = items.filter((i) => i.category === key);
    return acc;
  }, {});

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <PageHeader
        title="理念・判断基準"
        description="AIが回答時に参照する企業理念、価値観、判断基準を登録します。"
        actions={
          <Button onClick={openCreate} className="gap-2">
            <Plus className="w-4 h-4" /> 新規登録
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <Card className="p-12 text-center bg-card border-border/50">
          <Heart className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-muted-foreground text-sm">まだ理念が登録されていません。</p>
          <Button onClick={openCreate} variant="outline" className="mt-4 gap-2">
            <Plus className="w-4 h-4" /> 最初の理念を登録する
          </Button>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([key, groupItems]) => {
            if (groupItems.length === 0) return null;
            const cat = categoryMap[key];
            const IconComp = cat.icon;
            return (
              <div key={key}>
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-7 h-7 rounded-lg ${cat.color} flex items-center justify-center`}>
                    <IconComp className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-semibold">{cat.label}</h3>
                  <Badge variant="secondary" className="text-[10px]">{groupItems.length}</Badge>
                </div>
                <div className="grid gap-3">
                  {groupItems.map((item) => (
                    <Card key={item.id} className="p-5 bg-card border-border/50 group">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-sm">{item.title}</h4>
                          <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{item.content}</p>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-3">
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(item)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => deleteMutation.mutate(item.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "理念を編集" : "理念を新規登録"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">カテゴリ</Label>
              <Select value={form.category} onValueChange={(v) => setForm(p => ({ ...p, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(categoryMap).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">タイトル</Label>
              <Input value={form.title} onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))} placeholder="例：お客様第一主義" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">内容</Label>
              <Textarea value={form.content} onChange={(e) => setForm(p => ({ ...p, content: e.target.value }))} placeholder="詳細な内容を記述..." rows={5} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>キャンセル</Button>
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
              {editing ? "更新する" : "登録する"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}