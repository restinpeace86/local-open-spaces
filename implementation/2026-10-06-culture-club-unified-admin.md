# 문화센터 통합검색 — 관리자 화면 (Phase C, 2부)

## 구현 대상
사용자 지시(2026-10-06): "동일한구조로 조회/검색가능하게 관리자화면도."
`project/decision-log.md` Decision 028의 3단계(컷오버) — 관리자 화면 부분.
이마트/롯데마트 전용 관리자 패널 2개를 `culture_club_classes` 하나를 보는
단일 패널로 합쳤다(공개 화면은 전 커밋에서 이미 완료).

## 변경 사항
- `src/app/api/admin/culture-club/route.ts`(신규): 기존
  `/api/admin/emart-culture-club`, `/api/admin/lottemart-culture-club`을
  대체. `brand`(csv, `.in()`), `normalized_status`(csv, `.in()`),
  `store`(csv, `brand:storeCode` 복합값 — 지점 코드 네임스페이스가
  브랜드마다 달라 `(brand, store_code)` 쌍 단위 `.or()` 조건으로 변환)
  지원. `PATCH`는 `class_id` 대신 surrogate `id`로 식별(통합 테이블에서는
  `class_id`가 브랜드 간 유일하지 않을 수 있어 더 단순).
- `src/components/admin/culture-club-panel.tsx`(신규): 브랜드 멀티토글
  pill + 상태(`normalized_status`) select + 지점 멀티선택(이마트/롯데마트
  지점 목록을 `brand:storeCode`로 합침, `[이마트] 제천` 식 라벨). 테이블에
  브랜드 컬럼 추가. 상세 모달은 공통 필드 + 소개 텍스트(브랜드마다
  `raw_extra`의 다른 키: `class_detail_content` vs `class_intro`/
  `class_tip`) + **"기타 정보" 섹션으로 나머지 `raw_extra` 키를 전부
  일괄 나열** — 브랜드가 5개가 될 걸 감안해 브랜드마다 전용 레이아웃을
  손으로 만들지 않고 범용으로 처리(향후 AK플라자 등 추가 시 코드 변경
  불필요).
- `data-grid-client.tsx`/`page.tsx`: `emart_culture_club`/
  `lottemart_culture_club` 탭 2개 → `culture_club`(🏫 문화센터) 탭 1개.
- `src/components/admin/emart-culture-club-panel.tsx`,
  `lottemart-culture-club-panel.tsx`, 각 admin API 라우트 **삭제**.

## 검증
- `npx tsc --noEmit` / `npm run test`(274개 파일 2,853개, 신규 10개 포함) /
  `npm run build` 전부 통과.
- 실제 dev 서버 + 실제 DB로 `/api/admin/culture-club` 직접 호출 확인.
- Playwright로 실제 관리자 화면 캡처: "🏫 문화센터" 탭 진입 → 이마트 필터
  + 조회(실제 6,546건 중 1,000건 표시, 브랜드 컬럼·상태 배지 정상) → 행
  클릭 상세 모달(연령 "60~108개월", 상태 "정원마감(WAITING)", 기타
  정보에 `semester`/`class_capacity`/`channel_online` 등 raw_extra 전체
  나열) 전부 실제 데이터로 정상 동작 확인.

## 특이 사항
- 이로써 Decision 028의 3단계(컷오버) 중 조회(공개 화면 + 관리자 화면)는
  완료됐다. 아직 안 한 것: 수집 스크립트가 여전히 기존 두 테이블에
  "먼저" 쓰고 통합 테이블에는 "이중 쓰기"로 따라 쓰는 상태 — 기존 두
  테이블을 쓰기 대상에서 완전히 빼고(또는 반대로 통합 테이블만 쓰게
  전환) 정리하는 4단계(기존 테이블 정리)는 아직 남아 있다.
