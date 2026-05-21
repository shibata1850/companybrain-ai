import React, { useMemo, useRef, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/components/ui/use-toast";
import {
  ArrowLeft, Brain, Upload, Video, Mic, FileText, Loader2,
  Trash2, MessageCircle, Download,
} from "lucide-react";

const ASSET_KINDS = [
  { value: "video", label: "動画", icon: Video, accept: "video/*", hint: "話している様子の動画。表情・口元・話し方を学習。" },
  { value: "audio", label: "音声", icon: Mic, accept: "audio/*", hint: "声のサンプル。発話スタイルを学習。" },
  { value: "consent_document", label: "同意書", icon: FileText, accept: "application/pdf,image/*", hint: "本人同意の証跡（PDF / 画像）。" },
];

const TYPE_LABEL = {
  video: "動画",
  audio: "音声",
  consent_document: "同意書",
};

const TYPE_ICON = {
  video: Video,
  audio: Mic,
  consent_document: FileText,
};

export default function BrainPersonAssets() {
  const { personId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [deletingAsset, setDeletingAsset] = useState(null);

  const { data: person, isLoading: personLoading } = useQuery({
    queryKey: ["brain-person", personId],
    queryFn: () => api.getBrainPerson(personId),
    enabled: !!personId,
  });

  const { data: assets = [], isLoading: assetsLoading } = useQuery({
    queryKey: ["brain-assets", personId],
    queryFn: () => api.listBrainAssets(personId),
    enabled: !!personId,
  });

  const grouped = useMemo(() => {
    const out = { video: [], audio: [], consent_document: [] };
    for (const a of assets) {
      if (out[a.asset_type]) out[a.asset_type].push(a);
    }
    return out;
  }, [assets]);

  const uploadMut = useMutation({
    mutationFn: ({ assetType, file }) =>
      api.uploadBrainAsset({ brainPersonId: personId, assetType, file }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brain-assets", personId] });
      toast({ title: "アップロードしました" });
    },
    onError: (err) => toast({
      title: "アップロードに失敗しました",
      description: err?.message || "通信エラーの可能性があります。",
      variant: "destructive",
    }),
  });

  const deleteMut = useMutation({
    mutationFn: (assetId) => api.deleteBrainAsset(assetId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brain-assets", personId] });
      toast({ title: "削除しました" });
      setDeletingAsset(null);
    },
    onError: (err) => toast({
      title: "削除に失敗しました",
      description: err?.message || "通信エラーの可能性があります。",
      variant: "destructive",
    }),
  });

  if (personLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }
  if (!person) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-slate-500">Brain Person が見つかりません。</p>
        <Button variant="outline" onClick={() => navigate("/")}>
          <ArrowLeft className="w-4 h-4 mr-1" />一覧へ戻る
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-slate-500 hover:text-slate-900 flex items-center gap-1 text-sm">
              <ArrowLeft className="w-4 h-4" />一覧
            </Link>
            <span className="text-slate-300">/</span>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                <Brain className="w-4 h-4 text-white" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-900">{person.full_name}</div>
                <div className="text-[11px] text-slate-500">{person.role_title || "役職未設定"}</div>
              </div>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate(`/studio?personId=${encodeURIComponent(personId)}`)}
          >
            <MessageCircle className="w-4 h-4 mr-1" />対話を開く
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-10">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">資産管理</h1>
          <p className="text-sm text-slate-500 mt-1">
            この Brain Person を育てるための動画・音声・同意書をアップロード・管理します。
          </p>
        </div>

        {ASSET_KINDS.map((kind) => (
          <AssetSection
            key={kind.value}
            kind={kind}
            assets={grouped[kind.value] || []}
            loading={assetsLoading}
            onUpload={(file) => uploadMut.mutate({ assetType: kind.value, file })}
            uploading={uploadMut.isPending && uploadMut.variables?.assetType === kind.value}
            onDelete={(asset) => setDeletingAsset(asset)}
          />
        ))}
      </main>

      <AlertDialog
        open={!!deletingAsset}
        onOpenChange={(open) => !open && setDeletingAsset(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>このアセットを削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingAsset?.original_file_name || "（ファイル名不明）"} を完全に削除します。この操作は取り消せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMut.isPending}>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); deleteMut.mutate(deletingAsset.id); }}
              disabled={deleteMut.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMut.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              削除する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AssetSection({ kind, assets, loading, onUpload, uploading, onDelete }) {
  const inputRef = useRef(null);
  const Icon = kind.icon;
  return (
    <section>
      <div className="flex items-end justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className="w-5 h-5 text-slate-600" />
          <h2 className="text-lg font-semibold text-slate-900">{kind.label}</h2>
          <Badge variant="outline" className="text-[10px] text-slate-500 border-slate-200">{assets.length}</Badge>
        </div>
        <div>
          <input
            ref={inputRef}
            type="file"
            accept={kind.accept}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) onUpload(f);
            }}
          />
          <Button size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
            {kind.label}をアップロード
          </Button>
        </div>
      </div>
      <p className="text-xs text-slate-500 mb-3">{kind.hint}</p>

      {loading ? (
        <div className="text-sm text-slate-400 py-6">読み込み中...</div>
      ) : assets.length === 0 ? (
        <Card className="border-dashed border-slate-200">
          <CardContent className="py-6 text-center text-sm text-slate-400">
            まだ {kind.label} がありません。
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {assets.map((a) => (
            <AssetRow key={a.id} asset={a} onDelete={() => onDelete(a)} />
          ))}
        </div>
      )}
    </section>
  );
}

function AssetRow({ asset, onDelete }) {
  const Icon = TYPE_ICON[asset.asset_type] || FileText;
  const [opening, setOpening] = useState(false);

  const openAsset = async () => {
    try {
      setOpening(true);
      const { signedUrl } = await api.getAssetSignedUrl(asset.id);
      const absolute = signedUrl.startsWith("http")
        ? signedUrl
        : `${window.location.origin}${signedUrl}`;
      window.open(absolute, "_blank", "noopener,noreferrer");
    } finally {
      setOpening(false);
    }
  };

  const sizeMb = asset.size_bytes ? (asset.size_bytes / 1024 / 1024).toFixed(1) : null;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-slate-600" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-slate-900 truncate">
          {asset.original_file_name || "(unnamed)"}
        </div>
        <div className="text-[11px] text-slate-500 mt-0.5">
          {TYPE_LABEL[asset.asset_type] || asset.asset_type}
          {sizeMb && ` · ${sizeMb} MB`}
          {asset.uploaded_at && ` · ${formatDate(asset.uploaded_at)}`}
        </div>
      </div>
      <Button variant="ghost" size="sm" onClick={openAsset} disabled={opening}>
        {opening ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={onDelete}
        className="text-red-600 hover:text-red-700 hover:bg-red-50"
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
}

function formatDate(iso) {
  try {
    const d = new Date(iso.replace(" ", "T") + "Z");
    return d.toLocaleString("ja-JP", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}
