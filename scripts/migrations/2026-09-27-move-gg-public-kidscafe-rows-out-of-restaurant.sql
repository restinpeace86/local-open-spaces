-- [gg_public 키즈카페 업종이 '식당'에 잘못 남아있는 행 재분류](2026-09-27 사용자
-- 지시): "gg_public 원천소스에 SANITTN_BIZCOND_NM: 키즈카페 인것들이 지금
-- 기타>>식당(중분류)에 있는 것들 전부 키즈/놀이시설>>키즈카페 로 다 옮겨줘"
--
-- 배경: gg-kidscafe-adapter.mjs는 Resrestrtkidscafe API(휴게음식점+놀이시설,
-- source='gg_public') 전체를 소스 레벨에서 일괄 '놀이방식당'으로 분류한다(개별
-- 업종으로 세분화할 근거 필드가 없다는 이유, 어댑터 주석 참고). 이후
-- 2026-09-06-add-restaurant-category-min.sql이 '놀이방식당' 중 노출중분류가
-- 없던(아직 큐레이션 전) 1,788건을 일괄 '식당'으로 옮겼다.
--
-- 실측 확인(2026-09-27): 이 '식당' 행들 중 raw_data.SANITTN_BIZCOND_NM(원본
-- 업종명)이 문자 그대로 '키즈카페'인 행이 162건 있다 — 소스 레벨 기본값과
-- 무관하게, 그 업소 자체의 원본 업종 데이터가 이미 키즈카페라는 뜻이라 더
-- 구체적이고 신뢰할 수 있는 신호다. 이미 노출중분류(service_category_id)가
-- 있던 3건도 전부 "키즈카페 / 실내놀이터"(키즈/놀이시설)로 큐레이션돼 있어
-- 이번 이동과 방향이 일치함을 확인했다(충돌 없음).
--
-- 이름 키워드 매칭이 아니라 원본 raw_data 필드 값 + 사용자의 명시적 판단이므로
-- category_min_source는 2026-09-06 마이그레이션과 동일한 관례로 'MANUAL'로
-- 표시한다.
update public.open_spaces
set category_min = '키즈카페',
    category_min_source = 'MANUAL'
where source = 'gg_public'
  and raw_data->>'SANITTN_BIZCOND_NM' = '키즈카페'
  and category_min = '식당';
