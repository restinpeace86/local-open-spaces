# 표준 중분류 "놀이방찜질방/스파" 신규 추가 + 목욕장업소 데이터 이관

## 구현 대상
사용자 지시(2026-09-26): "1 관련해서는 노출중분류는 오늘 만들어놨어 난 표준
중분류를 얘기한거야.. 표준중분류를 그러면 키즈/놀이시설 대분류 밑에
놀이방찜질방/스파 중분류 추가해줘 현재 기타의 목욕장업소는 그대로
냅두고... 추후 여기에 데이터 새로 들어오는 것은 내가 표준중분류도
바꿀테니.. 즉 지금 해야 할건 1. 표준 중분류로 키즈/놀이시설(대분류) >>
놀이방찜질방/스파(중분류) 신규 추가 2. 기타 >> 목욕장업소(중분류)의
데이터를 놀이방찜질방/스파(중분류)로 이관 - 노출중분류 매핑은 내가
추후에 수동으로 할꺼니깐 그냥 null인상태로 건들지말고"

이전 턴에서 필자가 "노출 중분류"(service_categories DB 테이블,
service_category_id)와 "표준 중분류"(category_min, category-min-groups.ts
의 정적 taxonomy)를 혼동해 잘못 제안한 것을 사용자가 바로잡았다 — 이번
지시는 순수하게 **표준 중분류(category_min) 체계**에 대한 것이다.

## 변경 사항
### 1. `src/lib/admin/category-min-groups.ts`
`OPEN_SPACES_GROUPS_STATIC`의 `키즈/놀이시설` 그룹 minors에
`'놀이방찜질방/스파'`를 추가했다. `'목욕장업소'`는 이 파일 어디에도 명시적
으로 나열하지 않는다 — 원래도 `buildCategoryMinGroups()`의 catch-all
로직으로 `기타`에 자동 편입되던 값이라(정적 그룹 정의 없음), 앞으로 새로
들어오는 목욕장업소 데이터도 계속 `기타`로 자동 편입되고 사용자가 건별로
직접 재분류할 수 있게 그대로 둔다(사용자 지시대로 "목욕장업소는 그대로
냅두고").

### 2. `src/lib/spaces/spot-category-groups.ts`
`CORE_SPOT_CATEGORIES`에 `놀이방찜질방/스파`용 신규 칩(`id:
'kids-jjimjilbang-spa'`, `major: 'kids-play'`)을 추가했다 —
`spot-category-groups.test.ts`가 이 파일과 `OPEN_SPACES_GROUPS_STATIC`의
키즈/놀이시설 minors가 정확히 일치하는지 교차 검증하므로, 표준 중분류
추가만 하고 이쪽을 빠뜨리면 테스트가 즉시 실패한다(2026-09-05 동기화
원칙 유지).

### 3. 데이터 이관 (`scripts/migrations/2026-09-26-move-bathhouse-to-kids-jjimjilbang-spa.sql`)
`category_min = '목욕장업소'`인 기존 90건(실측)을 전부
`category_min = '놀이방찜질방/스파'`로 UPDATE했다. `service_category_id`는
명시적으로 건드리지 않았다(적용 전/후 전부 NULL 유지 확인 — 사용자가 추후
수동으로 노출 중분류를 매핑할 예정).

## 검증
- `npx tsc --noEmit` / `npm run test`(202개 파일 2,332개, 교차 검증
  테스트 포함) / `npm run build` 모두 통과.
- 실측: 마이그레이션 전후로 `category_min='목욕장업소'` 0건 남았는지,
  `category_min='놀이방찜질방/스파'` 90건 전부 `service_category_id`가
  여전히 NULL인지 직접 조회로 확인.

## 특이 사항
- 이 작업과 별개로, 같은 조사 중에 **"노출 이름 수동 수정"(display_name
  컬럼) 기능이 2026-09-20 도입 이후 한 번도 실제로 동작한 적이 없다**는
  걸 발견했다 — `get_nearby_spaces_and_events`/`get_spots_by_service_category`
  /`get_deal_spots` 등 유저 화면에 이름을 내려주는 모든 RPC가
  `coalesce(standard_name, name)`만 쓰고 `display_name`을 전혀 읽지
  않는다. 관리자가 저장한 값(예: "소원.1" → "소원.1 태전직영점")은 DB에
  정상 저장되지만 화면에는 절대 반영되지 않는다. 이번 지시 범위 밖이라
  이 기록에는 발견 사실만 남기고 손대지 않았다 — 별도 지시로 진행 예정.
