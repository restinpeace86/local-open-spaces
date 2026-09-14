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

// [버그 수정 2차 — 2026-09-14 사용자 리포트] "사진이 왜이렇게 길지 가로길이가?
// 사이즈조절이 자동안되는거 같은데? 처음에 자동인식으로 가려지는거 안되는데?"
// 세 가지가 한 원인에서 갈라져 나왔다:
// 1) 캔버스를 고정 px 인라인 style(width/height)로 그렸는데, 모달 카드
//    실제 폭(약 350px)보다 큰 값이면 CSS `max-w-full`이 "폭만" 줄이고
//    height는 그대로 남아 이미지가 찌그러져 보였다(가로가 이상해 보인 원인).
//    → width:100%, height:auto로 브라우저가 비율을 유지한 채 컨테이너
//      폭에 맞춰 자동으로 줄이도록 바꾼다("사이즈조절 자동 안 됨" 해결).
// 2) 직전 수정에서 "너무 길어보이는 문제"를 잡으려고 표시 캔버스 자체를
//    가로/세로 380px로 작게 캡했는데, 그 작아진 캔버스를 그대로 얼굴 인식
//    입력으로도 재사용해 얼굴이 차지하는 실제 픽셀 수가 줄어들어 인식률이
//    떨어졌다("자동인식이 안 가려지는" 원인). → 인식/렌더링용 캔버스 해상도는
//    더 넉넉하게(긴 변 기준 480px) 잡고, 화면에는 CSS로만 축소해 보여준다
//    (내부 해상도와 화면 표시 크기를 분리).
const MAX_LONG_SIDE = 480;

// [버그 수정 3차 — 2026-09-14] flex 컨테이너 안에서 캔버스에 `width:100%`를
// 주는 방식은 브라우저/레이아웃에 따라 비율이 깨질 수 있음을 Playwright로
// 재현 확인(가로 사진은 정상, 세로 사진만 렌더링 비율이 어긋남). 대신 화면에
// 보여줄 크기(cssSize)를 캔버스 내부 해상도(displaySize)와 완전히 분리해
// JS에서 직접 계산한 고정 px 값으로 지정한다 — 두 값 모두 같은 비율에서
// 계산되므로 절대 찌그러지지 않는다.
const CSS_MAX_WIDTH = 300;
const CSS_MAX_HEIGHT = 420;

// [조정 — 2026-09-14 사용자 지시] 업로드용 최종 이미지의 긴 변 상한. 실제
// 표시는 96px 썸네일이나 화면 폭 이내 모달이 전부라(post-detail-modal.tsx,
// post-photo-modal.tsx) 원본 해상도(수천 px)를 그대로 올릴 필요가 없다.
// 요즘 폰 화면(레티나 배율 포함) 기준 선명하게 보이는 데 필요한 해상도는
// 대략 900~1300px 정도라, 1400px이면 여유를 두면서도 1600px보다 용량을
// 더 줄일 수 있다.
const OUTPUT_MAX_LONG_SIDE = 1400;

type DetectionState = 'loading-model' | 'detecting' | 'ready' | 'unavailable';

// [버그 조사 — 2026-09-14 사용자 리포트, 안드로이드 크롬] "사진첩 찾아보고
// 어느순간 닫으면 처음으로 넘어와 있음" — 안드로이드 크롬은 메모리 압박이
// 있으면 백그라운드로 간 탭을 통째로 버리고(discard), 돌아왔을 때 페이지를
// 처음부터 다시 불러온다(모든 React 상태 소실). blazeface의 `BlazeFaceModel`
// 은 내부 GraphModel을 private로 감싸고 있어 공개 dispose 메서드가 없다 —
// 즉 한 번 로드하면 그 GPU 메모리를 우리 쪽에서 직접 해제할 방법이 없다.
// 여러 장을 연달아 편집(사진 큐)할 때마다 `blazeface.load()`를 새로 부르면
// 사진 수만큼 모델이 계속 쌓여 메모리 압박을 스스로 키우게 된다 — 모듈
// 레벨에 캐시해 세션당 딱 한 번만 로드하고 이후로는 재사용한다(페이지를
// 완전히 벗어나면 이 캐시도 자연히 사라진다). 다만 이건 "탭이 아예
// 버려지는" 근본 원인(OS/브라우저 메모리 관리) 자체를 없애지는 못하고,
// 그 확률을 낮추는 완화책이다.
let cachedModelPromise: ReturnType<typeof import('@tensorflow-models/blazeface').load> | null = null;

