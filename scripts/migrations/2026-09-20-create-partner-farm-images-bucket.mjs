// [나드리픽 파트너 PMS — 온보딩 페이지](2026-09-20 사용자 지시): 농장 대표 이미지
// 업로드용 Supabase Storage 버킷 — `spot-curation-images`/`mom-pick-post-images`와
// 동일한 패턴(제5장 제4조 기존 구조 우선), 멱등 스크립트.
// 실행: node scripts/migrations/2026-09-20-create-partner-farm-images-bucket.mjs
import { createAdminClient } from '../ingest/lib/supabase-admin.mjs';
import { loadEnv } from '../lib/load-env.mjs';

loadEnv();
const supabase = createAdminClient();

const BUCKET = 'partner-farm-images';

const { data: existing } = await supabase.storage.getBucket(BUCKET);
if (existing) {
  console.log('버킷이 이미 존재합니다:', existing.name);
} else {
  // public: true — 농장 대표 이미지는 파트너 대시보드/향후 메인 플랫폼 스팟 상세에도
  // <img src="공개URL">로 바로 노출해야 한다(기존 두 버킷과 동일한 근거).
  const { data, error } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: '5MB',
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  });
  console.log('생성 결과:', data, 'error:', error?.message);
}
