# 전국 주차장 표준데이터 통합 (todo.md 개선사항1)

## 구현 대상
`implementation/todo.md` 개선사항1 — 전국주차장정보표준데이터(data.go.kr,
18,939건)를 SpotPick/EventPick에 연동. 부설(건물 전용) 주차장은 스팟에 1:1
FK 매칭, 노외(공용) 주차장은 반경검색으로 노출. 핵심 설계 결정은
`project/decision-log.md` Decision 033 참고.

## 구현 일시
2026-10-15

## 변경 사항

### 1. DB — `scripts/migrations/2026-10-15-parking-metadata-national-dataset.sql`
- `parking_metadata` 신규 테이블(주차장관리번호/이름/구분/유형/주소/요금
  체계/결제방법/특기사항/관리기관/좌표 등 전체 컬럼 + 개선사항2·3용
  `realtime_available_count`/`is_multi_child_discount`/`discount_info`
  컬럼 선점).
- `open_spaces.parking_id`(nullable FK) 신규 — 부설 1:1 매칭용.
- `get_nearby_parking_lots` RPC 재정의 — `type_name='노외'`만 반환, 요금/
  결제/특기사항/다자녀할인/실시간현황까지 반환 컬럼 확대(기존보다 풍부).
- `truncate_parking_metadata()`/`find_busul_parking_candidates()` 신규 RPC.
- `seoul_public_parking_lots` → `seoul_public_parking_lots_deprecated_20261015`
  로 rename(DROP 아님, Decision 033 참고).
- **실측으로 발견/수정한 버그 3개**(적용 중 실제로 겪음):
  1. `TRUNCATE`는 FK로 참조되는 테이블에 쓸 수 없음(`cannot truncate a table
     referenced in a foreign key constraint`) → `DELETE`로 교체.
  2. `authenticator` 롤이 `safeupdate` 확장을 써 WHERE 없는 DELETE를 거부
     (`DELETE requires a WHERE clause`) → `where true` 추가.
  3. `open_spaces.parking_id` 추가 직후 `ANALYZE` 전이라 플래너가 신규 부분
     인덱스를 안 쓰고 143,241건 Seq Scan(9.8초, 8초 statement_timeout에
     걸림) → `ANALYZE public.open_spaces;` 실행 후 인덱스 스캔으로 전환
     (6ms).

### 2. `scripts/ingest/parking-metadata.mjs` + 테스트(7개, 신규)
CSV 파싱(EUC-KR, Node 내장 `TextDecoder('euc-kr')` — 별도 iconv 라이브러리
불필요, 실측 확인) → 노상 전면 제외 → 좌표 없는 행 VWorld 지오코딩 백필 →
`parking_metadata` 전체교체(안정적 자연키 없음, Decision 033).
- `npm install csv-parse` 신규 의존성 추가(이 프로젝트 최초의 CSV 파싱
  라이브러리 — 따옴표 안에 쉼표/줄바꿈이 섞인 필드를 안전하게 다루기 위해
  직접 구현 대신 사용).

### 3. `scripts/ingest/match-parking-to-spots.mjs` + 테스트(9개, 신규)
부설 주차장 50m 반경 내 `open_spaces` 후보를 `find_busul_parking_candidates`
RPC로 찾고, 이름 유사도(정규화 + 2-gram) 0.5 이상인 것만 매칭 — parking_id
기준·spot_id 기준 양쪽 모두 "최선 하나만" 추리는 이중 dedup으로 진짜 1:1
보장. `open_spaces.parking_id`를 갱신.

### 4. 프런트엔드
- `src/lib/spaces/get-nearby.ts`: `NearbyParkingLot` 타입을 새 RPC 반환
  컬럼에 맞게 확장(`is_paid`→`fee_type` 등), `getMatchedParkingLot`(부설
  단건 조회)/`getSpotParkingId`(스팟의 parking_id만 가벼운 단독 조회,
  `get_nearby_spaces_and_events`는 건드리지 않음 — Decision 033) 신규.
- `src/components/map/nearby-amenities-section.tsx`: `ParkingCard`에
  탭하면 펼쳐지는 상세(요금/결제/특기사항/데이터기준일/다자녀할인/
  실시간현황) 추가, `MatchedParkingCard`/`SpotParkingBadge`(부설 전용,
  조회+렌더링 일체형) 신규.
- `src/components/map/detail-modal.tsx`: SPACE 분기에 `SpotParkingBadge`
  추가(parking_id 매칭 있을 때만 노출).

### 5. 정리
- `scripts/ingest/seoul-public-parking.mjs` + 테스트 삭제(parking-
  metadata.mjs로 대체).
- `scripts/ingest/lib/pipeline-agent-registry.mjs`: `SEOUL_PUBLIC_PARKING`
  제거, `PARKING_METADATA`/`PARKING_SPOT_MATCHING` 추가.
- `.github/workflows/ingest-monthly.yml`: 기존 "Seoul Public Parking Lots"
  스텝 제거(새 ingest는 API 자동호출이 아니라 사람이 CSV를 올려줄 때 쓰는
  수동 배치라 자동 워크플로에 넣지 않음 — 매달 같은 파일 재적재는 의미
  없음).
- `package.json`: `ingest:seoul-public-parking` → `ingest:parking-metadata`
  + `ingest:match-parking-to-spots`로 교체.
- `src/types/database.types.ts`: `npm run gen:types`로 재생성(parking_metadata/
  parking_id 반영).

## 검증
- `npx tsc --noEmit` / `npm run test -- --run`(317개 파일 3,207개 테스트) /
  `npm run build` 전부 통과.
- **실제 적재 실행**: `parking-metadata.mjs` → 18,939건 중 노상 4,962건
  제외, 13,977건 적재(VWorld 지오코딩 백필 443건 성공, 좌표 보유
  13,915/13,977). `match-parking-to-spots.mjs` → 888개 후보 쌍 중 222건
  매칭, `open_spaces.parking_id` 갱신.
- **좌표-주소 일치 재확인**: Decision 033 적용 후 전 레코드 재조회로 location
  not null 비율 및 FK 연결 상태 직접 확인.
- **라이브 REST 호출로 anon 키 읽기 권한 확인**(2026-10-02 seoul_public_
  parking_lots 때 이 정책을 빠뜨렸던 전례 재발 방지): `get_nearby_parking_
  lots` RPC와 `parking_metadata` 단건 조회 둘 다 anon 키로 정상 응답 확인
  (한글 데이터 인코딩도 Node로 직접 디코딩해 정상 확인 — curl 출력을
  `python3 -m json.tool`로 본 결과가 깨져 보였던 건 그 파이프 자체의 터미널
  인코딩 문제였을 뿐, 실제 DB/RPC/REST 응답은 전부 정상이었음을 재확인).

## 특이 사항
- CSV 3개(전국주차장정보표준데이터/서울시 다둥이 행복카드/경기도 마이데이터
  다자녀카드수혜정보)는 `metadata/` 폴더에 수동 배치된 원본으로, 이번
  커밋에 함께 포함한다(재현성 — 로컬/CI 어디서든 같은 입력으로 재실행
  가능하게).
- 개선사항2(서울시 실시간 주차대수)/개선사항3(다자녀 할인)이 쓸 컬럼은
  스키마만 미리 만들어뒀고 데이터는 비어 있다 — 각 개선사항 구현 때
  채운다.
