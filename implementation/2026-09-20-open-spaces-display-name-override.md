# [OPEN_SPACES 노출 이름 수동 수정 + 스팟 큐레이션 상호명 자동 채움]

## 구현 대상
사용자 지시(2026-09-20): "이거 OPEN_SPACES쪽에서도.. 이름 변경 가능하도록 해줘
제목.. 지금 키즈/놀이시설의 놀이방식당관련해서 장우랑 놀이방 있는데 이게 장우랑
& 양주회센터야.. 놀이방 시설등록하다보니 이렇게 된거 같은데.. 노출되는 제목에
대하여서도 여기도 따로 관리해야할꺼같아 기본적으로는 지금 타이틀이 들어가게
해놓고.. 그리고 스팟큐레이션으로 데이터 가져올때 상호명도 가져오는데 이거에
대하여 자동적으로 상호명도 들어가도록 하는것도 만들어줘."

실측 확인: `open_spaces`의 "장우랑 놀이방"(id `c613d7d3-...`)은 `LOCALDATA_PLAYGROUND`
소스(놀이방 시설 등록 데이터, raw_data.pfctNm)에서 온 값으로, 그 등록 데이터
자체가 놀이방 시설 하나만을 가리켜 "장우랑 놀이방"으로 들어와 있다(현재 DB 값
자체는 오염되지 않음). 사용자가 말한 "장우랑 & 양주회센터"는 실제 매장이 식당
(양주회센터)과 놀이방(장우랑)이 한 상호로 함께 운영되는 것으로 보이며, 그 결합된
정식 상호명은 네이버 플레이스 쪽에서 확인된다 — 즉 이번 기능은 "이미 잘못
들어온 값을 고친다"가 아니라 "놀이방 시설 등록 데이터가 구조적으로 담지 못하는
결합 상호명을, 관리자가 네이버 플레이스를 조회해 보완할 수 있게 한다"가 정확한
문제 정의다.

## 왜 events.title 패턴을 그대로 재사용할 수 없었나
이전에 만든 events 제목 수동 수정(TitleEditor)은 `events.title` 컬럼을 직접
PATCH하는 방식이었다 — `events`는 재수집 시 안전 병합(`upsertRowsSafeMerge`,
`title`이 `ALWAYS_REFRESH_FIELDS`에 없음)을 쓰기 때문에 이 방식이 다음 재수집에도
안전했다. 반면 `open_spaces`는 재수집 시 `upsertRows`(순수 upsert, 필드 보존 없음
— 성능 목적)를 쓴다는 걸 확인했다 — 원본 `name`을 직접 고치면 다음 재수집에
그대로 되돌아간다. 그래서 재수집 파이프라인이 절대 건드리지 않는 새 컬럼
(`display_name`)이 필요했다.

## 변경 사항

### DB
- `scripts/migrations/2026-09-20-open-spaces-display-name.sql`:
  `open_spaces.display_name text`(nullable) 추가. 적재 파이프라인 어떤 어댑터도
  이 컬럼을 쓰지 않으므로 재수집에 안전하다.
- `supabase/migrations/20260920000000_nearby_rpc_prefer_display_name.sql`:
  `get_nearby_spaces_and_events` RPC가 `s.name` 대신
  `coalesce(s.display_name, s.name)`을 반환하도록 `create or replace`(반환 컬럼
  모양 동일해 drop 불필요).
- 적용 후 `node scripts/gen-types.mjs`로 타입 재생성.

### 공개 화면 노출 경로 3곳 모두 override 우선 적용
실측으로 확인한 `open_spaces.name`을 읽는 3개 프로듀서 지점을 전부 수정했다
(전부 `display_name ?? name`으로 폴백):
1. `get_nearby_spaces_and_events` RPC(위 SQL) — 지도/근처 탐색의 메인 소스.
2. `src/lib/home/get-home-feed.ts`의 `SPACE_COLUMNS`/`SpaceRow`/`toSpaceItem()` —
   전국 검색, `/api/spots/by-id`, `/api/events/linked-spot`, 무료 피드가 공유.
3. `src/lib/spaces/get-all-spaces.ts`의 `getAllOpenSpaces()` — 지역별 도감 그리드.

