## 🚨 자율 실행 및 작업 진행 지침 (Strict Execution Rules)

1. **GitHub `todo.md` 기반 작업 수행**: 본 문서에 명시된 Task 목록과 세부 작업 지시를 최우선 가이드라인으로 삼아 순차적으로 작업을 진행한다.
2. **충돌 발생 시 즉시 스킵 (Skip on Conflict)**:
   - 기존 Spec 문서 (`spec/`), Decision Log (`project/decision-log.md`), 또는 기존 모듈과 구조적/논리적 충돌이 발생하는 경우, 절대로 무리하게 코드를 수정하지 말고 즉시 **[스킵 (보류)]** 처리한다.
3. **스킵 처리 시 필수 기록 사항**:
   - 충돌로 인해 작업을 스킵할 경우, 해당 Task 하단에 **① 상세 스킵 사유**를 명확히 기록한다.
   - 해당 Task를 재개하기 위해 **② 선행되어야 할 작업**(예: 신규 Decision 기록 필요, Spec 문서 선행 수정 필요 등)을 구체적인 가이드로 명시한다.
4. **원격 문서 갱신 반영 및 동기화**:
   - 원격 저장소의 `project/decision-log.md` (Decision 010) 및 `spec/map/spatial-search.md` (2.2 레이어 분리) 변경 내역을 확인하고, 충돌이 해소된 상태에서 안전하게 다음 Task를 진행한다.
5. **결과 업데이트 및 정합성 유지**:
   - 작업 완료 시 관련 테스트/빌드를 검증하고 `todo.md` 내 체크박스(`[x]`) 및 진행 상태를 최신화한다.

---

## ⏸️ 보류 중인 브랜드 (Hold)

- **롯데백화점 문화센터 수집 — 보류(2026-10-13)**: WAF 차단이 사용자
  로컬 PC에서도 확인됨(사용자 직접 지시 "일단 롯데백화점은 멈춰"). 자세한
  배경/재개 방법은 `project/decision-log.md` Decision 031 참고. **이
  브랜드의 반복 실패/수집 중단을 임의로 "고쳐야 할 버그"로 판단해 재시도
  로직을 추가하거나 작업 스케줄러를 다시 켜지 말 것** — Decision 031에
  명시된 재개 조건(우회 방안 마련 또는 차단 해제 확인) 전까지는 보류
  상태를 유지한다.

---


[개선사항 1] [완료 — 2026-10-20, implementation/2026-10-20-emart-culture-club-batch-error-diagnosis.md
참고. 원인 2가지 확인: ①toIntOrNull()이 소수 문자열("46.2")을 반올림 없이 그대로 integer
컬럼에 넣어 upsert 실패 → Math.round() 추가로 수정. ②이마트 Elasticsearch 백엔드가 가끔
일시적 Bad Request를 냄(실측 재현 — 같은 쿼리 재시도하면 성공) → 기존 재시도 유틸에
이 에러 패턴 추가. 다음 로컬 스케줄러 실행(매일 09:00)부터 적용] 이마트 컬쳐클럽 배치
수집 계속 에러나고 있는데 원인확인해줘. 원인 확인 및 조치 방법까지 알려줘

