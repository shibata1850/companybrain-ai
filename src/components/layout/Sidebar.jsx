import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Building2, Heart, FileText, FolderOpen,
  MessageSquare, Globe, Users, Crown, FileVideo, Film,
  BarChart3, CreditCard, Settings, ChevronLeft, ChevronRight,
  Brain, ScrollText, ClipboardList, Shield
} from "lucide-react";
import { cn } from "@/lib/utils";

const navGroups = [
  {
    label: "概要",
    items: [
      { icon: LayoutDashboard, label: "ダッシュボード", path: "/" },
    ]
  },
  {
    label: "企業データ",
    items: [
      { icon: Building2, label: "会社プロフィール", path: "/company-profile" },
      { icon: Heart, label: "理念・判断基準", path: "/philosophy" },
      { icon: FileText, label: "ナレッジ登録", path: "/knowledge-upload" },
      { icon: FolderOpen, label: "ナレッジ一覧", path: "/knowledge-list" },
    ]
  },
  {
    label: "AIチャット",
    items: [
      { icon: Brain, label: "AIチャット（統合）", path: "/ai-chat" },
      { icon: Globe, label: "社外向けAI", path: "/chat-external" },
      { icon: Globe, label: "社外向けプレビュー", path: "/public-ai-preview" },
      { icon: Users, label: "社内向けAI", path: "/chat-internal" },
      { icon: Users, label: "社内向けAI（新）", path: "/internal-ai-chat" },
      { icon: Crown, label: "経営者向けAI", path: "/chat-executive" },
      { icon: Crown, label: "経営者向けAI（新）", path: "/executive-ai-chat" },
    ]
  },
  {
    label: "動画生成",
    items: [
      { icon: ScrollText, label: "台本生成", path: "/scripts" },
      { icon: Film, label: "動画スタジオ", path: "/video-studio" },
      { icon: FileVideo, label: "生成動画一覧", path: "/videos" },
    ]
  },
  {
    label: "管理",
    items: [
      { icon: ClipboardList, label: "回答ログ", path: "/answer-logs" },
      { icon: BarChart3, label: "経営指標", path: "/executive-dashboard" },
      { icon: CreditCard, label: "料金プラン・利用状況", path: "/usage-and-billing" },
      { icon: Settings, label: "設定", path: "/settings" },
      { icon: Shield, label: "ユーザー設定", path: "/admin-user-settings" },
    ]
  }
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  return (
    <aside className={cn(
      "fixed left-0 top-0 h-screen bg-sidebar text-sidebar-foreground z-40 transition-all duration-300 flex flex-col border-r border-sidebar-border",
      collapsed ? "w-[68px]" : "w-[260px]"
    )}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 h-16 border-b border-sidebar-border shrink-0">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center shrink-0">
          <Brain className="w-5 h-5 text-white" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <p className="text-sm font-bold text-sidebar-foreground tracking-tight leading-tight">CompanyBrain AI</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
        {navGroups.map((group) => (
          <div key={group.label}>
            {!collapsed && (
              <p className="text-[10px] uppercase tracking-widest text-sidebar-foreground/40 font-semibold px-2 mb-2">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-primary font-medium"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                    )}
                  >
                    <item.icon className={cn("w-[18px] h-[18px] shrink-0", isActive && "text-sidebar-primary")} />
                    {!collapsed && <span>{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Powered by */}
      {!collapsed && (
        <div className="px-5 py-4 border-t border-sidebar-border">
          <p className="text-[10px] text-sidebar-foreground/30 mb-1.5 tracking-wide">Powered by</p>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-gradient-to-br from-primary to-accent flex items-center justify-center shrink-0">
              <span className="text-[8px] font-black text-white leading-none">SD</span>
            </div>
            <span className="text-[11px] font-semibold text-sidebar-foreground/50 tracking-tight">SOFTDOING株式会社</span>
          </div>
        </div>
      )}

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-center h-12 border-t border-sidebar-border text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
      >
        {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>
    </aside>
  );
}