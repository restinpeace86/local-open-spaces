// [관리자 화면 — 노출 중분류 미지정 + 맘스픽 글 있음 우선순위 큐](2026-09-13 사용자
// 지시): route.ts(서버 전용)와 mom-pick-unmapped-spots-panel.tsx(클라이언트 컴포넌트)가
// 공유하는 응답 타입 — route.ts 파일은 Next.js 특수 파일이라 클라이언트 컴포넌트가
// 거기서 직접 타입을 임포트하지 않도록 별도 lib로 뺀다.
export type MomPickUnmappedSpotPost = {
  id: string;
  post_type: 'micro_review' | 'checklist' | 'survey_review';
  rating: number | null;
  content: string | null;
  created_at: string;
  author_nickname: string | null;
};

export type MomPickUnmappedSpot = {
  id: string;
  name: string;
  address: string | null;
  category_min: string | null;
  sigungu_name: string | null;
  service_category_id: string | null;
  posts: MomPickUnmappedSpotPost[];
  curatedBlogUrls: string[];
};
