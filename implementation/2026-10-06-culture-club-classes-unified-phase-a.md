# 문화센터 통합 테이블 — Phase A (무손상 생성 + 데이터 복사)

## 구현 대상
`project/decision-log.md` Decision 028: 이마트/롯데마트(+추후 AK플라자/
신세계/현대백화점, 최소 5개 브랜드 확정)의 문화센터 강좌 데이터를 `brand`
컬럼으로 구분하는 단일 테이블 `culture_club_classes`로 통합한다. 전체
작업을 4단계로 나눴고, 이번 커밋은 **1단계(무손상 생성 + 데이터 복사)만**
수행한다 — 기존 테이블/코드는 전혀 건드리지 않는다.

## 변경 사항
- `scripts/migrations/2026-10-06-culture-club-classes-unified.sql`(적용
  완료): `culture_club_classes` 신규 테이블.
  - 공통 정규화 컬럼은 실제 타입 컬럼(`min_age_months`/`schedule_start_
    date`/`normalized_status`/`instructor_name` 등, 2026-10-06 개선사항
    2·3·5에서 이미 만든 것).
  - 브랜드 전용 필드(이마트 `channel_online`/`occupied_full_flag`, 롯데마트
    `like_count`/`discount_badge_text` 등)는 `raw_extra jsonb`로.
  - `raw_status`(브랜드 네이티브 상태 원문, 예: 이마트 `filter_status`
    3버킷/롯데마트 `registration_status` 6상태) — 찜 상태감시의 "바뀌었는지"
    비교와 브랜드별 분기에 필요해 공통 컬럼으로 뒀다.
  - `register_start_at`(예약 오픈 알림 일반화 — 현재는 이마트만 값 있음).
  - `UNIQUE(brand, source_class_id)`로 멱등 upsert 지원.
- `scripts/migrations/2026-10-06-backfill-culture-club-classes-unified.mjs`
  (신규, 1회성): 기존 두 테이블의 모든 행을 `culture_club_classes`로 복사.
  id 커서 페이지네이션 + `upsert(onConflict: 'brand,source_class_id')`로
  멱등 실행.

## 검증
- `--dry-run`으로 스캔 건수 확인(이마트 6,532 / 롯데마트 15,129 — 기존
  테이블 전체 건수와 일치).
- 실제 복사 실행 후 `culture_club_classes` 행 수가 6,532+15,129=21,661건과
  일치하는지 확인(결과는 후속 기록에 남김).

## 특이 사항 — 남은 단계
1. **(이번 커밋)** 신규 테이블 생성 + 데이터 복사.
2. 신규 테이블 기반 코드 경로(수집 스크립트의 upsert 대상, 찜
   `user_bookmarks.culture_club_class_id`로 통합, 상태감시 스크립트를
   브랜드 분기형 단일 스크립트로 재구성, 관리자 패널/프론트엔드 조회 API)를
   테스트로 검증.
3. 수집/조회/찜 코드를 한 번에 전환(컷오버) — 기존 두 테이블은 이 시점부터
   더 이상 갱신되지 않는다.
4. 안정화 확인 후 기존 테이블 정리(삭제 또는 보관).
- 수집(ingest) 스크립트의 브랜드별 독립성(한 브랜드 수집 실패가 다른
  브랜드에 연쇄 영향을 주지 않음)은 2단계에서도 그대로 유지한다 — 각
  브랜드 스크립트/스케줄은 계속 별도 프로세스로 남고, 쓰기 대상 테이블만
  바뀐다(사용자 명시 요구사항).