async function loadBlazefaceModel(blazeface: typeof import('@tensorflow-models/blazeface')) {
  if (!cachedModelPromise) {
    cachedModelPromise = blazeface.load();
  }
  return cachedModelPromise;
}

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
  // [버그 수정 — 2026-09-14 사용자 리포트] "완료버튼 누를때도 반응속도가 너무
  // 늦어 안된건가 싶어서 2번이나 누르고 그러니 2번이나 선택되네" — 버튼에
  // 처리 중 비활성화가 없어, 인코딩+업로드가 끝나기 전에 두 번째 클릭이
  // 그대로 또 실행되어 사진이 중복 업로드됐다. 세 버튼(완료/건너뛰기/취소)
  // 중 하나라도 누르면 즉시 잠가서 중복 실행을 막는다.
  const [isProcessing, setIsProcessing] = useState(false);

  function handleSkipClick() {
    if (isProcessing) return;
    setIsProcessing(true);
    onSkip();
  }

  function handleCancelClick() {
    if (isProcessing) return;
    setIsProcessing(true);
    onCancel();
  }

  const cssSize = displaySize
    ? (() => {
        const cssScale = Math.min(1, CSS_MAX_WIDTH / displaySize.width, CSS_MAX_HEIGHT / displaySize.height);
        return { width: Math.round(displaySize.width * cssScale), height: Math.round(displaySize.height * cssScale) };
      })()
    : null;

  // 이미지 로드 + 얼굴 자동 인식
  useEffect(() => {
    let cancelled = false;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = async () => {
      if (cancelled) return;
      imageRef.current = img;
      const scale = Math.min(1, MAX_LONG_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
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

        // 인식은 내부 렌더링 캔버스(긴 변 기준 최대 480px)와 동일한 해상도로
        // 수행 — 렌더링 캔버스와 좌표계가 그대로 일치하므로 별도 스케일 변환
        // 없이 바로 사용할 수 있다(화면에 보이는 CSS 크기와는 별개).
        const detectCanvas = document.createElement('canvas');
        detectCanvas.width = width;
        detectCanvas.height = height;
        const dctx = detectCanvas.getContext('2d');
        if (!dctx) throw new Error('canvas context 생성 실패');
        dctx.drawImage(img, 0, 0, width, height);

        const model = await loadBlazefaceModel(blazeface);
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
    if (isProcessing) return; // [버그 수정 — 2026-09-14] 중복 클릭 가드(아래 참고)
    const img = imageRef.current;
    if (!img || !displaySize) return;
    setIsProcessing(true);
    // [버그 수정 — 2026-09-14 사용자 리포트] "사진 선택하고 완료버튼 누를때도
    // 반응속도가 너무 늦어" — 원본 해상도(휴대폰 사진은 보통 3000~4000px,
    // 수 MB) 그대로 캔버스에 다시 그려 인코딩+업로드하고 있었다. 이 앱에서
    // 사진은 최대 96px 썸네일이나 화면 폭에 맞춘 모달로만 보여지므로,
    // 업로드 전에 긴 변 기준 OUTPUT_MAX_LONG_SIDE(1400px)로 다운스케일해
    // 인코딩 시간과 업로드 용량을 크게 줄인다(화질 차이는 실사용에서
    // 체감되지 않는 수준).
    const outScale = Math.min(1, OUTPUT_MAX_LONG_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const outWidth = Math.round(img.naturalWidth * outScale);
    const outHeight = Math.round(img.naturalHeight * outScale);
    const outCanvas = document.createElement('canvas');
    outCanvas.width = outWidth;
    outCanvas.height = outHeight;
    const ctx = outCanvas.getContext('2d');
    if (!ctx) {
      setIsProcessing(false);
      return;
    }
    ctx.drawImage(img, 0, 0, outWidth, outHeight);
    const scale = outWidth / displaySize.width;
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
      0.85,
    );
  }

  return (
    // [버그 수정 — 2026-09-14 사용자 리포트] "취소버튼도 안보여.. 뒤로가기
    // 누르니깐 완전히 빠져나오던데" — 세로 사진이 길면 버튼이 화면 밖으로
    // 밀려나 보이지 않았고, 그래서 사용자가 대신 브라우저/앱 뒤로가기를 눌러
    // 글쓰기 화면 전체를 빠져나가 버렸다. 카드 전체 높이를 화면 안으로
    // 제한하고, 버튼 줄은 스크롤 영역 밖에 항상 고정해 두며, 어두운 배경을
    // 눌러도 취소되도록(표준 모달 이탈 경로) 만든다.
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={handleCancelClick}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-sm flex-col rounded-xl bg-white"
      >
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
          <p className="text-sm font-medium text-gray-800">
            얼굴에 스티커를 붙여 보호해 주세요
            <span className="ml-1 text-xs font-normal text-gray-400">(자동 인식은 참고용, 최종 확인은 직접 해주세요)</span>
          </p>

          <div className="flex justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
            {displaySize && cssSize ? (
              // 캔버스의 내부 해상도(displaySize, width/height 속성 — 아래
              // useEffect에서 설정)와 화면에 보이는 크기(cssSize)를 완전히
              // 분리한다. 둘 다 같은 비율에서 JS로 직접 계산한 고정 px 값이라
              // 어떤 레이아웃 상황에서도 찌그러지지 않는다.
              <canvas
                ref={canvasRef}
                onClick={handleCanvasClick}
                style={{ width: cssSize.width, height: cssSize.height, cursor: 'pointer' }}
                className="block"
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
        </div>

        <div className="flex shrink-0 gap-2 border-t border-gray-100 p-4">
          <button
            type="button"
            onClick={handleCancelClick}
            disabled={isProcessing}
            className="rounded-full border border-gray-300 px-3 py-2 text-xs font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
          >
            이 사진 취소
          </button>
          <button
            type="button"
            onClick={handleSkipClick}
            disabled={isProcessing}
            className="rounded-full border border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            편집 없이 올리기
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!displaySize || isProcessing}
            className="flex-1 rounded-full bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {isProcessing ? '처리 중...' : '완료'}
          </button>
        </div>
      </div>
    </div>
  );
}
