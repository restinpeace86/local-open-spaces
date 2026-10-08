// [문화센터 썸네일 재호스팅](2026-10-08 사용자 지시): "이미지 긁어오는거
// 우리 썸네일 규격이라던가 우리쪽 규격에 맞추는것도 하는거지?" — events와
// 동일한 패턴(event-thumbnails 버킷, resizeThumbnail 재사용, 제5장 제4조
// 기존 구조 우선)으로 culture_club_classes(롯데마트/현대백화점/신세계
// 아카데미)의 원천 이미지를 리사이징해 이 버킷에 재호스팅한다. 멱등 스크립트.
// 실행: node scripts/migrations/2026-10-08-create-culture-club-thumbnails-bucket.mjs
import { createAdminClient } from '../ingest/lib/supabase-admin.mjs';
import { loadEnv } from '../lib/load-env.mjs';

loadEnv();
const supabase = createAdminClient();

const BUCKET = 'culture-club-thumbnails';

const { data: existing } = await supabase.storage.getBucket(BUCKET);
if (existing) {
  console.log('버킷이 이미 존재합니다:', existing.name);
} else {
  // public: true — 화면이 <img src="공개URL">로 바로 노출한다(event-thumbnails와 동일한 근거).
  const { data, error } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: '5MB',
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  });
  console.log('생성 결과:', data, 'error:', error?.message);
}
