import React, { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useClientCompanyId } from "@/lib/useClientCompanyId";
import { useToast } from "@/components/ui/use-toast";
import { Upload, Brain, Loader2, Check, Video } from "lucide-react";

/**
 * BrainEntryUpload — Brain がまだ無いユーザーが最初に見る真っ白な画面。
 * 動画ドロップ → /api/brain-persons + /api/brain-assets で BrainPerson + 動画素材を生成。
 */
export default function BrainEntryUpload() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const clientCompanyId = useClientCompanyId();
  const { toast } = useToast();

  const inputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [phase, setPhase] = useState("idle"); // idle | uploading | creating | done
  const [progressMessage, setProgressMessage] = useState("");

  const handleFile = async (file) => {
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      toast({
        title: "動画ファイルを選んでください",
        description: "mp4 / mov / webm 等の動画形式に対応しています。",
        variant: "destructive",
      });
      return;
    }
    if (!clientCompanyId) {
      toast({
        title: "ユーザー情報の読み込み中です",
        description: "数秒後にもう一度試してください。",
        variant: "destructive",
      });
      return;
    }

    try {
      // 1. Create BrainPerson (placeholder name)
      setPhase("creating");
      setProgressMessage("Brain Person を作成中...");
      const placeholderName = file.name.replace(/\.[^/.]+$/, "") || "Untitled Brain";
      const person = await api.createBrainPerson({
        client_company_id: clientCompanyId,
        full_name: placeholderName,
        status: "draft",
        internal_use_allowed: true,
        external_use_allowed: false,
        notes: "BrainEntryUpload から自動作成されました。詳細は Studio 内で編集できます。",
      });

      // 2. Upload video as BrainSourceAsset
      setPhase("uploading");
      setProgressMessage("動画をアップロード中...");
      await api.uploadBrainAsset({
        brainPersonId: person.id,
        assetType: "video",
        file,
      });

      // 3. Done — invalidate cache and transition to studio
      setPhase("done");
      setProgressMessage("Brain が誕生しました。Studio を開いています...");
      await queryClient.invalidateQueries({ queryKey: ["brain-persons"] });
      await queryClient.invalidateQueries({ queryKey: ["brain-persons-check"] });
      setTimeout(() => navigate("/", { replace: true }), 1200);
    } catch (err) {
      console.error("[BrainEntryUpload] Failed:", err);
      toast({
        title: "アップロードに失敗しました",
        description: err?.message || "通信エラーの可能性があります。",
        variant: "destructive",
      });
      setPhase("idle");
      setProgressMessage("");
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const isBusy = phase !== "idle";

  return (
    <div className="fixed inset-0 bg-white flex flex-col items-center justify-center overflow-hidden">
      <div className="absolute top-8 left-1/2 -translate-x-1/2 flex items-center gap-2 text-slate-400">
        <Brain className="w-4 h-4" />
        <span className="text-xs tracking-[0.3em] uppercase">CompanyBrain AI</span>
      </div>

      <div className="w-full max-w-3xl px-6">
        {phase === "idle" && (
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            className={`relative cursor-pointer rounded-3xl border-2 border-dashed transition-all duration-300 ${
              isDragging
                ? "border-cyan-500 bg-cyan-50/40 scale-[1.01]"
                : "border-slate-200 hover:border-slate-300 bg-white"
            }`}
            style={{ aspectRatio: "16 / 9" }}
          >
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-8">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center mb-6 shadow-lg shadow-cyan-500/20">
                <Video className="w-10 h-10 text-white" />
              </div>
              <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-3 tracking-tight">
                会社の脳みそを、ここから育てる。
              </h1>
              <p className="text-slate-500 text-sm md:text-base mb-8 max-w-md">
                経営者・上司・熟練社員の動画をアップロードしてください。
                その人の話し方・考え方を学んだ AI アバターが、ここで生まれます。
              </p>
              <div className="inline-flex items-center gap-2 text-sm font-medium text-cyan-700 bg-cyan-50 px-4 py-2 rounded-full">
                <Upload className="w-4 h-4" />
                動画をドロップ または クリックして選択
              </div>
              <p className="text-[11px] text-slate-400 mt-6">
                mp4 / mov / webm 形式 ・ 顔と口元が見える 30 秒以上の動画を推奨
              </p>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) handleFile(file);
              }}
            />
          </div>
        )}

        {isBusy && (
          <div className="rounded-3xl border-2 border-slate-200 bg-white" style={{ aspectRatio: "16 / 9" }}>
            <div className="h-full flex flex-col items-center justify-center px-8 text-center">
              <div className="relative w-24 h-24 mb-6">
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-cyan-500 to-blue-600 animate-pulse" />
                <div className="absolute inset-0 flex items-center justify-center">
                  {phase === "done" ? (
                    <Check className="w-12 h-12 text-white" />
                  ) : (
                    <Loader2 className="w-12 h-12 text-white animate-spin" />
                  )}
                </div>
              </div>
              <h2 className="text-2xl font-semibold text-slate-900 mb-2">
                {phase === "done" ? "Brain が誕生しました" : "Brain を準備しています"}
              </h2>
              <p className="text-slate-500 text-sm">{progressMessage}</p>
            </div>
          </div>
        )}
      </div>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[11px] text-slate-400 tracking-wide">
        本人同意の確認は次のステップで行います。AI アバターは本人そのものではありません。
      </div>
    </div>
  );
}
