# 문화센터 통합검색 — 공개 화면 (Phase C, 1부)

## 구현 대상
사용자 지시(2026-10-06): "동일하게 가는게 낫겠지.. 5개면 5개 탭하는것보다..
그리고 동일한구조로 조회/검색가능하게 관리자화면도.. 전체 통합검색 및
롯데마트나 이마트 필터검색도 가능하게." `project/decision-log.md`
Decision 028의 3단계(컷오버) — 공개 화면 부분. 이마트 전용/롯데마트 전용
2개 화면을 `culture_club_classes` 하나를 보는 단일 화면으로 합쳤다.

## 변경 사항
- `src/app/api/culture-club/search/route.ts`(신규): 기존
  `/api/culture-club/classes`(이마트)/`lottemart-classes`(롯데마트)를
  대체. `brand`(생략 시 전체), `store_code`(브랜드 1개 지정 시만 적용 —
  지점 코드 네임스페이스가 브랜드마다 달라 추측으로 적용하지 않음),
  `days`, `sub_category_name`(이마트 전용), `target_code`(롯데마트 전용,
  `raw_extra->>target_code`로 필터) 지원.
- `src/lib/home/culture-club-age-format.ts`(신규):
  `min_age_months`/`max_age_months`(공통 컬럼)를 "8개월~15개월"/"2세~3세"
  같은 사람이 읽는 문구로 변환. 상한 기준으로 단위(개월/세)를 하나로
  통일(섞어 쓰지 않음). 기존엔 이마트 카드에 연령이 전혀 안 보였는데
  이제 공통 컬럼 덕에 두 브랜드 다 보여준다.
- `src/lib/home/culture-club-options.ts`: `CULTURE_CLUB_BRAND_OPTIONS`에
  `{key:'all', label:'전체'}`를 맨 앞에 추가.
- `src/components/home/culture-club-tab-view.tsx`(전면 재작성): 브랜드
  pill(전체/이마트/롯데마트)을 다른 필터와 동급으로 다루는 단일 화면.
  - "전체"에서는 지점 필터와 카테고리/대상 칩을 숨긴다(지점 코드와
    분류 체계가 브랜드마다 달라 억지로 통일하지 않음, 제3장 제5조).
  - 카드: 상태 배지는 `normalized_status`(OPEN/WAITING/CLOSED) 3색으로
    통일하되 라벨은 `raw_status`(브랜드 고유 표기)를 그대로 보여준다 —
    색은 통일, 구체적 표현은 유지. 브랜드 뱃지, 연령, 할인/마감임박/신설
    (롯데마트만 `raw_extra`에서) 조건부 표시.
  - 상세 시트: 브랜드별 외부 신청 링크(`buildExternalApplyUrl` 분기 —
    이마트는 class_id만, 롯데마트는 `raw_extra.semester_code`/
    `target_code` 필요), 브랜드별 소개 텍스트(`raw_extra`의
    `class_detail_content` vs `class_intro`/`class_tip`).
  - 찜 버튼은 기존 `BookmarkTarget`('emart_class'/'lottemart_class') 그대로
    재사용(2026-10-06 찜 FK 통합이 이미 내부에서 처리).
- `src/components/home/lottemart-culture-club-view.tsx` **삭제**(통합
  화면으로 완전히 대체, 이 파일을 쓰던 다른 곳 없음을 grep으로 확인).
- `culture-club-tab-view.test.tsx` 전면 재작성(21개), `home-view.test.tsx`
  2개 테스트를 새 기본값("전체")에 맞게 수정.

## 검증
- `npx tsc --noEmit` / `npm run test`(276개 파일 2,869개) / `npm run build`
  전부 통과.
- 실제 dev 서버 + 실제 DB로 `/api/culture-club/search` 직접 호출(전체/
  brand=emart/brand=lottemart&store_code=455 전부 올바른 건수·필터링
  확인).
- Playwright로 실제 화면 캡처 확인: "전체" 기본 화면(지점 없음, 브랜드
  뱃지 섞여 나옴) → 이마트 선택(지점/카테고리 칩 등장, 실제 이미지·연령
  "4세~5세" 표시) → 카드 클릭 상세시트(일정·정원·소개 전부 정상) →
  롯데마트 선택(지점 전환, 수강대상 칩, 할인뱃지) 전부 실제 프로덕션
  데이터로 정상 동작 확인.

## 특이 사항
- 관리자 패널(2개)은 아직 안 바꿨다 — 다음 커밋에서 통합.
- `/api/culture-club/classes`, `/api/culture-club/lottemart-classes`는
  grep으로 다른 소비처가 전혀 없음을 확인한 뒤 **삭제**했다(route.ts +
  각 테스트). `/api/culture-club/stores`/`lottemart-stores`(지점 목록
  전용)는 새 통합 화면이 그대로 재사용해 남겨뒀다.
- 라우트 삭제 후 `.next/dev/types/validator.ts`(Next.js가 생성하는 타입
  캐시)가 삭제된 라우트를 계속 참조해 `npx tsc --noEmit`이 실패했다 —
  `npm run build`만으로는 `.next/dev`가 재생성되지 않아(그 폴더는 `next
  dev` 전용) `.next/dev`를 지우고 다시 빌드해 해결했다(소스 코드 문제가
  아니라 로컬 빌드 캐시 문제 — `.next`는 gitignore 대상).
