'use client';

import { useEffect, useRef, useState } from 'react';

// [Decision — 2026-09-14 사용자 지시] "최종적으로 얼굴 인식해서 얼굴에 스티커
// 합성해줘.. 이에 대하여 사용자가 최종 판단하고.. 클릭으로 이거 얼굴이고
// 이거 얼굴아니다도 수동으로 할 수 있도록": 사진 업로드 시 클라이언트에서
// 얼굴을 자동 인식해 스티커를 바로 씌우되, 자동 인식은 완벽하지 않으므로
// (아이 얼굴이 그대로 노출되는 사고를 막기 위해) 사용자가 캔버스를 클릭해서
// 직접 스티커를 떼거나(오탐지 제거) 새로 붙일 수(미탐지 보완) 있게 한다.
// 최종 확정은 사용자 몫 — 자동 인식은 초안일 뿐이라는 원칙.

type FaceBox = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

const STICKER_OPTIONS = ['🐻', '🐰', '🐱', '🐶', '⭐', '😊'] as const;

const MAX_DISPLAY_WIDTH = 420;

type DetectionState = 'loading-model' | 'detecting' | 'ready' | 'unavailable';

export function FaceStickerEditor({
  file,
  onConfirm,
  onSkip,
  onCancel,
}: {
  file: File;
  onConfirm: (blob: Blob) => void;
  onSkip: () => void;
  onCancel: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [displaySize, setDisplaySize] = useState<{ width: number; height: number } | null>(null);
  const [faces, setFaces] = useState<FaceBox[]>([]);
  const [sticker, setSticker] = useState<(typeof STICKER_OPTIONS)[number]>('🐻');
  const [status, setStatus] = useState<DetectionState>('loading-model');

  // 이미지 로드 + 얼굴 자동 인식
  useEffect(() => {
    let cancelled = false;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = async () => {
      if (cancelled) return;
      imageRef.current = img;
      const scale = Math.min(1, MAX_DISPLAY_WIDTH / img.naturalWidth);
      const width = Math.round(img.naturalWidth * scale);
      const height = Math.round(img.naturalHeight * scale);
      setDisplaySize({ width, height });

      try {
        setStatus('loading-model');
        const [tf, blazeface] = await Promise.all([
          import('@tensorflow/tfjs'),
          import('@tensorflow-models/blazeface'),
        ]);
        if (cancelled) return;
        await tf.ready();
        setStatus('detecting');

        // 인식 자체는 표시용 캔버스(작은 해상도)에서 수행 — 화면 좌표계와
        // 그대로 일치하므로 별도 스케일 변환 없이 바로 사용할 수 있다.
        const detectCanvas = document.createElement('canvas');
        detectCanvas.width = width;
        detectCanvas.height = height;
        const dctx = detectCanvas.getContext('2d');
        if (!dctx) throw new Error('canvas context 생성 실패');
        dctx.drawImage(img, 0, 0, width, height);

        const model = await blazeface.load();
        if (cancelled) return;
        const predictions = await model.estimateFaces(detectCanvas, false);
        if (cancelled) return;

        const detected: FaceBox[] = predictions.map((p, i) => {
          const [x1, y1] = p.topLeft as [number, number];
          const [x2, y2] = p.bottomRight as [number, number];
          return {
            id: `auto-${i}`,
            x: x1,
            y: y1,
            width: x2 - x1,
            height: y2 - y1,
          };
        });
        setFaces(detected);
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('unavailable');
      }
    };
    img.onerror = () => {
      if (!cancelled) setStatus('unavailable');
    };
    img.src = url;
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  // 캔버스에 이미지 + 스티커 그리기
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img || !displaySize) return;
    canvas.width = displaySize.width;
    canvas.height = displaySize.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, displaySize.width, displaySize.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const face of faces) {
      const cx = face.x + face.width / 2;
      const cy = face.y + face.height / 2;
      const fontSize = Math.max(face.width, face.height) * 1.35;
      ctx.font = `${fontSize}px sans-serif`;
      ctx.fillText(sticker, cx, cy);
    }
  }, [faces, sticker, displaySize]);

  function defaultBoxSize(): number {
    if (faces.length > 0) {
      return faces.reduce((sum, f) => sum + Math.max(f.width, f.height), 0) / faces.length;
    }
    return displaySize ? displaySize.width * 0.18 : 60;
  }

  function handleCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;

    const hit = faces.find(
      (f) => clickX >= f.x && clickX <= f.x + f.width && clickY >= f.y && clickY <= f.y + f.height,
    );

    if (hit) {
      // 이미 스티커가 있는 자리를 클릭 = "이거 얼굴 아니다" (스티커 제거)
      setFaces((prev) => prev.filter((f) => f.id !== hit.id));
    } else {
      // 빈 자리를 클릭 = "이거 얼굴이다" (스티커 수동 추가)
      const size = defaultBoxSize();
      setFaces((prev) => [
        ...prev,
        { id: `manual-${Date.now()}`, x: clickX - size / 2, y: clickY - size / 2, width: size, height: size },
      ]);
    }
  }

  function handleConfirm() {
    const img = imageRef.current;
    if (!img || !displaySize) return;
    const outCanvas = document.createElement('canvas');
    outCanvas.width = img.naturalWidth;
    outCanvas.height = img.naturalHeight;
    const ctx = outCanvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, 0, 0);
    const scale = img.naturalWidth / displaySize.width;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const face of faces) {
      const cx = (face.x + face.width / 2) * scale;
      const cy = (face.y + face.height / 2) * scale;
      const fontSize = Math.max(face.width, face.height) * 1.35 * scale;
      ctx.font = `${fontSize}px sans-serif`;
      ctx.fillText(sticker, cx, cy);
    }
    outCanvas.toBlob(
      (blob) => {
        if (blob) onConfirm(blob);
      },
      file.type === 'image/png' ? 'image/png' : 'image/jpeg',
      0.9,
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex w-full max-w-sm flex-col gap-3 rounded-xl bg-white p-4">
        <p className="text-sm font-medium text-gray-800">
          얼굴에 스티커를 붙여 보호해 주세요
          <span className="ml-1 text-xs font-normal text-gray-400">(자동 인식은 참고용, 최종 확인은 직접 해주세요)</span>
        </p>

        <div className="flex justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
          {displaySize ? (
            <canvas
              ref={canvasRef}
              onClick={handleCanvasClick}
              style={{ width: displaySize.width, height: displaySize.height, cursor: 'pointer' }}
              className="max-w-full"
            />
          ) : (
            <div className="flex h-40 w-full items-center justify-center text-xs text-gray-400">이미지 불러오는 중...</div>
          )}
        </div>

        {status === 'loading-model' && <p className="text-xs text-gray-400">얼굴 인식 준비 중...</p>}
        {status === 'detecting' && <p className="text-xs text-gray-400">얼굴을 찾는 중...</p>}
        {status === 'unavailable' && (
          <p className="text-xs text-amber-600">자동 인식을 불러오지 못했어요. 화면을 눌러 직접 스티커를 붙일 수 있어요.</p>
        )}
        {status === 'ready' && faces.length === 0 && (
          <p className="text-xs text-gray-400">인식된 얼굴이 없어요. 필요하면 화면을 눌러 직접 스티커를 붙여주세요.</p>
        )}
        <p className="text-[11px] text-gray-400">스티커 위를 다시 누르면 제거돼요.</p>

        <div className="flex items-center gap-1.5">
          {STICKER_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setSticker(opt)}
              aria-pressed={sticker === opt}
              className={`flex h-8 w-8 items-center justify-center rounded-full text-lg ${
                sticker === opt ? 'bg-indigo-100 ring-2 ring-indigo-400' : 'bg-gray-100'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-gray-300 px-3 py-2 text-xs font-medium text-gray-500 hover:bg-gray-50"
          >
            이 사진 취소
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="rounded-full border border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            편집 없이 올리기
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!displaySize}
            className="flex-1 rounded-full bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            완료
          </button>
        </div>
      </div>
    </div>
  );
}
