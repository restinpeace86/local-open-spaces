# 데이터 파이프라인 GitHub Actions 스케줄링 구성

## 구현 대상
- `spec/data/data_sources.md` 수집 주기(공간형 월 1회 / 행사형 매일 1회)에 맞춘 GitHub Actions 워크플로
- Source #02(체육시설)는 서울시 서버 장애로 Skip 확정 (사용자 확인)

## 구현 일시
2026-08-20

## 변경 사항
- `.github/workflows/ingest-monthly.yml`: 매월 1일 실행(`cron: '0 0 1 * *'`, UTC 00:00 = KST 09:00). Source #01(전국 도시공원), #03(문화공간 정보) 순차 실행. Source #02는 서울시 서버 장애로 스텝 미포함(주석으로 사유 명시)
- `.github/workflows/ingest-daily.yml`: 매일 두 시각(UTC 18:00/18:30 = KST 03:00/03:30) 실행. `github.event.schedule` 값으로 어떤 cron이 트리거했는지 판별해 Source #04(공공서비스예약)와 #05(문화행사)를 각각 다른 job으로 분리 실행. `workflow_dispatch`로 수동 실행도 가능
- `package.json`에 `ingest:*` 스크립트 5종 추가 (city-parks, cultural-spaces, public-reservation, culture-events, tour-festival) — 로컬에서 개별 소스 수동 재실행 시 사용
- Source #02 상태를 "보류"에서 "Skip/Mock"으로 전환. 사용자가 공식 문서 원문 URL로 재확인한 서비스명(`ListPublicSportsFacility`)으로도 `/json/`, `/xml/` 두 방식 모두 `ERROR-500`이 지속되어 서비스명 문제가 아닌 서울시 서버 장애로 결론

## 검증 결과
- `npx tsc --noEmit` / `npm run test` / `npm run build`: 모두 통과
- GitHub Actions 워크플로 자체는 실제 스케줄 트리거(cron)로는 아직 검증하지 못함 — `workflow_dispatch` 수동 실행으로 최초 검증 필요

## 특이 사항
- **GitHub 저장소 Secrets 미등록 상태**: 이 환경에 `gh` CLI가 설치되어 있지 않아 리포지토리 Secrets를 자동으로 등록하지 못함. 워크플로가 실제로 동작하려면 GitHub 저장소 Settings > Secrets and variables > Actions에서 다음 4개를 수동 등록해야 함:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `PUBLIC_DATA_API_KEY`
  - `SEOUL_OPEN_DATA_KEY`
- 월간 크론 시각은 정확한 KST 03:00 대신 KST 09:00(같은 날짜, 다른 시각)으로 근사함 — GitHub Actions cron이 UTC 기준이고 "매월 1일"을 KST 정각(00:00~14:59 UTC 범위)으로 맞추면 자동으로 날짜가 밀리지 않기 때문. 월 1회 배치 작업의 특성상 몇 시간 차이는 서비스에 영향 없음
- Source #02는 코드(가짜/목 데이터)를 만들지 않고 워크플로에서 완전히 제외하는 방식으로 "Skip" 처리함 (추측 데이터 생성 금지 원칙 준수)
