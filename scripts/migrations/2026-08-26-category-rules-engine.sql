-- [카테고리 정제 & 어드민 확장] Dynamic Keyword Rule Engine
--
-- 배경: docs/category-mapping-keywords-draft.md(검토용 초안) + docs/category-mapping-dryrun-report.md
-- (읽기 전용 Dry-run 결과) 를 거쳐, 대표가 "전체 소스에 새로운 통합 중분류 매핑을 정의"하는
-- 방향으로 결정했다. 표준 중분류는 SEOUL_YEYAK 실측 47종 + Dry-run에서 발견한 구조적 공백
-- 2종(공원/어린이놀이터 — city_park/localdata_playground는 SEOUL_YEYAK이 "예약 시스템"이라
-- 애초에 대응 카테고리가 없었음)을 더해 총 49종이다.
--
-- category_rules에 target_table 컬럼을 둔 이유(사용자 지시 스키마에는 없던 추가 컬럼):
-- open_spaces/events 각각의 표준 중분류명이 서로 겹치지 않게 설계돼 있지만(예: "공연장"은
-- open_spaces 전용, "문화행사"는 events 전용), 구분자 없이 전체 룰을 두 테이블 모두에 적용하면
-- 우연한 키워드 충돌로 잘못된 테이블에 오매칭될 위험이 있다(예: open_spaces 시설명에 "축제"라는
-- 단어가 우연히 들어있으면 events 전용 "문화행사" 룰에 걸릴 수 있음). 정확성을 위한 필수
-- 추가이며, 스키마 확장이지 임의 기능 추가가 아니다.

-- 1. category_rules 테이블 신규 생성
create table if not exists public.category_rules (
  id bigint generated always as identity primary key,
  target_table text not null check (target_table in ('open_spaces', 'events')),
  category_min text not null,
  keyword text not null,
  is_exclude boolean not null default false,
  created_at timestamptz not null default now(),
  unique (target_table, category_min, keyword, is_exclude)
);

create index if not exists idx_category_rules_target_category
  on public.category_rules (target_table, category_min);

-- 2. open_spaces / events 컬럼 정비
alter table public.open_spaces
  add column if not exists category_min text,
  add column if not exists category_min_source text
    check (category_min_source in ('RAW', 'RULE', 'MANUAL'));

alter table public.events
  add column if not exists category_min text,
  add column if not exists category_min_source text
    check (category_min_source in ('RAW', 'RULE', 'MANUAL'));

create index if not exists idx_open_spaces_category_min on public.open_spaces (category_min);
create index if not exists idx_events_category_min on public.events (category_min);

-- 3. 초기 키워드 시드 데이터 (49종: SEOUL_YEYAK 실측 47종 + 신규 확장 2종)
-- 배열 안 순서 = id 오름차순 = 매칭 우선순위(먼저 선언된 규칙이 먼저 시도됨).
-- docs/category-mapping-keywords-draft.md 2.1~2.8 그대로 코드화.

-- 3.1. open_spaces — 체육시설류 (15종)
insert into public.category_rules (target_table, category_min, keyword, is_exclude) values
  ('open_spaces', '풋살장', '풋살장', false),
  ('open_spaces', '풋살장', '풋살구장', false),
  ('open_spaces', '축구장', '축구장', false),
  ('open_spaces', '테니스장', '테니스장', false),
  ('open_spaces', '테니스장', '테니스코트', false),
  ('open_spaces', '골프장', '골프장', false),
  ('open_spaces', '골프장', '골프연습장', false),
  ('open_spaces', '골프장', '스크린골프', false),
  ('open_spaces', '농구장', '농구장', false),
  ('open_spaces', '족구장', '족구장', false),
  ('open_spaces', '체육관', '체육관', false),
  ('open_spaces', '체육관', '종합체육관', false),
  ('open_spaces', '체육관', '실내체육관', false),
  ('open_spaces', '야구장', '야구장', false),
  ('open_spaces', '야구장', '야구연습장', false),
  ('open_spaces', '배드민턴장', '배드민턴장', false),
  ('open_spaces', '배드민턴장', '배드민턴코트', false),
  ('open_spaces', '탁구장', '탁구장', false),
  ('open_spaces', '배구장', '배구장', false),
  ('open_spaces', '수영장', '수영장', false),
  ('open_spaces', '수영장', '물놀이장', false),
  ('open_spaces', '피클볼장', '피클볼장', false),
  ('open_spaces', '피클볼장', '피클볼코트', false),
  ('open_spaces', '다목적경기장', '다목적경기장', false),
  ('open_spaces', '다목적경기장', '다목적구장', false),
  ('open_spaces', '운동장', '운동장', false),
  ('open_spaces', '운동장', '종합운동장', false)
