import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";

const TABS = [
  { value: "studio", label: "対話", to: (id) => `/studio?personId=${encodeURIComponent(id)}` },
  { value: "interview", label: "インタビュー", to: (id) => `/persons/${encodeURIComponent(id)}/interview` },
  { value: "policies", label: "方針承認", to: (id) => `/persons/${encodeURIComponent(id)}/policies` },
  { value: "assets", label: "資産", to: (id) => `/persons/${encodeURIComponent(id)}/assets` },
];

export default function BrainPersonSubNav({ person, active, rightSlot }) {
  if (!person) return null;
  return (
    <header className="sticky top-0 z-10 bg-white/85 backdrop-blur border-b border-slate-200">
      <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/" className="text-slate-500 hover:text-slate-900 flex items-center gap-1 text-sm shrink-0">
            <ArrowLeft className="w-4 h-4" />一覧
          </Link>
          <span className="text-slate-300 shrink-0">/</span>
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shrink-0">
              <Brain className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900 truncate">{person.full_name}</div>
              <div className="text-[11px] text-slate-500 truncate">{person.role_title || "役職未設定"}</div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {TABS.map((t) => (
            <Link key={t.value} to={t.to(person.id)}>
              <Button
                size="sm"
                variant={active === t.value ? "secondary" : "ghost"}
                className={active === t.value ? "" : "text-slate-500"}
              >
                {t.label}
              </Button>
            </Link>
          ))}
          {rightSlot}
        </div>
      </div>
    </header>
  );
}
