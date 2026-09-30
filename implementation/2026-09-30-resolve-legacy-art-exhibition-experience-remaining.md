# 구 노출중분류 '미술관 / 전시체험관' 잔여 7건 정리(2차: 나머지 2건)

## 구현 대상
사용자 지시(2026-09-30): 3/4번(서울시립 미술아카이브/서울시어울림플라자)에
대한 제안(1차 이관 작업의 implementation 기록 참고) 후 "그래 3은그렇게 해
4도 그렇게 해"로 확정.

## 변경 사항
1. **서울시립 미술아카이브**(`a59dc0ab-6b13-4080-a00f-351ffc1ab068`):
   표준중분류를 `기타` → `미술관`(일반)으로 재분류, 노출중분류를 `null`로
   해제(일반 '미술관' 카테고리 548건 전부 노출중분류가 null임을 실측
   확인해 맞춤).
2. **서울시어울림플라자**(`88a74aa9-7076-4bab-91cc-02ae67215efe`):
   표준중분류는 기존 `기타` 그대로 유지, 잘못 매핑돼 있던 구 노출중분류
   '미술관 / 전시체험관'만 `null`로 해제.

## 변경 사항(코드)
### `scripts/migrations/2026-09-30-resolve-legacy-art-exhibition-experience-remaining.mjs` (신규, 실행 완료)
두 건을 각각 `.eq('id', ...)`로 개별 업데이트(서로 다른 patch 내용이라
공통 `.in()` 배치 불가). 실행 결과: 2/2건 성공.

### `scripts/migrations/2026-09-30-resolve-legacy-art-exhibition-experience-remaining.test.mjs` (신규, 3개 테스트)
- 서울시립 미술아카이브가 정확한 patch(미술관/MANUAL/null)를 받는지 검증(1).
- 서울시어울림플라자는 category_min을 건드리지 않고 service_category_id만
  null로 해제하는지 검증(1).
- 갱신/대상 건수 반환 검증(1).

## 검증
- `npx vitest run scripts/migrations/2026-09-30-resolve-legacy-art-exhibition-experience-remaining.test.mjs` — 3개 통과.
- `npx tsc --noEmit` / `npm run test`(전체 238개 파일 2,580개) / `npm run build` 모두 통과.
- 실제 DB: 2/2건 반영 완료(실행 로그로 확인).
- 구 노출중분류 '미술관 / 전시체험관'(`7fa6dc35-4d7a-483b-bcad-9a35dd04f3cc`)의
  매핑 건수가 이번 이관으로 **0건**이 됐음을 재조회로 확인(2026-09-30에
  보고했던 7건 전부 해소 완료 — 5/6/7은 어린이전시미술관 배치로, 3/4는
  이번 배치로).

## 특이 사항
이로써 사용자가 이번 세션 초반에 확인 요청했던 두 개의 구 통합 노출중분류
('어린이 과학관 / 박물관', '미술관 / 전시체험관') 모두 매핑 건수 0건으로
정리 완료됐다.
