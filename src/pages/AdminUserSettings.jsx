import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Save, User, Shield, Lock } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";

const BUSINESS_ROLES = [
  { value: "softdoing_admin", label: "SOFTDOING管理者 (softdoing_admin)" },
  { value: "client_admin", label: "企業管理者 (client_admin)" },
  { value: "executive", label: "経営者 (executive)" },
  { value: "editor", label: "編集者 (editor)" },
  { value: "employee", label: "従業員 (employee)" },
  { value: "viewer", label: "閲覧者 (viewer)" },
];

// ロール正規化（Backend Function 群と同一ロジック）
function resolveBusinessRole(user) {
  const businessRole = String(user?.businessRole || "").trim();
  if (businessRole) return businessRole;
  const base44Role = String(user?.role || "").toLowerCase().trim();
  if (base44Role === "admin") return "softdoing_admin";
  return "viewer";
}

function isGlobalAdmin(user) {
  return resolveBusinessRole(user) === "softdoing_admin"
    || String(user?.role || "").toLowerCase() === "admin";
}

export default function AdminUserSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [me, setMe] = useState(null);
  // 自分で変更可能なのは displayName / department のみ
  const [form, setForm] = useState({
    displayName: "",
    department: "",
  });

  const { data: companies = [] } = useQuery({
    queryKey: ["clientCompanies"],
    queryFn: () => base44.entities.ClientCompany.list(),
    enabled: !!me && isGlobalAdmin(me), // 横断管理者のみ企業一覧を取得
  });

  useEffect(() => {
    base44.auth.me().then((user) => {
      setMe(user);
      setForm({
        displayName: user.displayName || "",
        department: user.department || "",
      });
    });
  }, []);

  const saveMutation = useMutation({
    mutationFn: () => {
      // 自分で更新できるのは displayName / department のみ
      // businessRole / clientCompanyId は Base44 管理画面 or 別の admin Function 経由で変更すること
      return base44.auth.updateMe({
        displayName: form.displayName,
        department: form.department,
      });
    },
    onSuccess: () => {
      toast({
        title: "保存完了",
        description: "表示名・部署を更新しました。",
      });
      queryClient.invalidateQueries();
    },
    onError: (err) => {
      toast({
        title: "保存失敗",
        description: err?.message || "詳細はコンソールを確認してください。",
        variant: "destructive",
      });
    },
  });

  if (!me) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const currentRole = resolveBusinessRole(me);
  const userIsAdmin = isGlobalAdmin(me);
  const currentCompany = (companies || []).find((c) => c.id === me.clientCompanyId);

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <PageHeader
        title="ユーザー設定"
        description="表示名・部署を変更できます。ビジネスロールと所属企業は、安全のため自分では変更できません。"
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
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">{me.full_name || me.email}</p>
            <p className="text-xs text-muted-foreground">{me.email}</p>
            <p className="text-xs text-muted-foreground">
              Base44ロール: <span className="font-medium">{me.role}</span>
            </p>
          </div>
        </div>

        {/* 編集可能フィールド */}
        <div className="space-y-1.5">
          <Label className="text-xs">表示名 (displayName)</Label>
          <Input
            value={form.displayName}
            onChange={(e) => setForm(p => ({ ...p, displayName: e.target.value }))}
            placeholder="例: 山田 太郎"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">部署名 (department)</Label>
          <Input
            value={form.department}
            onChange={(e) => setForm(p => ({ ...p, department: e.target.value }))}
            placeholder="例: 開発部"
          />
        </div>

        {/* ロックされた表示専用フィールド：businessRole */}
        <div className="space-y-1.5">
          <Label className="text-xs flex items-center gap-1">
            <Shield className="w-3 h-3" /> ビジネスロール (businessRole)
            <Badge variant="outline" className="ml-2 text-[10px] gap-1">
              <Lock className="w-2.5 h-2.5" />読み取り専用
            </Badge>
          </Label>
          <div className="px-3 py-2 text-sm rounded-md bg-muted/40 border border-border/50 text-muted-foreground">
            {BUSINESS_ROLES.find((r) => r.value === currentRole)?.label || `${currentRole}`}
          </div>
          <p className="text-[11px] text-muted-foreground">
            自分自身のロール変更はできません。変更が必要な場合は softdoing_admin に依頼してください。
          </p>
        </div>

        {/* ロックされた表示専用フィールド：clientCompanyId */}
        <div className="space-y-1.5">
          <Label className="text-xs flex items-center gap-1">
            所属企業 (clientCompanyId)
            <Badge variant="outline" className="ml-2 text-[10px] gap-1">
              <Lock className="w-2.5 h-2.5" />読み取り専用
            </Badge>
          </Label>
          <div className="px-3 py-2 text-sm rounded-md bg-muted/40 border border-border/50 text-muted-foreground">
            {currentCompany?.companyName || me.clientCompanyId || "未設定"}
          </div>
          {me.clientCompanyId && (
            <p className="text-[11px] text-muted-foreground">ID: {me.clientCompanyId}</p>
          )}
        </div>

        {/* softdoing_admin 専用の管理セクション */}
        {userIsAdmin && (
          <div className="pt-4 border-t border-border/50">
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-4 h-4 text-amber-600" />
              <p className="text-sm font-semibold text-amber-900">SOFTDOING管理者向け</p>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              他ユーザーのロール／所属企業の変更は Base44 管理画面、または専用の admin Function 経由で行ってください。
              この画面では誰も自分のロールを上書きできないようにしています（自己昇格防止）。
            </p>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>登録企業数: <span className="font-medium text-foreground">{companies?.length ?? 0}</span></p>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