### 관리자 — 직접 편집(라우트 A)
`raw-data-modal.tsx`의 events `TitleEditor`와 동일한 UX의 `SpotDisplayNameEditor`
추가(open_spaces 탭 전용, `onDisplayNameUpdated` 콜백을 통해 `data-grid-client.tsx`의
목록/선택된 행 상태까지 즉시 반영). 기본값은 `display_name ?? name`(요구사항
"기본적으로는 지금 타이틀이 들어가게"), 빈 값으로 저장하면 override를 지워
원본 이름으로 되돌린다. `PATCH /api/admin/data-grid/display-name`(신규,
facility-type/title route와 동일한 "필드 하나당 라우트 하나" 관례) 사용.
목록(그리드) 셀과 모달 헤더 제목도 override를 우선해 보여주도록 함께 고쳤다.

### 관리자 — 스팟 큐레이션 크롤링 자동 채움(라우트 B)
"스팟큐레이션으로 데이터 가져올때 상호명도 가져오는데.. 자동적으로 상호명도
들어가도록" 요구사항의 실제 구현 지점: `spot-curations-panel.tsx`의
`CurationFormModal`에 "노출 이름" 입력 필드를 추가했다.
- 크롤링 버튼(⚡ 데이터 가져오기)이 이미 파싱해 오던 `상호명`(지금까지는
  비교용 미리보기에서만 보이고 저장되지 않던 값, 코드 주석에 그렇게 명시돼
  있었음)을 이 입력창에 자동으로 채운다(이미지/영업시간/메뉴와 동일한 자동
  반영 패턴).
- 기본값은 `open_spaces.display_name ?? name`(신규 등록은 `presetSpot`, 수정은
  `initial.open_spaces`에서 프리필 — 두 경로 모두 이 값을 프리필하도록 관련
  타입(`SpotCurationItem.open_spaces`, `SpotSearchResult`, `CandidateSpotRow`)에
  `display_name`을 추가했다).
- 폼 저장(스팟 큐레이션 저장) 성공 후, 값이 바뀐 경우에만
  `PATCH /api/admin/data-grid/display-name`을 이어서 호출해 `open_spaces`에도
  반영한다. `display_name`은 `spot_curations` 테이블 컬럼이 아니라 `open_spaces`
  컬럼이라 별도 API 호출이 필요했다 — 실패해도 이미 성공한 큐레이션 저장 자체를
  실패로 되돌리지 않는다(제5장 제11조 오류 처리 원칙).
- `/api/admin/spot-curations` GET/POST/PATCH의 `open_spaces(...)` 조인 select에
  `display_name`을 추가해 위 프리필이 가능하도록 했다.
- `spot-curation-quick-modal.tsx`(open_spaces 상세에서 스팟 큐레이션 바로 열기
  진입점)도 `spotDisplayName` prop을 추가로 받아 신규 등록 모드로 열릴 때도
  override 값을 프리필하도록 함께 고쳤다(안 하면 이미 설정된 override를
  모른 채 원본 이름으로 되돌아가 보일 뻔했다).

## 검증
- `npx tsc --noEmit` 통과.
- `npm run test`: 170개 파일 2056개 테스트 전부 통과(신규 8개 — `raw-data-modal.test.tsx`에
  `SpotDisplayNameEditor` 4개, `spot-curations-panel.test.tsx`에 크롤링 자동 채움/
  저장 시 PATCH 흐름 4개). 타입 변경으로 깨진 기존 목업(`data-grid-client.test.tsx`,
  `raw-data-modal.test.tsx`의 `buildRow`, `spot-curation-quick-modal.tsx`의
  `presetSpot`)에 `display_name` 필드를 보강했다.
- `npm run build` 통과.
- 실측: 실제 "장우랑 놀이방" 행(id `c613d7d3-48e4-4f88-b3ce-7fc9a4e1ebff`,
  소스 `LOCALDATA_PLAYGROUND`)을 조회해 raw_data까지 확인 — 현재 DB 값 자체는
  "장우랑 & 양주회센터"로 오염되지 않았고(순수 놀이방 등록 데이터 특성상
  놀이방 이름만 담김), 사용자가 말한 결합 상호명은 네이버 플레이스 조회로만
  얻을 수 있는 정보임을 확인했다 — 그래서 이번 기능(관리자가 스팟 큐레이션에서
  네이버 플레이스를 크롤링해 노출 이름을 보완)이 정확한 해결책이며, 별도의
  일회성 데이터 수정은 필요 없다(관리자가 실제로 이 스팟을 큐레이션할 때 이
  기능으로 직접 보완하면 됨).

## 특이 사항
`display_name`은 `open_spaces` 전용이며 `events.title`과는 저장 위치와 보호
메커니즘이 다르다(위 "왜 재사용 못했나" 참고) — 두 기능의 이름은 비슷해 보이지만
구현은 의도적으로 분리했다.
