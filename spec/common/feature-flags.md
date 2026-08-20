# 피처 플래그 관리 스펙 (spec/common/feature-flags.md)

## 1. 개요

본 문서는 프로젝트 의사결정(Decision 003)에 따라, 선제적으로 작성된 미승인/미오픈 확장 기능(예: 고급 소셜 공유, 맞춤 알림 구독, 마이페이지 저장소 등)을 운영 환경에서 안전하게 비활성화(`Disabled/Hidden`) 처리하기 위한 Feature Flag 관리 원칙을 정의한다.

---

## 2. 적용 원칙

1. **코드 레벨 선제 구현 허용:**
   - 확장 기능의 컴포넌트나 API 연동 골격 코드는 개발 효율성을 위해 미리 작성하는 것을 허용한다.
2. **UI 노출 원천 차단 (Hiding):**
   - 기획 및 승인이 완료되지 않은 기능은 빌드 타임 환경변수(`NEXT_PUBLIC_ENABLE_...`) 또는 공통 Feature Flag 관리 유틸리티를 통해 사용자 화면(UI)에 절대 노출되지 않도록 처리해야 한다.
3. **토글 온(Toggle On) 방식:**
   - 추후 기능 승인 및 오픈 결정이 내려지면 코드 수정 없이 환경변수 플래그 값을 활성화(`true`)하는 것만으로 즉시 서비스에 반영될 수 있어야 한다.

---

## 3. 구현 방식 예시

```typescript
// 예시: Feature Flag 유틸리티 또는 컴포넌트 제어
export const FEATURE_FLAGS = {
  ENABLE_USER_BOOKMARK: process.env.NEXT_PUBLIC_ENABLE_USER_BOOKMARK === 'true',
  ENABLE_AI_CHATBOT: process.env.NEXT_PUBLIC_ENABLE_AI_CHATBOT === 'true',
};

// 컴포넌트 내부 사용 예시
{FEATURE_FLAGS.ENABLE_USER_BOOKMARK && <BookmarkButton/>}
```

## Parental UX & Scale Optimization Flags (Decision 008)
- `PARENTAL_QUICK_FILTERS`: ENABLED — 키즈/무료/오늘·주말 Quick 필터 (`spec/common/search.md` 2.4)
- `AI_CARD_BADGES`: ENABLED — 공간/이벤트 카드의 Parental Checkpoint 뱃지 (`spec/space/space-card.md`, `spec/event/event-card.md`)
- `WIDE_RADIUS_EXPANSION`: ENABLED — 20km/30km 조건부 광역 반경 (`spec/common/search.md` 2.2)
