'use client';

import { useCallback, useRef, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';

type Shape = 'round' | 'rect';

/**
 * Configurable photo cropper. Defaults to a 512×512 round crop, but the
 * caller can request a different aspect, a rectangular crop, and a
 * different output resolution — used for the avatar's circular cover
 * thumbnail (1:1 round) as well as the streaming stage's landscape
 * 16:9 backdrop.
 */
export default function PhotoCropper({
  src,
  open,
  onConfirm,
  onCancel,
  busy,
  aspect = 1,
  cropShape = 'round',
  outputWidth = 512,
  outputHeight = 512,
  title = '写真をトリミング',
  hint = 'ドラッグで位置調整・スライダーで拡大縮小できます。',
}: {
  src: string;
  open: boolean;
  onConfirm: (blob: Blob) => void | Promise<void>;
  onCancel: () => void;
  busy?: boolean;
  aspect?: number;
  cropShape?: Shape;
  outputWidth?: number;
  outputHeight?: number;
  title?: string;
  hint?: string;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const areaRef = useRef<Area | null>(null);

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    areaRef.current = areaPixels;
  }, []);

  async function confirm() {
    const area = areaRef.current;
    if (!area) return;
    const blob = await renderCroppedJpeg(src, area, outputWidth, outputHeight);
    await onConfirm(blob);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6 anim-fade-in">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-neutral-200 px-5 py-3">
          <h2 className="text-sm font-semibold text-neutral-900">{title}</h2>
          <p className="mt-0.5 text-[11px] text-neutral-500">{hint}</p>
        </div>
        <div className="relative h-80 w-full bg-neutral-900">
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            cropShape={cropShape}
            showGrid={cropShape === 'rect'}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>
        <div className="space-y-4 px-5 py-4">
          <label className="flex items-center gap-3 text-xs text-neutral-600">
            <span className="w-12 shrink-0">縮小</span>
            <input
              type="range"
              min={1}
              max={4}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 accent-neutral-900"
            />
            <span className="w-12 shrink-0 text-right">拡大</span>
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="rounded-full border border-neutral-300 px-4 py-2 text-xs font-medium text-neutral-700 transition hover:border-neutral-900 disabled:opacity-50"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={busy}
              className="rounded-full bg-neutral-900 px-4 py-2 text-xs font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50"
            >
              {busy ? '保存中…' : 'この内容で保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

async function renderCroppedJpeg(
  src: string,
  area: Area,
  outW: number,
  outH: number,
): Promise<Blob> {
  const img = await loadImage(src);
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas context unavailable');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    img,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    outW,
    outH,
  );
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))),
      'image/jpeg',
      0.92,
    );
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error('failed to load image for cropping'));
    img.src = src;
  });
}
