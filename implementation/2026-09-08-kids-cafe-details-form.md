# 키즈카페 큐레이션 팝업 기본 입력 필드(대표 이미지/영업시간/가격/메뉴)

## 구현 대상
`implementation/todo.md` 개선사항1의 항목 2~4: "관리자 워크벤치 내에
[키즈카페 / 실내놀이터] 카테고리를 위한 스팟 큐레이션 팝업 UI... 기존
'키즈친화 식당' 팝업의 컴포넌트 구조를 베이스로 재사용하되, 방금 정리한
세미오토 뱃지 검수(Opt-out), 가격 스마트 파싱, 옵셔널 메뉴가 들어가는
검수 팝업 적용."
- 팝업 기본 입력 필드(대표 이미지, 영업시간/휴무일)
- 가격 및 입장료 스마트 파싱(어린이/보호자 요금)
- 식음료 및 메뉴 정보(옵셔널)

## 구현 일시
2026-09-08

## 배경 조사
실측 확인 결과, 대표 이미지/영업시간/메뉴는 이미 `spot_curations` 테이블과
`SpotCurationsPanel`(관리자 'spot_curations' 탭, "키즈친화 식당" 큐레이션을
위해 2026-09-01에 만들어진 팝업)에 전부 존재했다 — 이 항목이 말하는
"기존 '키즈친화 식당' 팝업"이 바로 이것이다. 반면 "방금 정리한 세미오토
뱃지 검수"는 Steps 69~70에서 막 고도화한 `BlogCurationModal`/
`MobileCurationWorkbench`(블로그 검색+뱃지, Decision 021 계열)를 가리킨다
— 즉 이 지시는 "이미 있는 두 관리자 화면(정보 등록 팝업 + 블로그/뱃지
워크벤치)을 하나로 합쳐 달라"는 요청이다. `/api/admin/spot-curations`
PATCH가 이미 부분 업데이트를 지원해(`'field' in body`일 때만 갱신) 백엔드
쪽은 필드 추가 없이 그대로 재사용 가능했고, 유일하게 없던 것은 "가격 및
입장료"(어린이/보호자 요금) 컬럼과 파서였다.

## 변경 사항
1. **DB 마이그레이션** (`scripts/migrations/2026-09-08-add-entrance-fee-columns.sql`,
   적용 완료): `spot_curations`에 `child_fee`/`guardian_fee`(둘 다 nullable
   integer) 추가.
2. **`src/lib/admin/spot-curation-parsers.ts`**: `parseEntranceFeeText()`
   신규 — 기존 `parseOperatingHoursText`의 "키워드 줄에서 가장 가까운
   값을 채택" 패턴을 그대로 재사용(제5장 제4조)해, "어린이 10,000원 / 어른
   3,000원"처럼 한 줄에 두 대상 요금이 함께 있어도 각 키워드에 가장 가까운
   금액을 정확히 짝짓는다(첫 번째 금액을 무조건 채택하면 잘못 짝지어지는
   버그를 테스트로 발견하고 수정).
3. **`src/app/api/admin/spot-curations/route.ts`**: POST/PATCH 둘 다
   `child_fee`/`guardian_fee`를 읽고 쓰도록 확장(`normalizeFee()` —
   숫자가 아니거나 음수면 NULL). `src/types/database.types.ts`를
   `scripts/gen-types.mjs`로 재생성해 새 컬럼을 타입에 반영했다(재생성
   과정에서 이번 세션과 무관한 `sigungu_options_cache` 뷰 정의 변경도
   함께 정확히 반영됐다 — 타입 재생성은 항상 DB의 현재 실제 상태를
   그대로 가져오므로 이 반영은 의도된 정상 동작이다).
