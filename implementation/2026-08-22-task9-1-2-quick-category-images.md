# Task 9-1-2: 메인 Quick 카테고리 그리드 텍스트/아이콘 → 대표 이미지 UI 개편

## 구현 대상
`implementation/todo.md` [Task 9-1-2]: 홈 화면 5대 Quick 카테고리 버튼을 이모지/단색 원에서 카테고리 대표 이미지로 교체

## 구현 일시
2026-08-22

## 이미지 에셋 소스에 대한 판단
작업 지시에는 구체적인 이미지 파일이 첨부되어 있지 않았고, 이 세션에는 사진/일러스트를 생성하거나 외부에서 내려받을 수단이 없다. 대신 지시서가 명시적으로 허용한 포맷 중 하나(SVG)로 직접 제작하는 경로를 택했다 — 각 카테고리를 상징하는 단순한 벡터 아이콘(팔레트/나무/전시대/별/풍선)을 `category-meta.ts`에 이미 정의돼 있던 색상 그대로 배경으로 써서 제작했다(색상 임의 변경 없음). SVG는 해상도 무관하게 깨지지 않고 파일당 500바이트 내외로 매우 경량이라 "경량화된 최적화 이미지 에셋" 요구사항에 부합한다고 판단했다.

추후 실제 디자인 리소스(일러스트/사진)를 받으면 `public/images/categories/` 아래 동일 파일명으로 교체하기만 하면 되고, 컴포넌트/코드 변경은 필요 없다.

## 변경 사항
- `public/images/categories/*.svg` 5개 신규 파일(신규 `public/` 디렉터리 — 이 프로젝트에 정적 자산 폴더가 없어 새로 만듦)
- `src/components/home/quick-category-grid.tsx`:
  - `CATEGORY_IMAGE_SRC` 매핑(카테고리 → SVG 경로) 추가
  - `CategoryThumbnail` 서브컴포넌트 신설 — `next/image`로 48×48 원형 썸네일 렌더링, `onError` 발생 시 기존 단색 원 폴백(`useState`로 에러 상태 추적)으로 자동 전환
  - 카테고리 그리드 클릭 시 `/region?category=...` 이동 로직은 변경 없이 유지
- `src/components/home/quick-category-grid.test.tsx`(신규): 이미지/라벨 렌더링, 링크 href 검증, 이미지 로딩 실패 시 폴백 렌더링 검증(3건)

## 검증 결과
- `npx tsc --noEmit`: 통과
- `npm run test`: 전체 129/129 통과(신규 3건 포함)
- `npm run build`: 통과 (`Route (app)` 출력 변화 없음 — 정적 자산 추가는 라우트 구조에 영향 없음)
- `npm run dev` 실행 후 실측 확인:
  - SSR HTML에 5대 카테고리 이미지 `src="/images/categories/*.svg"` 전부 정상 렌더링
  - 각 SVG 파일을 직접 요청해 HTTP 200 + 유효한 SVG XML 콘텐츠 확인
  - 서버 로그에 에러/경고 없음

## 특이 사항
- `next.config.ts`에 별도 설정 변경 없음 — 로컬 `public/` 정적 자산은 `remotePatterns` 설정과 무관하게 `next/image`가 기본으로 지원한다.
- 이미지 실패 폴백은 실제로는 트리거되기 어렵다(로컬 정적 파일이라 항상 로드 성공) — 그래도 지시서가 명시적으로 요구한 방어 로직이고, 추후 이미지가 외부 CDN/원격 자산으로 교체될 경우를 대비해 구현해 두었다.
