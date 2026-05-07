import React from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function StatCard({ icon: Icon, label, value, subValue, trend, className }) {
  return (
    <Card className={cn("relative overflow-hidden p-6 bg-card border-border/50", className)}>
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="text-3xl font-bold tracking-tight">{value}</p>
          {subValue && <p className="text-xs text-muted-foreground">{subValue}</p>}
        </div>
        {Icon && (
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Icon className="w-5 h-5 text-primary" />
          </div>
        )}
      </div>
      {trend && (
        <div className={cn(
          "mt-3 text-xs font-medium",
          trend > 0 ? "text-emerald-500" : "text-destructive"
        )}>
          {trend > 0 ? "+" : ""}{trend}% 前月比
        </div>
      )}
      <div className="absolute -bottom-6 -right-6 w-24 h-24 rounded-full bg-primary/5" />
    </Card>
  );
}