4. **`src/lib/admin/use-spot-curation-form.ts`**: `imageUrl`,
   `isUploadingImage`, `hoursRaw`+파싱된 시간 필드들, `menuRaw`/`menuItems`,
   `feeRaw`/`childFee`/`guardianFee` state와 `handlePasteImage`/
   `handleParseHours`/`handleParseMenu`/`handleRemoveMenuItem`/
   `handleParseFee` 핸들러를 추가했다(전부 `SpotCurationsPanel`의 동일
   로직을 그대로 복제 — 제5장 제4조). `SpotCurationItem` 타입에도 이
   필드들을 옵셔널로 추가해 기존 큐레이션 재편집 시 프리필된다. `save()`
   페이로드에도 이 필드들을 항상 포함시킨다(카테고리 무관 — 다른
   카테고리는 UI가 없어 그냥 null/빈 배열로 저장될 뿐 무해함).
5. **`src/components/admin/kids-cafe-details-form.tsx`** (신규): 대표
   이미지 붙여넣기, 영업시간(+ 자동 파싱), 입장료(+ 자동 파싱, 신규),
   메뉴(+ 자동 파싱)를 한 폼으로 묶은 프레젠테이션 컴포넌트 —
   `SpotCurationsPanel`의 JSX를 그대로 가져오되 가격 섹션만 새로 추가했다.
6. **`blog-curation-modal.tsx`/`mobile-curation-workbench.tsx`**:
   `form.curationCategoryId === 'kids_cafe'`일 때만 `KidsCafeDetailsForm`을
   렌더링 — "[키즈카페 / 실내놀이터] 카테고리를 위한" 요구사항 범위를
   그대로 지킨다(다른 노출 중분류를 고른 경우 이 UI는 보이지 않는다).

## 설계 결정: "휴무일" 별도 컬럼을 신설하지 않음
지시문은 "영업시간 및 휴무일 정보"를 한 항목으로 묶어 "식당 팝업 구조
재사용"을 명시했다. 기존 스키마(`operating_hours_raw` + 구조화된
open/close/break/last_order)에는 요일 단위 휴무일을 위한 전용 컬럼이
없다 — 관리자가 원문에 "매주 월요일 휴무"처럼 자유 기재하면
`operating_hours_raw`에 그대로 보존된다. "재사용"이 명시적 지시였고
새로운 구조화 컬럼(예: `closed_days`)에 대한 구체적 스펙이 없어 임의로
신설하지 않았다(제3장 제5조 추측 금지, 제7장 제1조 Spec 없는 기능 추가
금지) — 필요하면 후속 지시로 명확히 스펙화한 뒤 추가한다.

## 검증
- `spot-curation-parsers.test.ts`: `parseEntranceFeeText` 신규 테스트
  6개(동의어 인식, 한쪽만 있는 경우, 파싱 실패 시 NULL, 한 줄에 두 요금이
  같이 있을 때 근접 매칭 등).
- `blog-curation-modal.test.tsx`: 신규 describe 블록 4개 테스트 —
  (1) 키즈카페가 아니면 UI가 안 보임, (2) 키즈카페로 바꾸면 UI가 나타남,
  (3) 가격 텍스트 붙여넣기+자동 파싱 후 저장 페이로드에 child_fee/
  guardian_fee가 정확히 실림, (4) 메뉴를 비워도 저장이 실패하지 않고
  빈 배열로 저장됨. 기존 "뱃지를 선택하고 저장" 테스트는 새로 항상
  포함되는 필드들(image_url 등, 전부 null/빈 배열)을 반영해 기대값을
  갱신했다.
- `npx tsc --noEmit` / `npm run test`(1307건) / `npm run build` 전체 통과.

## 특이 사항
- `SpotCurationsPanel`(기존 'spot_curations' 탭)은 건드리지 않았다 — 이번
  요청은 명시적으로 "[키즈카페/실내놀이터] 카테고리를 위한" 새 워크벤치
  통합이 목적이라, 기존 "식당" 전용 정보 등록 흐름은 그대로 별개로
  유지된다.