on conflict do nothing;

-- 3.2. open_spaces — 공공청사 대관형 공간류 (9종)
insert into public.category_rules (target_table, category_min, keyword, is_exclude) values
  ('open_spaces', '회의실', '회의실', false),
  ('open_spaces', '회의실', '세미나실', false),
  ('open_spaces', '강당', '강당', false),
  ('open_spaces', '강의실', '강의실', false),
  ('open_spaces', '다목적실', '다목적실', false),
  ('open_spaces', '다목적실', '다목적홀', false),
  ('open_spaces', '주민공유공간', '주민공유공간', false),
  ('open_spaces', '주민공유공간', '공유공간', false),
  ('open_spaces', '주민공유공간', '커뮤니티공간', false),
  ('open_spaces', '청년공간', '청년공간', false),
  ('open_spaces', '청년공간', '청년센터', false),
  ('open_spaces', '녹화장소', '녹화장소', false),
  ('open_spaces', '녹화장소', '스튜디오', false),
  ('open_spaces', '녹화장소', '방송스튜디오', false),
  ('open_spaces', '교육시설', '교육시설', false),
  ('open_spaces', '교육시설', '교육관', false)
  -- "민원 등 기타"는 원안대로 키워드 매칭 대상에서 제외(항상 RAW로만 채워짐).
on conflict do nothing;

-- 3.3. open_spaces — 야외 여가시설류 (2종)
insert into public.category_rules (target_table, category_min, keyword, is_exclude) values
  ('open_spaces', '캠핑장', '캠핑장', false),
  ('open_spaces', '캠핑장', '야영장', false),
  ('open_spaces', '캠핑장', '오토캠핑장', false),
  ('open_spaces', '캠핑장', '카라반', false),
  ('open_spaces', '광장', '광장', false)
on conflict do nothing;

-- 3.4. open_spaces — 전시/공연류 (2종)
insert into public.category_rules (target_table, category_min, keyword, is_exclude) values
  ('open_spaces', '공연장', '공연장', false),
  ('open_spaces', '공연장', '아트홀', false),
  ('open_spaces', '공연장', '콘서트홀', false),
  ('open_spaces', '전시실', '전시실', false),
  ('open_spaces', '전시실', '전시관', false),
  ('open_spaces', '전시실', '갤러리', false)
on conflict do nothing;

-- 3.5. open_spaces — 신규 확장 2종 (SEOUL_YEYAK 표준 아님, Dry-run 리포트 권고 반영)
-- localdata_playground(82,372건, open_spaces의 약 59%)/city_park(17,079건, 약 12%)가
-- SEOUL_YEYAK 47종 어디에도 대응 카테고리가 없어 매칭률이 각각 1.38%/0.64%에 그쳤던 구조적
-- 공백을 메우기 위해 대표 결정으로 신설.
insert into public.category_rules (target_table, category_min, keyword, is_exclude) values
  ('open_spaces', '공원', '공원', false),
  ('open_spaces', '공원', '근린공원', false),
  ('open_spaces', '공원', '생태공원', false),
  ('open_spaces', '공원', '수변공원', false),
  ('open_spaces', '공원', '도시공원', false),
  ('open_spaces', '어린이놀이터', '어린이놀이터', false),
  ('open_spaces', '어린이놀이터', '놀이터', false),
  ('open_spaces', '어린이놀이터', '놀이시설', false),
  ('open_spaces', '어린이놀이터', '키즈존', false)
on conflict do nothing;

-- 3.6. events — 강좌/체험류 (8종)
insert into public.category_rules (target_table, category_min, keyword, is_exclude) values
  ('events', '미술제작', '미술', false),
  ('events', '미술제작', '그리기', false),
  ('events', '미술제작', '도자기', false),
  ('events', '미술제작', '공작', false),
  ('events', '미술제작', '미술관', true),
  ('events', '공예/취미', '공예', false),
  ('events', '공예/취미', 'DIY', false),
  ('events', '공예/취미', '취미반', false),
  ('events', '공예/취미', '원데이클래스', false),
  ('events', '교양/어학', '어학', false),
  ('events', '교양/어학', '외국어', false),
  ('events', '교양/어학', '교양강좌', false),
  ('events', '교양/어학', '인문학', false),
  ('events', '전문/자격증', '자격증', false),
  ('events', '전문/자격증', '전문과정', false),
  ('events', '전문/자격증', '직업훈련', false),
  ('events', '정보통신', '코딩', false),
  ('events', '정보통신', 'IT', false),
  ('events', '정보통신', '컴퓨터', false),
  ('events', '정보통신', '정보통신', false),
  ('events', '도시농업', '도시농업', false),
  ('events', '도시농업', '텃밭', false),
  ('events', '도시농업', '주말농장', false),
  ('events', '농장체험', '농장체험', false),
  ('events', '농장체험', '체험농장', false),
  ('events', '농장체험', '과일따기', false),
  ('events', '교육체험', '교육체험', false),
  ('events', '교육체험', '체험교실', false),
  ('events', '교육체험', '아이와 함께', false)
  -- "기타"는 원안대로 키워드 매칭 대상에서 제외(항상 RAW로만 채워짐).