[개선사항 2] [부분 진행중 — 2026-10-20] 범위가 매우 커서 하위 항목별로
쪼개 순차 진행 중. 완료분:
  - [완료] "ai 컨시어지 챗봇 버튼 제외" → implementation/2026-10-20-remove-ai-chat-fab-eventpick-spotpick.md
    (이벤트픽/스팟픽에서 AiChatFab 제거, 맘스픽은 지시대로 홀딩해 손대지 않음)
  - [완료] "뱃지영역 넓히고 뱃지별 한 줄씩 감성적인 글" → implementation/2026-10-20-spot-badge-area-one-liner-copy.md
    (badge-copy.ts 사전 + 2열 카드형 뱃지 영역. 주의/경고성 뱃지는 의도적 제외)
  - [완료] "주변 주차장/식당 아코디언 → 하나의 영역으로" → implementation/2026-10-20-nearby-amenities-accordion-removed.md
    (클릭 토글 전부 제거, 항상 펼쳐진 평면 섹션)
  - [완료] "블로그 1/2/3 → 제목 몇자 나오게" → implementation/2026-10-20-blog-review-title-display.md
    (blog-title.ts가 URL fetch해 title 추출, 캐싱 포함)
  - [완료] "가격/실내외 확실히 나오고" 중 실내외 부분 → implementation/2026-10-20-space-facility-type-badge-gap-fix.md
    (facility_type 뱃지가 EVENT에만 있던 결함 수정. 가격은 기존에 이미 조건부 노출 중)
  - [완료] "이미지 없으면 AI로 생성" → implementation/2026-10-20-category-image-placeholder.md
    (사용자 확인 결과 실시간 생성 대신 "단일 카테고리별 기본 플레이스홀더"로 범위 축소)
  - [완료] "상세페이지 80% → 100%" + "각 영역 상단 고정" + "모바일 퍼스트 점검"
    → implementation/2026-10-20-detail-page-fullscreen-sticky-header.md
    (모바일 기준 h-[100dvh] 풀페이지 전환, 스크롤 중 이름을 보여주는 sticky
    헤더 바 추가. "각 영역마다 별도 헤더"가 아니라 "페이지 전체에 하나의
    지속 식별 바"로 해석 범위를 좁혔음 — 다단 그룹 헤더를 원하면 재지시
    필요. 데스크톱은 기존 중앙 모달 유지. Playwright로 실제 화면 확인)

  - [완료] nadrilab.com 벤치마킹 "제안" → implementation/2026-10-21-nadrilab-benchmark-analysis.md
    (실측 비교표 + 벤치마킹할 만한 것 3가지 제안만 기록, 구현 안 함 —
    "감성적인 글"/"뱃지 한줄문구"는 nadrilab 패턴이 아니라 사용자 직접
    지시였다는 점을 명확히 구분)

  - [완료] "글 쓰는것도... AI가 글쓰는것도" + "전체적으로 감성적이고 부드러운
    톤으로" → implementation/2026-10-21-event-description-ai-rewrite.md
    (EVENT 한정 — SPACE는 description 노출 영역 자체가 없어 실측 확인 후
    제외. OpenAI(gpt-5-mini) 1차 → Gemini 폴백, 인기(맘스픽 리뷰)/최신순
    우선 매 실행 20건씩. 실제 DB 대상 실행해 20건 성공 확인, 과정에서
    실측 버그 2건(URL 길이 초과, PostgREST 1,000건 상한) 발견·수정.
    OPENAI_API_KEY 미등록 상태라 이번엔 전부 Gemini 경로로 처리됨 — 키
    등록 전까지는 계속 Gemini만 사용)

  개선사항2 전체 완료. 아래만 사용자 지시로 범위 밖:
  - [보류, 2026-10-20 사용자 지시 "불명확해서 보류한거 빼고"] "가격/실내외...
    추천쪽에 할수있게" — 어떤 추천 기능(AI 챗봇 추천? 메인 피드?)을
    가리키는지 불명확해 범위에서 제외됨.
  - 맘스픽은 전체 범위에서 계속 홀딩 유지(사용자 지시).

https://www.nadrilab.com/places/%EA%B2%BD%EA%B8%B0-%ED%95%98%EB%82%A8%EC%8B%9C-%EB%AC%B4%EC%9D%B8%ED%82%A4%EC%A6%88%EC%B9%B4%ED%8E%98-%EC%9A%B0%EB%A6%AC%EB%81%BC%EB%A6%AC-%EC%8A%A4%ED%8F%AC%EC%B8%A0%EB%A7%88%EC%9D%84-%EB%AF%B8%EC%82%AC%EC%97%AD%EC%A0%90--14e5fe40-44f9-42c5-af67-c14c82b62a33
