# 캠핑장/휴양마을/체험농장 뱃지 체계 전면 재작성 (개선사항1-A / Step 91)

## 구현 대상
`implementation/todo.md` 개선사항1: "각 중분류별 뱃지 태그 만들어주고 뱃지별
keyword 세팅해줘. 그리고 추가적으로 제안할 뱃지나 혹은 키워드 빠진게 있으면
더 추가해줘 [캠핑장 / 피크닉장] [휴양마을] [교육체험 / 체험농장]"

todo.md에 뱃지 키·라벨·키워드가 상세히 확정돼 있어, 2026-09-10 1차(Step 90)에
임시로 잡았던 `cp_`/`rv_`/`ef_` 키 체계를 스펙 확정 키 체계로 전면 교체했다.

동적 연령 추천 시스템(min_age_recommended)은 별도 하위 작업(1-B / Step 92)으로
분리해 todo.md 진행 상태에 등록했다 — DB 컬럼 신설·후기 휴리스틱·관리자 수동
오버라이드 UI를 포함해 범위가 크고 이 뱃지 재작성과 독립적으로 검증
가능하기 때문(제5장 제13조 작업 세분화).

## 구현 일시
2026-09-10

## 변경 사항
### `src/lib/admin/curation-badges.ts`
- `CAMPING_CONFIG` / `RURAL_VILLAGE_CONFIG` / `EDUCATION_FARM_CONFIG`의
  `badgeOptions`·`badgeGroups`·`keywordGroups`를 todo.md 스펙대로 전면 교체.
  - 캠핑장: `CAMPING_TRAMPOLINE` / `CAMPING_WATER_PLAY` / `CAMPING_SAND` /
    `CAMPING_WARM_WATER` / `CAMPING_FLAT_SITE` / `CAMPING_STORE` /
    `CAMPING_GLAMPING_CARAVAN` + 네거티브 `NEG_BACKPACKING` / `NEG_NO_KIDS` /
    `NEG_NO_ELECTRICITY` / `NEG_ROUGH_TERRAIN` / `NEG_PET_ONLY` /
    `NEG_DANGEROUS_VALLEY`. 그룹: 놀이/물놀이 · 편의/시설 · 캠핑 유형 · 주의/제한.
  - 휴양마을: `RURAL_STREAM_PLAY` / `RURAL_ANIMAL_FEEDING` /
    `RURAL_TRADITIONAL_FOOD` / `RURAL_CROP_HARVEST` / `RURAL_SPACIOUS_YARD` /
    `RURAL_ACCOMMODATION` / `RURAL_NEARBY_INFRA` + 네거티브 `NEG_DEEP_VALLEY` /
    `NEG_REMOTE_VILLAGE` / `NEG_POOR_FACILITY`.
  - 체험농장: `EDU_MAKING_COOKING` / `EDU_CROP_HARVEST` /
    `EDU_ANIMAL_EXPERIENCE` / `EDU_FARM_MACHINE` / `EDU_INDOOR_RAINY` /
    `EDU_SAFETY_STAFF` + 네거티브 `NEG_EDU_PESTS_RISK` / `NEG_EDU_MACHINE_HAZARD`.
- 제안 추가 뱃지: `CAMPING_PLAYGROUND`(놀이터 있음) — 어린 자녀 동반 캠핑의
  대표 편의 요소인데 스펙 목록에서 빠져 있어 todo.md의 "제안할 뱃지 더 추가해줘"
  지침에 따라 보완(코드에 근거 주석).
- 키워드 품질 보정(코드/테스트 주석에 명시): todo.md 스펙의 단일 음절 키워드
  (`양`, `벌`)·초광역 단어(맨 `체험`, 맨 `관찰`)는 자동 체크가 매 스팟마다
  오검출을 쏟아내 세미오토 검수 워크플로를 방해하므로 오검출이 적은 구(句)
  단위로 구체화: `양`→`양떼`/`염소`, `벌`→`벌 쏘`/`말벌`/`벌집`,
  맨 `체험`→`체험활동`, `관찰`→`자연관찰`. 뱃지 키·라벨은 스펙 그대로.
- `NEG_DANGEROUS_VALLEY`/`NEG_DEEP_VALLEY`의 `위험한 계곡`·`깊은 계곡`은
  포지티브 물놀이 뱃지의 `계곡`보다 길어 최장 우선 매칭 규칙(기존 로직)에 의해
  네거티브로 정확히 귀속된다 — 테스트로 회귀 고정.

### `src/lib/admin/curation-badges.test.tsx`
- 3개 describe 블록(camping/rural_village/education_farm)을 신규 키/라벨/그룹
  기준으로 재작성. "위험한 계곡" 네거티브 귀속, 단일 음절 키워드 구체화
  회귀 테스트 추가. (전체 46건 통과)

## 검증
- `npx tsc --noEmit` 통과(무출력).
- `npm run test`: 121 파일 1400건 통과(직전 1398 → 테스트 재작성으로 +2).
- `npm run build`: Compiled successfully.

## 특이 사항
- 이 3개 노출 중분류에 저장된 기존 `curation_badges`는 0건(Step 90 구현 기록에서
  실측)이라 키 체계를 바꿔도 데이터 마이그레이션 불필요.
- 소비자(스팟픽 상세 카드)에서 네거티브 뱃지를 시각적으로 구분해 노출하는
  것은 개선사항3(상세 카드 최종 UI)에서 다룬다 — 이번 범위 아님.
- 나머지 8개 노출 중분류는 여전히 보편 임시 뱃지(GENERIC_CONFIGS) 유지.
