import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, AlertCircle } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";

const CLIENT_ID = "69fc3d9af68187d823c1a41b";

const PLAN_LIMITS = {
  Light: {
    avatarVideos: 0,
    liveAvatarSeconds: 0,
    trainingReviews: 0,
    workReviews: 50,
  },
  Standard: {
    avatarVideos: 300,
    liveAvatarSeconds: 600,
    trainingReviews: 20,
    workReviews: 200,
  },
  Professional: {
    avatarVideos: 1200,
    liveAvatarSeconds: 1800,
    trainingReviews: 100,
    workReviews: 500,
  },
  Enterprise: {
    avatarVideos: null,
    liveAvatarSeconds: null,
    trainingReviews: null,
    workReviews: null,
  },
};

export default function AvatarUsageStats() {
  const { data: company } = useQuery({
    queryKey: ["company", CLIENT_ID],
    queryFn: () => base44.entities.ClientCompany.get(CLIENT_ID),
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ["sessions", CLIENT_ID],
    queryFn: () =>
      base44.entities.AvatarConversationSession.filter({
        clientCompanyId: CLIENT_ID,
      }),
  });

  const { data: reviews = [] } = useQuery({
    queryKey: ["workReviews", CLIENT_ID],
    queryFn: () =>
      base44.entities.WorkReviewRequest.filter({
        clientCompanyId: CLIENT_ID,
      }),
  });

  const { data: videos = [] } = useQuery({
    queryKey: ["videos", CLIENT_ID],
    queryFn: () =>
      base44.entities.VideoProject.filter({
        clientCompanyId: CLIENT_ID,
      }),
  });

  const currentMonth = new Date().toISOString().slice(0, 7);
  const planName = company?.planName || "Light";
  const limits = PLAN_LIMITS[planName] || PLAN_LIMITS.Light;

  const monthlyStats = useMemo(() => {
    const thisMonth = currentMonth;

    const liveAvatarSeconds = sessions
      .filter((s) => s.created_date?.startsWith(thisMonth) && s.provider === "liveavatar")
      .reduce((sum, s) => sum + (s.durationSeconds || 0), 0);

    const videoSeconds = videos
      .filter((v) => v.created_date?.startsWith(thisMonth) && v.status === "completed")
      .reduce((sum, v) => sum + (v.durationSeconds || 0), 0);

    const trainingReviews = sessions
      .filter((s) => s.created_date?.startsWith(thisMonth) && s.purpose === "training")
      .length;

    const workReviewCount = reviews
      .filter((r) => r.created_date?.startsWith(thisMonth))
      .length;

    return {
      liveAvatarSeconds,
      videoSeconds,
      trainingReviews,
      workReviewCount,
    };
  }, [sessions, reviews, videos, currentMonth]);

  const UsageBar = ({ used, limit, label }) => {
    const percentage = limit ? Math.round((used / limit) * 100) : 0;
    const isWarning = percentage >= 80;
    const isExceeded = limit && used > limit;

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{label}</span>
          <span className="text-sm font-semibold">
            {used} / {limit || "無制限"}
          </span>
        </div>
        {limit && (
          <>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  isExceeded ? "bg-destructive" : isWarning ? "bg-amber-500" : "bg-primary"
                }`}
                style={{ width: `${Math.min(percentage, 100)}%` }}
              />
            </div>
            {isExceeded && (
              <p className="text-xs text-destructive font-medium">上限を超過しています</p>
            )}
            {isWarning && !isExceeded && (
              <p className="text-xs text-amber-600 font-medium">{100 - percentage}% 残量</p>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="アバター利用状況"
        description="ExecutiveBrain Avatar の今月の利用状況を表示します。"
      />

      {/* プラン情報 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">現在のプラン</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground mb-1">プラン</p>
            <p className="text-lg font-bold">{planName}</p>
          </div>
          <Badge className={`text-sm ${
            planName === "Enterprise"
              ? "bg-purple-500"
              : planName === "Professional"
              ? "bg-blue-500"
              : planName === "Standard"
              ? "bg-green-500"
              : "bg-gray-500"
          }`}>
            {planName}
          </Badge>
        </CardContent>
      </Card>

      {/* 警告 */}
      {limits.liveAvatarSeconds === 0 && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-red-50 border border-red-200">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-red-900">ExecutiveBrain Avatar は利用できません</p>
            <p className="text-sm text-red-700 mt-1">
              このプランではExecutiveBrain Avatarの機能は利用できません。Standard以上へのアップグレードをお願いします。
            </p>
          </div>
        </div>
      )}

      {/* 利用状況 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {currentMonth} 月の利用状況
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {limits.liveAvatarSeconds && limits.liveAvatarSeconds > 0 ? (
            <>
              <UsageBar
                used={monthlyStats.liveAvatarSeconds}
                limit={limits.liveAvatarSeconds}
                label="LiveAvatar セッション（秒）"
              />

              <UsageBar
                used={monthlyStats.videoSeconds}
                limit={limits.avatarVideos}
                label="録画型アバター動画（秒）"
              />

              <UsageBar
                used={monthlyStats.trainingReviews}
                limit={limits.trainingReviews}
                label="新人研修セッション（回）"
              />

              <UsageBar
                used={monthlyStats.workReviewCount}
                limit={limits.workReviews}
                label="仕事レビュー（回）"
              />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">このプランでは利用できません。</p>
          )}
        </CardContent>
      </Card>

      {/* 利用額の概算 */}
      {monthlyStats.liveAvatarSeconds > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">推定コスト</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>LiveAvatar利用料</span>
              <span className="font-medium">
                ¥{Math.round(monthlyStats.liveAvatarSeconds * 1)} 概算
              </span>
            </div>
            <div className="flex justify-between text-sm border-t pt-2">
              <span className="font-medium">合計（月額）</span>
              <span className="font-bold">
                ¥{Math.round(monthlyStats.liveAvatarSeconds * 1)} 概算
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}