# 이벤트 설명글 감성 톤 재작성 (OpenAI → Gemini 폴백)

## 구현 대상
`todo.md` 개선사항 2 마지막 미완료 항목: "글 쓰는것도 기본 글과 설명있으면
이를 가지고 AI가 글쓰는것도 좋을 것 같아" + "전체적으로 감성적이고 부드러운
톤으로 하도록 변경하자."

사용자 확인 사항:
- 범위: "신규/인기 스팟부터 단계적으로"(전체 일괄 재작성 보류)
- 공개 방식: "생성되면 바로 공개"(관리자 검토 게이트 없음)
- LLM: "OpenAI(gpt-5-mini) 먼저 쓰고, 무료 비용 끝나면 Gemini로"

## 구현 일시
2026-10-21

## 범위를 EVENT로 한정한 이유 (실측 확인)
`detail-modal.tsx`를 실측 확인한 결과 `description`은 **EVENT 분기에만**
존재한다(`const description = isEvent ? item.description : null`) — SPACE
(스팟)는 애초에 description 필드나 노출 영역 자체가 없다. "기존 글 +
보여줄 자리"가 둘 다 있는 EVENT만 1차로 처리했다. SPACE까지 확장하려면
새 필드+새 노출 영역을 함께 만들어야 해서 범위가 더 커진다 — 필요하면
별도 지시로.

"인기" 판정은 이 앱에 조회수 등 별도 인기도 집계가 없어(기존
`popular-spots/route.ts` 주석에도 이미 "조회수 등 별도 인기도 집계가
없어(추측 금지)"라고 명시돼 있음) 그 파일이 이미 쓰는 대리 신호(맘스픽
리뷰 존재 여부)를 그대로 재사용했다(제5장 제4조 기존 구조 우선).

## 변경 사항
- `scripts/migrations/2026-10-21-events-ai-description.sql`(적용 완료):
  `events.ai_description` 컬럼 추가(nullable, 게이팅 없음 — events의 다른
  컬럼들도 이미 게이팅 없이 공개 조회되고 있어서).
- `src/lib/home/get-home-feed.ts`: `EVENT_COLUMNS`/`EventRow`/`toEventItem`
  에 `ai_description` 추가(home feed 전체 조회 경로가 전부 이 상수를
  공유해 한 곳만 고치면 됨).
- `src/lib/spaces/get-nearby.ts`: `NearbyItem.ai_description?: string | null`
  추가(스팟픽 지도/`/nearby` RPC 경로는 기존부터 description 자체를 안
  돌려줘서 이번에도 손대지 않음 — 기존 결함 확장이 아니라 현상 유지).
- `src/components/map/detail-modal.tsx`: `description = item.ai_description
  ?? item.description` — 재작성본이 있으면 우선, 없으면 기존 원본 그대로
  폴백.
- `scripts/ingest/lib/event-ai-description.mjs`(신규): 프롬프트 생성 +
  OpenAI(gpt-5-mini) 1차 시도 → 429(쿼터 소진)면 Gemini(gemini-flash-lite-
  latest)로 전환. `facility-classification.mjs`의 기존 Gemini 호출/재시도
  패턴을 그대로 재사용하고 OpenAI 호출만 새로 추가했다(이 프로젝트 첫
  OpenAI 연동 — 지금까지는 Gemini만 실제로 쓰이고 있었다, 실측 확인).
- `scripts/ingest/generate-event-ai-descriptions.mjs`(신규): 배치 스크립트.
  매 실행마다 최대 20건만 처리(인기 우선 → 최신순). `--dry-run` 지원.
  `write-back-naver-place-id.mjs`와 동일하게 env 체크/클라이언트 생성을
  `run()` 안에서 지연 수행해 테스트 가능하게 구조화.
- `src/types/database.types.ts`: `npm run gen:types`로 재생성(새 컬럼
  반영 — 직접 SQL로 컬럼을 추가하면 이 타입 파일이 갱신되지 않아 전체
  타입 체크가 깨지는 것을 실측으로 발견, 재생성으로 해결).

## 실측으로 발견/수정한 버그 2건
1. **`.in('event_id', eventIds)` URL 길이 초과**: 처음엔 popular-spots
   패턴처럼 후보 ID 목록으로 맘스픽 리뷰를 필터링했는데, 실제 후보가
   2,009건이라 요청 URL이 너무 길어져 즉시 "Bad Request"로 실패했다
   (실측 확인 — dry-run 1차 시도에서 바로 재현됨). mom_pick_posts의
   event_id 보유 행이 현재 0건이라(실측 확인) ID 필터링 없이 테이블
   전체를 가져와 JS에서 교집합을 구하는 방식으로 변경.
2. **PostgREST 1,000건 묵시적 상한**: `.range()` 없이 조회해 실제
   2,009건인데 1,000건만 가져오는 것을 실측으로 확인(이 프로젝트에서
   반복적으로 발견된 동일 패턴). `.range()` 페이지네이션 추가로 수정,
   재실행으로 2,009건 전부 확인됨을 재검증.

## 검증
- `npx tsc --noEmit` / `npm run test -- --run`(339 파일 3,376개, 신규
  18개 포함) / `npm run build` 전부 통과.
- **실제 운영 DB 대상 실행(2026-10-21)**: `--dry-run`으로 먼저 전체
  파이프라인 확인(쿼리 버그 2건을 이 과정에서 발견/수정) → 수정 후 실제
  실행(`node scripts/ingest/generate-event-ai-descriptions.mjs`)으로
  20건 전부 성공, DB에 직접 `select`로 반영 결과 확인.
- OpenAI는 OPENAI_API_KEY가 아직 설정되지 않아(사용자가 추후 등록 필요)
  이번 실행은 전부 Gemini 경로로 처리됐다 — OpenAI 경로(1차 시도) 자체는
  유닛 테스트(mock)로만 검증했고, 실제 OpenAI API 응답 형식과 100% 일치
  하는지는 키 등록 후 실제 호출로 재검증이 필요하다.

## 특이 사항
- **OPENAI_API_KEY 미등록**: `.env.local`에 아직 없다 — 등록 전까지는
  자동으로 Gemini만 사용한다(경고 로그 출력). 등록하면 재배포/재실행 시
  자동으로 OpenAI 우선 시도로 전환된다.
- **생성 품질 관찰**: 서울시 공공예약 특유의 건조한 "유의사항" 나열형
  설명은 Gemini(flash-lite, 저비용 모델)가 큰 톤 변화 없이 다듬는 수준에
  그치는 경우가 있었다(실측 확인 — 신도림테니스장 예시). 서사형 설명은
  더 뚜렷하게 감성적으로 바뀌었다. 프롬프트/모델 튜닝은 실제 생성 결과를
  더 모아본 뒤 반복 개선하는 게 합리적이라고 판단해 이번엔 추가로
  손대지 않았다.
- 관리자 검토 게이트가 없어(사용자 선택) 품질이 낮은 결과가 바로
  공개될 수 있다 — 필요해지면 `spot_curations.image_url`처럼
  `is_active` 유사 게이팅을 추가하는 것도 가능하다(이번엔 범위 밖).
- 스케줄링(매일 자동 실행 여부)은 아직 설정하지 않았다 — 수동
  트리거(`node scripts/ingest/generate-event-ai-descriptions.mjs`)만
  가능한 상태. 비용/품질을 좀 더 지켜본 뒤 GitHub Actions나 로컬
  작업 스케줄러에 등록하는 걸 제안한다.
