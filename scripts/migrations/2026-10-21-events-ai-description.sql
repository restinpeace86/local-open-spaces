-- [설명글 감성 톤 재작성](2026-10-21 todo.md 개선사항2 사용자 지시): "글 쓰는것도
-- 기본 글과 설명있으면 이를 가지고 AI가 글쓰는것도 좋을 것 같아" + "전체적으로
-- 감성적이고 부드러운 톤으로". 사용자 확인 결과 "신규/인기 스팟부터 단계적으로"로
-- 범위를 좁혔다 — 전체 일괄 재작성이 아니라 배치 스크립트가 매 실행마다 소수씩
-- 처리한다(generate-event-ai-descriptions.mjs 참고).
--
-- [EVENT 한정, SPACE는 후속]: events.description은 이미 존재하고(get-home-feed.ts
-- EVENT_COLUMNS) detail-modal.tsx가 이미 그 설명을 노출하는 화면(이벤트 상세)이
-- 있다 — "기존 글 + 보여줄 자리"가 둘 다 있는 쪽만 1차로 처리한다. SPACE(스팟)는
-- 애초에 description 필드/노출 영역 자체가 없어(실측 확인) 이번 범위에 포함하지
-- 않았다 — 필요하면 별도 지시로 진행.
--
-- is_active 같은 게이팅 컬럼을 두지 않는다 — spot_curations와 달리 events는 이미
-- description 등 다른 컬럼들도 게이팅 없이 공개 조회되고 있어(EVENT_COLUMNS가
-- anon 공개 조회에 그대로 쓰임), 이 컬럼만 별도로 숨길 이유가 없다. null이면
-- (아직 생성 전) detail-modal.tsx가 기존 description으로 그대로 폴백한다.
alter table public.events add column if not exists ai_description text;

comment on column public.events.ai_description is '감성적인 톤으로 재작성된 설명(AI 생성, OpenAI/Gemini). null이면 아직 생성 전 — 원본 description으로 폴백.';
