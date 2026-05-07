import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Save, User, Shield } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";

const BUSINESS_ROLES = [
  { value: "softdoing_admin", label: "SOFTDOING管理者 (softdoing_admin)" },
  { value: "client_admin", label: "企業管理者 (client_admin)" },
  { value: "executive", label: "経営者 (executive)" },
  { value: "editor", label: "編集者 (editor)" },
  { value: "employee", label: "従業員 (employee)" },
  { value: "viewer", label: "閲覧者 (viewer)" },
];

export default function AdminUserSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [me, setMe] = useState(null);
  const [form, setForm] = useState({
    businessRole: "",
    clientCompanyId: "",
    displayName: "",
    department: "",
  });

  const { data: companies = [] } = useQuery({
    queryKey: ["clientCompanies"],
    queryFn: () => base44.entities.ClientCompany.list(),
  });

  useEffect(() => {
    base44.auth.me().then((user) => {
      setMe(user);
      setForm({
        businessRole: user.businessRole || "",
        clientCompanyId: user.clientCompanyId || "",
        displayName: user.displayName || "",
        department: user.department || "",
      });
    });
  }, []);

  const saveMutation = useMutation({
    mutationFn: () => base44.auth.updateMe(form),
    onSuccess: () => {
      toast({ title: "保存完了", description: "ユーザー設定を更新しました。" });
      queryClient.invalidateQueries();
    },
  });

  if (!me) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <PageHeader
        title="ユーザー設定（管理者）"
        description="CompanyBrain AI用のビジネスロールと所属企業を設定します。"
        actions={
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="gap-2">
            <Save className="w-4 h-4" />
            {saveMutation.isPending ? "保存中..." : "保存する"}
          </Button>
        }
      />

      <Card className="p-6 space-y-5 bg-card border-border/50">
        {/* 現在のユーザー情報 */}
        <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/40 border border-border/50">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold">{me.full_name || me.email}</p>
            <p className="text-xs text-muted-foreground">{me.email}</p>
            <p className="text-xs text-muted-foreground">Base44ロール: <span className="font-medium">{me.role}</span></p>
          </div>
        </div>

        {/* businessRole */}
        <div className="space-y-1.5">
          <Label className="text-xs flex items-center gap-1">
            <Shield className="w-3 h-3" /> ビジネスロール (businessRole)
          </Label>
          <Select value={form.businessRole} onValueChange={(v) => setForm(p => ({ ...p, businessRole: v }))}>
            <SelectTrigger>
              <SelectValue placeholder="ロールを選択" />
            </SelectTrigger>
            <SelectContent>
              {BUSINESS_ROLES.map(r => (
                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* clientCompanyId */}
        <div className="space-y-1.5">
          <Label className="text-xs">所属企業 (clientCompanyId)</Label>
          <Select value={form.clientCompanyId} onValueChange={(v) => setForm(p => ({ ...p, clientCompanyId: v }))}>
            <SelectTrigger>
              <SelectValue placeholder="企業を選択" />
            </SelectTrigger>
            <SelectContent>
              {companies.map(c => (
                <SelectItem key={c.id} value={c.id}>
                  {c.companyName} <span className="text-muted-foreground text-xs ml-1">({c.id.slice(-8)})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {form.clientCompanyId && (
            <p className="text-xs text-muted-foreground">ID: {form.clientCompanyId}</p>
          )}
        </div>

        {/* displayName */}
        <div className="space-y-1.5">
          <Label className="text-xs">表示名 (displayName)</Label>
          <Input
            value={form.displayName}
            onChange={(e) => setForm(p => ({ ...p, displayName: e.target.value }))}
            placeholder="例: SOFTDOING社"
          />
        </div>

        {/* department */}
        <div className="space-y-1.5">
          <Label className="text-xs">部署名 (department)</Label>
          <Input
            value={form.department}
            onChange={(e) => setForm(p => ({ ...p, department: e.target.value }))}
            placeholder="例: 開発部"
          />
        </div>
      </Card>
    </div>
  );
}