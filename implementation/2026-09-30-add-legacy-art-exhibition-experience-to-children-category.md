# 구 노출중분류 '미술관 / 전시체험관' 잔여 7건 정리(1차: 3건 이관)

## 구현 대상
사용자 지시(2026-09-30): 구 통합 노출중분류 '미술관 / 전시체험관' 매핑 7건의
명칭을 보고한 뒤 "3,4,5,6,7 일단 5,6,7은 어린이전시미술관으로 이관하자
노출중분류도 어린이전시/미술관으로 변경하고.. 3, 4는 어떻게 하는게 좋을지
먼저 제안해봐" — 5/6/7(순환도시 친환경세상 순환자원홍보관/판교환경생태학습원
/한국전통문화전당) 3건만 이번에 이관했다. 3/4(서울시립 미술아카이브/
서울시어울림플라자)는 별도 제안 후 처리 예정.

## 변경 사항
### `scripts/migrations/2026-09-30-add-legacy-art-exhibition-experience-to-children-category.mjs` (신규, 실행 완료)
`TARGET_SPOT_IDS`(3건, export)를 대상으로 `category_min='어린이전시미술관'`,
`category_min_source='MANUAL'`, `service_category_id='2901e5e0-...'`(어린이
전시/미술관)를 한 번에 반영. 실행 결과: 3/3건 성공.

### `scripts/migrations/2026-09-30-add-legacy-art-exhibition-experience-to-children-category.test.mjs` (신규, 3개 테스트)
3개 필드 정확 반영 / 중복 없음+3건 / 갱신·대상 건수 반환 검증.

## 검증
- `npx vitest run scripts/migrations/2026-09-30-add-legacy-art-exhibition-experience-to-children-category.test.mjs` — 3개 통과.
- `npx tsc --noEmit` / `npm run test`(전체 237개 파일 2,577개) / `npm run build` 모두 통과.
- 실제 DB: 3/3건 이관 완료(실행 로그로 확인).

## 특이 사항
나머지 2건(서울시립 미술아카이브/서울시어울림플라자)에 대한 제안은 사용자
메시지로 별도 전달했다(실측: 서울시립 미술아카이브는 raw_data.SUBJCODE=
"미술관/갤러리"이나 is_kids_friendly=false, FAC_DESC가 미술사 아카이브/연구
목적임을 명시 — 일반 '미술관'으로 재분류 제안. 서울시어울림플라자는
raw_data.SUBJCODE="기타"이며 FAC_DESC가 장애인/비장애인 복지문화복합시설
(수영장·도서관·공연장·장애인 치과병원 등)임을 명시 — 전시/미술 성격이 아니라
현재 '기타' 그대로 두고 잘못 붙은 구 노출중분류만 해제하는 것을 제안). 두 건
모두 실제 이관은 사용자 확인 후 별도로 진행한다.
