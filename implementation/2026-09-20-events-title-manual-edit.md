# [관리자 — events 제목(title) 수동 수정 기능]

## 구현 대상
사용자 지시(2026-09-20, 마포구 망원한강공원 서울형키즈카페 사례): "이게 서울형
키즈카페인데.. 그냥 장소로 들어왔네.. 이게 제목으로 보이면 안되는데." 조사 결과
`title`은 원본 API 필드(SVCNM)를 그대로 옮겨 담을 뿐, 코드에 폴백 로직이 없어
이 건은 원천 데이터 자체의 품질 문제였다(코드로 고칠 수 없음). "이벤트 제목을
관리자가 수동으로 덮어쓸 수 있는 기능을 추가할까?" 질문에 "추가" 확정.

## 구현 일시
2026-09-20

## 설계 결정
- `events.title`은 재수집 시 안전 병합(`upsertRowsSafeMerge`, `scripts/ingest/
  lib/supabase-admin.mjs`)이 이미 채워진 값을 절대 덮어쓰지 않는다(`title`이
  `ALWAYS_REFRESH_FIELDS.events`에 없음, 실측 확인) — 즉 관리자가 한 번
  고쳐두면 다음 재수집에도 안전하게 유지된다. 별도의 `title_override` 컬럼
  없이 `title` 컬럼을 직접 PATCH하는 것으로 충분하다(제5장 제4조 기존 구조
  우선 — 이미 있는 보호 장치를 그대로 활용).
- 기존 category_min/facility_type 등 개별 필드 수동 수정 라우트와 동일한
  패턴(전용 소형 라우트 + 상세 모달의 인라인 에디터)을 그대로 따랐다.
- `events` 탭 전용이다 — `open_spaces.name`은 이번 제보 범위 밖이라
  건드리지 않았다(제3장 제5조 추측 금지, 요청 범위 초과 금지).

## 코드 변경
- `src/app/api/admin/data-grid/title/route.ts`(신규): `PATCH { id, title }`
  — 빈 문자열은 거부(제목은 비울 수 없음), `events.title` 업데이트.
- `src/components/admin/raw-data-modal.tsx`: `TitleEditor` 컴포넌트 추가
  (텍스트 입력 + "제목 저장" 버튼, `FacilityTypeEditor`와 동일한 UI 언어) —
  `events` 탭에서만 렌더링. `RawDataModal`에 `onTitleUpdated` prop 추가.
- `src/components/admin/data-grid-client.tsx`: `onTitleUpdated` 콜백을
  전달해 저장 성공 시 목록(`rows`)과 열려 있는 상세 모달(`selectedRow`) 양쪽의
  `title`을 즉시 갱신한다(기존 `onFacilityTypeUpdated`와 동일한 패턴).

## 검증
- `npx tsc --noEmit`/`npm run test`(170개 파일, 2037개 테스트 — 신규 4개:
  저장 성공, 빈 값 저장 버튼 비활성화, 저장 실패 에러 표시, prop 없을 때
  미렌더링)/`npm run build` 모두 통과.
