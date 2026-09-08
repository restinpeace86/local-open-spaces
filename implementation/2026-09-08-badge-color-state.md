# 뱃지 상태별 시각적 색상 구분 (초록=자동체크·미저장 / 파랑=DB 저장됨)

## 구현 대상
`implementation/todo.md` 개선사항2-1: "AI 시스템이 키워드 기반으로 1차
자동 체크를 수행했으나 아직 DB에 저장되지 않은 상태는 초록색, 기존에 이미
DB에 저장되어 불러와진 상태는 파란색 뱃지로 표시(기존 단순 검은색 표시를
변경)."

## 구현 일시
2026-09-08

## 설계
"이미 저장됨"의 기준선을 `savedBadgeKeys`(Set)로 별도 추적한다:
- 기존 큐레이션을 불러올 때(`existingCuration` 조회 성공 시) 그 시점의
  `curation_badges`를 기준선으로 설정한다.
- 저장(`save()`)이 성공하면 그 시점의 `selectedBadges`로 기준선을 다시
  맞춘다 — 방금 저장한 뱃지도 이제 "이미 저장됨"이 되어 파란색으로 바뀐다.

체크된 뱃지 중 이 기준선에 있으면 파란색, 없으면 초록색으로 렌더링한다.
"초록색"의 대상을 원문처럼 "AI 자동 체크분"으로만 좁히지 않고 "체크는
됐지만 아직 저장 안 된 모든 경우"(자동 체크든, 관리자가 방금 수동으로 새로
체크한 것이든)로 일반화했다 — 상태 추적이 더 단순해지고, "저장 전
변경사항을 한눈에 보여준다"는 원래 취지와도 부합하며 오히려 더 유용하다
(수동으로 새로 체크한 뱃지도 "아직 저장 안 됐다"는 사실은 AI 자동 체크와
동일하다).

## 변경 사항
- `src/lib/admin/use-spot-curation-form.ts`: `savedBadgeKeys` state 추가,
  기존 큐레이션 로드 시/저장 성공 시 갱신, 훅 반환값에 노출.
- `src/components/admin/curation-badge-form.tsx`: `savedBadgeKeys` prop
  추가. 체크된 뱃지의 클래스를 `checked && savedBadgeKeys.has(key)` →
  파란색(`bg-blue-600`), `checked && !savedBadgeKeys.has(key)` →
  초록색(`bg-green-600`)으로 분기. 기존 검은색(`bg-gray-900`)은 완전히
  제거했고, 미체크 뱃지의 흰색/회색 스타일은 그대로 유지했다.
- `blog-curation-modal.tsx`/`mobile-curation-workbench.tsx`: `savedBadgeKeys`
  prop 전달만 추가(두 호출부 모두 이미 `form.*`을 그대로 넘기던 기존
  패턴 재사용).

## 검증
- `blog-curation-modal.test.tsx`: 기존 "이미 큐레이션이 있으면 뱃지를
  프리필" 테스트의 기대 클래스를 `bg-gray-900` → `bg-blue-600`으로 갱신.
  신규 테스트 2개 추가 — (1) 신규 등록 시 방금 체크한 뱃지는 초록색이고
  저장 요청이 정상 전송됨, (2) 기존 저장된 뱃지는 파란색을 유지한 채
  새로 체크한 다른 뱃지만 초록색으로 구분됨(동시에 둘 다 체크된 상태에서
  색이 서로 다름을 확인).
- `npx tsc --noEmit` / `npm run test`(1296건) / `npm run build` 전체 통과.

## 특이 사항
- `mobile-curation-workbench.tsx`는 `blog-curation-modal.tsx`와 동일한
  `CurationBadgeForm`/`useSpotCurationForm`을 그대로 재사용하는 구조라
  별도 코드 변경이나 회귀 테스트 추가가 필요하지 않았다(제5장 제4조).
