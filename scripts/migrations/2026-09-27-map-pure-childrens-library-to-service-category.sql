-- [순수 어린이도서관 노출중분류 일괄 매핑](2026-09-27 사용자 지시): "어린이
-- 도서관들만 노출중분류 어린이 도서관으로 수동으로 매핑시키고.."
--
-- 배경: category_min='도서관' 후보 검토 중, 이름에 "어린이/아동"이 있는 160건
-- 중 4건("OO도서관_아동자료실/어린이자료실")은 일반도서관 안의 한 구역일 뿐이라
-- 제외했다(사용자 확인, 2026-09-27-library-candidate-badge-exclude-section-only).
-- 남은 156건은 전부 건물 전체가 아동 전용인 순수 어린이도서관이다.
--
-- 실측 확인: 156건 중 155건은 service_category_id가 비어있고, 1건은 이미
-- "어린이 도서관"으로 정확히 매핑돼 있어 충돌 없음.
update public.open_spaces
set service_category_id = '22286b2a-b386-4bb6-a853-31b62b3f62c7' -- 어린이 도서관(문화시설)
where category_min = '도서관'
  and name ~* '어린이|아동'
  and name !~* '자료실';
