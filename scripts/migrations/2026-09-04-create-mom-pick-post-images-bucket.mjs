// [Decision 020](2026-09-04) / spec/community/mom-pick-grades.md 2.1: [설문형 스마트
// 리뷰 폼] 3단계 사진 업로드용 Supabase Storage 버킷을 생성한다.
// `spot-curation-images`(2026-09-01)와 동일한 패턴 그대로 재사용한다(제5장 제4조
// 기존 구조 우선) — SQL이 아니라 Storage JS API로 생성하고, 이미 존재하면 아무 것도
// 하지 않는 멱등 스크립트다.
// 실행: node scripts/migrations/2026-09-04-create-mom-pick-post-images-bucket.mjs
import { createAdminClient } from '../ingest/lib/supabase-admin.mjs';
import { loadEnv } from '../lib/load-env.mjs';

loadEnv();
const supabase = createAdminClient();

const BUCKET = 'mom-pick-post-images';

const { data: existing } = await supabase.storage.getBucket(BUCKET);
if (existing) {
  console.log('버킷이 이미 존재합니다:', existing.name);
} else {
  // public: true — 후기 사진은 커뮤니티 피드/마이페이지에 <img src="공개URL">로 바로
  // 노출해야 한다(spot-curation-images와 동일한 근거, next.config.ts의 remotePatterns가
  // 이미 이 Supabase 프로젝트의 공개 스토리지 경로 전체를 허용해 둠).
  const { data, error } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: '5MB',
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  });
  console.log('생성 결과:', data, 'error:', error?.message);
}
