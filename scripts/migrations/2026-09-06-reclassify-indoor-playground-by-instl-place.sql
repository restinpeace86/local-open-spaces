-- [어린이놀이시설(실내) 중 raw_data.instlPlaceCdNm 기준 재분류](2026-09-06 사용자 지시):
-- "중분류 -어린이놀이시설(실내)에서 raw_data에 대하여 하기 5건은 중분류 기타로
-- 옮겨주고 instlPlaceCdNm: 학교/주택단지/목욕장업소/학원, 하기 1건은 중분류 어린이집으로
-- 옮겨줘 instlPlaceCdNm: 어린이집"
--
-- instlPlaceCdNm(설치장소코드명)은 정부 원천 데이터의 실제 설치 장소 분류다. 이름에
-- "어린이집"/"유치원"이 없어 지난 재분류([[2026-09-06-add-daycare-kindergarten-
-- category-min]] 참고, name LIKE 기준)에서는 걸러지지 않았지만, instlPlaceCdNm을 보면
-- 실제로는 학교/주택단지/목욕장업소/학원 부속 놀이시설이거나(키즈/놀이시설로 분류하기엔
-- 부적절 — '기타'로), 실제로는 어린이집 부속 놀이시설(설치 장소 자체가 어린이집)인
-- 경우가 있다.
--
-- 실측 확인(2026-09-06): category_min='어린이놀이시설(실내)' 대상 instlPlaceCdNm별 건수 —
-- 학교 48건, 주택단지 285건, 목욕장업소 29건, 학원 23건(합계 385건) → 기타로 이동.
-- 어린이집 5건 → 어린이집으로 이동. 두 대상 카테고리('기타', '어린이집') 모두 이미
-- 존재하는 표준 중분류라 category_rules에 새로 등록할 필요는 없다
-- (get_category_min_options는 2026-08-27 수정 이후 category_rules가 아니라 실제
-- open_spaces.category_min 컬럼에서 직접 distinct를 뽑는다 — 화면보다 데이터 우선
-- 원칙, 2026-08-27-fix-category-min-options-source.sql 참고).
--
-- 이 기준(raw_data JSONB 필드 값)은 이름 키워드 매칭이 아니라 관리자의 명시적 판단이므로
-- category_min_source는 'RULE'이 아니라 'MANUAL'로 표시한다.
update public.open_spaces
set category_min = '기타',
    category_min_source = 'MANUAL'
where category_min = '어린이놀이시설(실내)'
  and raw_data->>'instlPlaceCdNm' in ('학교', '주택단지', '목욕장업소', '학원');

update public.open_spaces
set category_min = '어린이집',
    category_min_source = 'MANUAL'
where category_min = '어린이놀이시설(실내)'
  and raw_data->>'instlPlaceCdNm' = '어린이집';
