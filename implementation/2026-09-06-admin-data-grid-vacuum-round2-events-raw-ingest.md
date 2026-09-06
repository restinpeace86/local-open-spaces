# /admin/data-grid 재차 지연 — events/raw_ingest_data도 동일 조치 확장

## 구현 대상
사용자 지시: "또 관리자 화면 오래걸리는데? 왜이러지? 오래걸리는 이유 분석해줘
어제 배큠 청소하지않았어?"

## 구현 일시
2026-09-06

## 실측으로 확인 — 어제 조치의 재발이 아니라 다른 두 테이블의 신규 발생
`open_spaces`는 여전히 건강했다(dead tuple 0.72%, 8개 RPC 전부 타임아웃 없이
완료) — 어제 조치가 풀린 게 아니다. 대신 어제는 "문제없다"고 판단해 손대지
않았던 **다른 두 테이블**이 정확히 같은 패턴으로 새로 문제가 됐다:

```
events:           dead 15.28%(4,846/26,874) — 기본 임계값(20%)에 근접
raw_ingest_data:  dead 12.37%(25,940/183,742) — 계속 상승 중
```

두 테이블 다 `last_autovacuum`이 어제 저녁(2026-09-05 19~20시, 일일 배치 수집
직후로 추정)이지만 그 이후에도 쓰기가 계속 쌓여 다시 기본 임계값(20%)에
다가가고 있었다. `get_events_filter_options`(3.6초), `get_raw_ingest_data_
filter_options`(2.4초) RPC가 유독 느려진 것과 정확히 일치 — 아직 8초
statement_timeout에는 안 걸렸지만(그래서 어제처럼 완전히 멈추진 않음)
체감상 눈에 띄게 느려지는 중간 단계였다.

## 조치
`scripts/migrations/2026-09-06-events-raw-ingest-vacuum-and-autovacuum-tuning.sql`
(적용 완료, VACUUM은 트랜잭션 안에서 실행 불가해 각 문장을 개별 호출):

1. `VACUUM (ANALYZE) public.events;` / `VACUUM (ANALYZE) public.raw_ingest_data;`
   — 즉시 visibility map/통계 갱신.
2. 두 테이블 모두 `autovacuum_vacuum_scale_factor`/`autovacuum_analyze_scale_
   factor`를 기본 20%/10%에서 **5%**로 낮춤 — 어제 `open_spaces`에 적용한 것과
   동일한 조치. 하나씩 터질 때마다 반응하는 대신, 일일/월간 배치 수집 대상이자
   admin 필터 옵션 RPC가 매번 전체 스캔하는 세 테이블(open_spaces/events/
   raw_ingest_data) 전부를 이번에 한 번에 정리했다.

## 검증 (실측 전/후 비교)
- VACUUM 직후: `events` dead tuple 15.28% → 0%, `raw_ingest_data` 12.37% → 0%.
- 8개 RPC 재측정(안정화 후): 전부 600ms 이하로 완료(`get_events_filter_options`
  524ms, `get_raw_ingest_data_filter_options` 156ms) — 최초 재측정 시
  `get_events_filter_options`가 일시적으로 7.1초로 튄 적이 있었는데, VACUUM/
  ANALYZE 직후의 일시적 잡음으로 보고 재확인했다(연속 3회 재호출 시 460~640ms로
  안정) — 단발성 노이즈였음을 실측으로 확인한 뒤에만 "해결"로 판단했다.
- `curl`로 `/admin/data-grid` 실제 페이지 종단간 확인: 웜 요청 0.7초.

## 특이 사항
- 어제 기록에 "다른 테이블은 이번에 문제없어서 기본값 뒀다"고 남겼던 판단은,
  "지금 당장 문제없다"는 뜻이었지 "앞으로도 안전하다"는 뜻은 아니었다 —
  세 테이블 모두 똑같이 매일 밤 배치 수집으로 대량 쓰기가 발생하는 성격이라
  결국 순서대로 같은 임계값에 도달할 운명이었다. 이번엔 재발 시 하나씩 대응하는
  대신 세 테이블 모두를 한 번에 낮은 임계값으로 맞춰, 이 클래스의 문제가
  다시 개별적으로 재발하지 않도록 정리했다.
- 이 admin 필터 옵션 RPC들(get_*_filter_options, get_category_min_options)
  자체가 "배치로 쓰기가 잦은 테이블을 매번 전체 스캔"하는 구조라 근본적으로
  visibility map 신선도에 민감하다 — 앞으로 새로 추가되는 배치 대상 테이블이
  같은 RPC 패턴에 쓰인다면, 처음부터 이 낮은 autovacuum 임계값을 적용하는 것을
  기본으로 고려할 만하다(다만 이번 범위에서 별도 정책 문서화는 하지 않음 —
  필요하면 다음에 다시 겪을 때 검토).
