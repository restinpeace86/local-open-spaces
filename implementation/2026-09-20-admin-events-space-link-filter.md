# [관리자 EVENTS 그리드 — 스팟 연결 여부 필터]

## 구현 대상
사용자 지시(2026-09-20): "관리자 화면 EVENTS쪽 스팟 연결 안된거만 확인, 스팟
연결된 것만 확인 등도 가능하게 조건 좀 만들어줘" — 직전에 키즈카페 13건을
스팟에 연결한 뒤, 나머지(연결 안 된 것들)를 관리자가 쉽게 찾아 수동 검토할
수 있어야 한다는 후속 요청.

## 구현 일시
2026-09-20

## 설계 결정
기존 `is_active` 필터와 완전히 동일한 tri-state 관례(`TriStateToggle`,
`TriState = 'all'|'true'|'false'`)를 그대로 재사용했다(제5장 제4조 기존 구조
우선) — 새 UI 컴포넌트나 새 필터 스타일을 만들지 않았다. `is_active`와 달리
기본값은 `'all'`로 뒀다 — 스팟 연결 여부는 기본으로 좁혀야 할 이유가 없고
(모든 이벤트가 기본적으로 다 보여야 함), `is_active`만 예외적으로 기본값이
`'true'`인 이유(비활성 데이터가 기본적으로 섞이면 안 됨)와는 다른 성격이다.

## 코드 변경
- `src/app/api/admin/data-grid/route.ts`: `spaceLinked =
  parseBoolFilter(searchParams.get('space_linked'))` 추가, `true`면
  `.not('space_id', 'is', null)`, `false`면 `.is('space_id', null)`.
- `src/components/admin/data-grid-client.tsx`: `spaceLinked` 상태(TriState,
  기본 `'all'`) 추가, 두 개의 의존성 배열(디바운스 페이지 리셋 useEffect +
  실제 조회 useEffect)에 포함, `params.set('space_linked', ...)`(`'all'`이
  아닐 때만 전송), `events` 탭 필터 영역에 `TriStateToggle` 렌더링(기존
  "✅ 활성 상태(is_active)" 토글 바로 옆).

## 검증
- `npx tsc --noEmit`/`npm run test`(170개 파일, 2048개 테스트, 변동 없음)/
  `npm run build` 모두 통과. `is_active`와 동일한 필터 UI 자체는 이 코드베이스
  관례상 라우트/클라이언트 단위 테스트가 없어(확인함) 새 필터도 동일한 관례를
  따랐다.
- 실제 DB로 `space_id NOT NULL`/`IS NULL` 카운트를 직접 조회해 쿼리 로직
  (`.not()`/`.is()`)이 의도대로 동작함을 확인(연결됨 12,394건 / 연결안됨
  16,773건).
