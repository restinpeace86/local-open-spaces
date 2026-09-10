# 사용자 글쓰기 스팟 검색 최종 플로우 (내부→외부 Fallback + Auto-Upsert) — 개선사항5 / Step 97

## 구현 대상
`implementation/todo.md` 개선사항5:
- 3글자 이상 입력 시 검색, 디바운스 0.3초.
- 2단계 검색: 내부 DB 우선(중분류 무관 전체) → 결과 없거나 부족하면 네이버/카카오
  로컬 API Fallback을 함께 노출.
- 미등록 장소 선택 시 Auto-Upsert: 상호명/주소/좌표를 우리 DB에 안전하게 복사해
  스팟으로 등록, 등록과 동시에 선택된 상태로 다음 글쓰기 단계 진입.

## 구현 일시
2026-09-10

## 변경 사항
### `src/lib/kakao/local-keyword-search.ts` (신규, 서버 전용)
- `searchKakaoLocalKeyword(query, size)`: 카카오 로컬 키워드 장소 검색
  (`dapi.kakao.com/v2/local/search/keyword.json`, `KAKAO_REST_API_KEY`) 호출.
  수집 파이프라인의 `scripts/ingest/.../kakao-geocoder.mjs`와 같은 엔드포인트지만
  Next.js 앱(서버)용으로 분리.
- `parseKakaoLocalDocuments(json)`: 순수 파서(단위 테스트 대상) — `place_name`,
  `road_address_name || address_name`, `x`/`y` → `{ externalId: KAKAO_LOCAL_<id>,
  name, address, lat, lng }`. 상호명/주소/좌표 누락·한국 밖 좌표는 버림.

### `src/app/api/spots/search-external/route.ts` (신규)
- `GET ?q=` (3글자 이상) → 카카오 로컬 프록시. 실패/키 없음이면 빈 배열(글쓰기
  차단 안 함 — 제5장 제11조).

### `src/app/api/spots/upsert-external/route.ts` (신규)
- `POST { externalId, name, address, lat, lng }` → `open_spaces` Auto-Upsert.
  - `externalId`는 `KAKAO_LOCAL_` 접두어 필수(임의 좌표/이름 주입 방지), 좌표는
    한국 경계 검증.
  - `open_spaces.external_id`가 UNIQUE라 이미 있으면 그 행을 그대로 반환
    (`created: false`), 없으면 insert(`source_type/source = 'USER_SUBMITTED'`,
    `category = 'ETC'`, `location = SRID=4326;POINT(lng lat)`,
    `location_precision = 'EXACT'`). 동시 클릭 UNIQUE 충돌(23505)도 재조회로 흡수.
  - RLS 때문에 `createAdminClient()`(service_role) 사용 — 다른 관리자 쓰기
    엔드포인트와 동일 패턴.

### `src/components/community/spot-picker.tsx`
- `SEARCH_MIN_LENGTH` 2 → **3**. 디바운스 300ms 유지.
- 2단계: 내부 `/api/spots/search` 조회 후, 결과가 `EXTERNAL_FALLBACK_THRESHOLD(3)`
  미만이면 `/api/spots/search-external`도 호출해 (내부와 주소 중복 제거 후) 목록
  하단에 "지도 검색 결과 · 선택하면 자동으로 등록돼요" 구분선과 함께 노출.
- 외부 항목 탭 → `pickExternal`이 `/api/spots/upsert-external` 호출 → 반환된
  `{ id, name, address }`로 `onSelect`. 등록 중 표시/실패 문구 처리.

### 테스트
- `src/lib/kakao/local-keyword-search.test.ts` +4 (파서).
- `src/components/community/spot-picker.test.tsx` +5 (3글자 게이트, 내부 충분 시
  외부 미조회, 부족 시 외부 병합, Auto-Upsert 성공/실패).

## 검증
- `npx tsc --noEmit` 통과.
- `npm run test`: 125 파일 1441건 통과(직전 1432 → +9).
- `npm run build`: Compiled successfully. 두 라우트 등록 확인.

## 특이 사항
- 스펙의 "네이버/카카오 로컬 API" 중 카카오 로컬만 연결했다 — 이미 프로젝트에
  `KAKAO_REST_API_KEY`와 카카오 로컬 키워드 검색 활용 선례(kakao-geocoder.mjs)가
  있고, 네이버 로컬 검색은 별도 키/엔드포인트가 필요해 범위를 넓히지 않았다
  (제1장 제4조 — 확장을 이유로 현재 범위 초과 금지). 필요 시 동일 구조로 추가 가능.
- 실제 카카오 API 호출은 서버 키가 있는 환경에서만 동작 — 로컬/CI에서는 외부
  결과가 빈 배열이라 내부 검색만으로 정상 동작한다.