on conflict do nothing;

-- 3.7. events — 자연/야외활동류 (3종)
insert into public.category_rules (target_table, category_min, keyword, is_exclude) values
  ('events', '산림여가', '숲체험', false),
  ('events', '산림여가', '자연휴양림', false),
  ('events', '산림여가', '산림욕', false),
  ('events', '산림여가', '트레킹', false),
  ('events', '공원탐방', '공원탐방', false),
  ('events', '공원탐방', '공원투어', false),
  ('events', '공원탐방', '둘레길 걷기', false),
  ('events', '자연/과학', '자연관찰', false),
  ('events', '자연/과학', '과학교실', false),
  ('events', '자연/과학', '천체관측', false)
on conflict do nothing;

-- 3.8. events — 문화/전시/스포츠/역사류 (4종, "전시/관람"이 "문화행사"보다 먼저 매칭되도록 순서 유지)
insert into public.category_rules (target_table, category_min, keyword, is_exclude) values
  ('events', '전시/관람', '전시', false),
  ('events', '전시/관람', '전시회', false),
  ('events', '전시/관람', '관람', false),
  ('events', '문화행사', '축제', false),
  ('events', '문화행사', '공연', false),
  ('events', '문화행사', '페스티벌', false),
  ('events', '문화행사', '문화행사', false),
  ('events', '스포츠', '스포츠교실', false),
  ('events', '스포츠', '생활체육', false),
  ('events', '스포츠', '운동교실', false),
  ('events', '역사', '역사', false),
  ('events', '역사', '유적', false),
  ('events', '역사', '문화재', false),
  ('events', '역사', '고궁', false)
on conflict do nothing;

-- 3.9. events — 기타/SEOUL_YEYAK 특화류 (3종, "기타" 제외)
insert into public.category_rules (target_table, category_min, keyword, is_exclude) values
  ('events', '서울형키즈카페', '서울형키즈카페', false),
  ('events', '서울형키즈카페', '키즈카페', false),
  ('events', '청년정보', '청년정보', false),
  ('events', '청년정보', '청년지원', false),
  ('events', '단체봉사', '봉사활동', false),
  ('events', '단체봉사', '자원봉사', false)
on conflict do nothing;

-- 4. SEOUL_YEYAK(source='seoul_public_reservation') 기존 행 RAW 백필
-- MINCLASSNM은 이 소스의 raw_data JSONB에만 있는 서울시 표준 원본 필드라, 이 소스에 한해서는
-- 룰 엔진을 거칠 필요 없이 곧바로 ground-truth로 반영한다.
update public.open_spaces
set category_min = raw_data->>'MINCLASSNM',
    category_min_source = 'RAW'
where source = 'seoul_public_reservation'
  and raw_data->>'MINCLASSNM' is not null
  and category_min is null;

update public.events
set category_min = raw_data->>'MINCLASSNM',
    category_min_source = 'RAW'
where source = 'seoul_public_reservation'
  and raw_data->>'MINCLASSNM' is not null
  and category_min is null;

-- 5. 어드민 그리드 "중분류(category_min) 옵션 목록" 조회용 RPC
-- 표준 49종을 category_rules에서 곧바로 뽑는다(실제 데이터에 아직 한 건도 없는 카테고리도
-- 필터 옵션에는 항상 노출되도록 category_rules를 Source of Truth로 삼는다 — "민원 등 기타"/
-- "기타"처럼 키워드가 없는 2종은 RAW로만 채워지므로 이 목록에는 없다. 이 두 값은 실제 데이터에
-- 존재하면 어드민 그리드의 "원천 중분류(raw_data 기반)" 필터로 이미 확인 가능하다).
create or replace function public.get_category_min_options(p_target_table text)
returns table (category_min text) as $$
  select distinct category_min
  from public.category_rules
  where target_table = p_target_table
  order by category_min;
$$ language sql stable;
