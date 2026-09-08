# 블로그 뱃지 큐레이션 / 스팟(정보 등록) 큐레이션 재분리

## 구현 대상
사용자 지시: "지금 블로그 뱃지큐레이션하고 스팟큐레이션 합쳤는데.. 이거
다시 분리해줘.. 현재 같이 안하고... 괜히 길어져..."

Step 71에서 `BlogCurationModal`/`MobileCurationWorkbench`(블로그 검색 +
뱃지 검수 화면)에 `KidsCafeDetailsForm`(대표 이미지/영업시간/가격/메뉴 —
원래 `SpotCurationsPanel`의 영역)을 통합했는데, 사용자가 이 화면이
너무 길어져 불편하다며 원상 복구를 요청했다.

## 구현 일시
2026-09-08

## 변경 사항
1. **`kids-cafe-details-form.tsx` 삭제**: 더 이상 어디서도 쓰지 않는다.
2. **`blog-curation-modal.tsx`/`mobile-curation-workbench.tsx`**:
   `KidsCafeDetailsForm` import 및 렌더링 블록 제거. 이 두 화면은 다시
   블로그 검색 + 뱃지 검수(+노출 중분류 선택 + 메모) 전용으로 되돌아간다.
3. **`use-spot-curation-form.ts`**: `SpotCurationItem` 타입과 `save()`
   페이로드에서 `image_url`/`operating_hours_raw`/`open_time` 등/`menu_items`/
   `child_fee`/`guardian_fee` 관련 state·핸들러·프리필 로직을 전부 제거해
   Step 70 이전 형태로 되돌렸다. **왜 단순히 UI만 숨기지 않고 payload에서도
   완전히 제거했는가**: `save()`가 이 필드들을 항상(값이 비어 있어도)
   페이로드에 포함시키고 있었는데, PATCH는 body에 있는 필드만 갱신하는
   구조라 — 이 화면에서 저장할 때마다 `SpotCurationsPanel`이 이미 등록해둔
   이미지/영업시간/메뉴/가격을 매번 `null`/빈 배열로 덮어써 버리는 실제
   데이터 유실 버그가 될 뻔했다. UI만 숨기고 payload를 그대로 뒀다면
   이 사고가 발생했을 것이다.
4. **가격 스마트 파싱 기능은 유지 — 위치만 이동**: 사용자가 명시적으로
   요청했던 "가격 및 입장료 스마트 파싱"(Step 71에서 신규 추가) 자체를
   되돌리지 않고, 원래 있어야 할 자리인 `SpotCurationsPanel`(스팟 큐레이션
   탭)로 옮겼다 — 대표 이미지/영업시간/메뉴와 같은 성격(스팟 정보 등록)의
   필드라 그 화면이 자연스러운 자리다. `parseEntranceFeeText` 파서(Step
   71에서 이미 검증됨)와 `child_fee`/`guardian_fee` 컬럼은 그대로 재사용
   했다 — DB 마이그레이션이나 API 라우트 변경은 필요 없었다(`/api/admin/
   spot-curations` 라우트가 이미 두 필드를 다 지원하도록 Step 71에서
   확장돼 있었음).

## 검증
- `blog-curation-modal.test.tsx`: Step 71에서 추가했던 "키즈카페 기본
  입력 필드" describe 블록(4개 테스트) 전체 삭제, 저장 페이로드 기대값을
  블로그 URL 3개 + 뱃지 + 메모만 있는 원래 형태로 되돌림.
- `spot-curations-panel.test.tsx`: 기존 "기존 값이 채워진 수정 모달"
  테스트에 입장료 프리필 확인을 추가, 입장료 붙여넣기→자동 파싱→등록
  저장 페이로드 확인 신규 테스트 1개 추가.
- `npx tsc --noEmit` / `npm run test`(1323건) / `npm run build` 전체 통과.

## 특이 사항
- `spot_curations` 테이블 스키마(child_fee/guardian_fee 컬럼)와 공개
  API(`/api/spot-curations`, 소비자 상세 모달/마커 프리뷰 카드가 읽는
  엔드포인트)는 전혀 건드리지 않았다 — 그쪽은 어느 관리자 화면이 값을
  썼는지와 무관하게 동일한 `spot_curations` 행을 읽으므로 영향이 없다.
