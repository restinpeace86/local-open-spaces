# gg_public 키즈카페 업종이 '식당'에 남아있던 행 재분류

## 구현 대상
사용자 지시(2026-09-27): "gg_public 원천소스에 'SANITTN_BIZCOND_NM': '키즈카페',
인것들이 지금 기타>>식당(중분류)에 있는 것들 전부 키즈/놀이시설>>키즈카페 로
다 옮겨줘".

## 배경
`gg-kidscafe-adapter.mjs`는 Resrestrtkidscafe API(휴게음식점+놀이시설,
source='gg_public') 전체를 소스 레벨에서 일괄 '놀이방식당'으로 분류한다
(개별 업종으로 세분화할 근거 필드가 없다는 이유). 이후
`2026-09-06-add-restaurant-category-min.sql`이 '놀이방식당' 중 노출중분류가
없던(아직 큐레이션 전) 1,788건을 일괄 '식당'으로 옮겼다.

실측 확인 결과 이 '식당' 행들 중 raw_data.SANITTN_BIZCOND_NM(원본 업종명)이
문자 그대로 '키즈카페'인 행이 162건 있었다 — 소스 레벨 기본값보다 더 구체적이고
신뢰할 수 있는 신호다. 이미 노출중분류(service_category_id)가 있던 3건도
전부 "키즈카페 / 실내놀이터"(키즈/놀이시설)로 큐레이션돼 있어 이번 이동과
방향이 일치함을 확인했다(충돌 없음).

## 변경 사항
`scripts/migrations/2026-09-27-move-gg-public-kidscafe-rows-out-of-restaurant.sql`
(신규, 프로덕션 DB에 적용 완료):
```sql
update public.open_spaces
set category_min = '키즈카페',
    category_min_source = 'MANUAL'
where source = 'gg_public'
  and raw_data->>'SANITTN_BIZCOND_NM' = '키즈카페'
  and category_min = '식당';
```
이름 키워드 매칭이 아니라 원본 raw_data 필드 값 + 사용자의 명시적 판단이므로
category_min_source는 2026-09-06 마이그레이션과 동일한 관례로 'MANUAL'로
표시했다.

## 검증
- 적용 전: `gg_public` + `SANITTN_BIZCOND_NM='키즈카페'` 기준 식당 162건 /
  키즈카페 113건 / 놀이방식당 5건.
- 적용 후: 키즈카페 275건(113+162) / 놀이방식당 5건 — 식당 0건으로 정확히
  이동 확인.
- 애플리케이션 코드 변경이 없는 순수 데이터 마이그레이션이라 tsc/test/build
  검증 루프는 해당하지 않는다.

## 특이 사항
- 이번 이동은 `SANITTN_BIZCOND_NM='키즈카페'` 조건에 해당하지 않는 나머지
  '식당' 행(놀이시설을 갖췄지만 원본 업종이 한식/커피숍 등인 업소)에는 영향을
  주지 않는다 — 사용자가 지시한 범위 그대로 좁혔다.
- 어댑터(`gg-kidscafe-adapter.mjs`)나 규칙 엔진은 건드리지 않았다 — 이번
  지시는 "지금 있는 것들"에 대한 일회성 정정이라, 향후 신규 수집 행은 기존
  로직(Resrestrtkidscafe → '놀이방식당') 그대로 들어온다.
