// [개발 종합 요청] 스팟픽 MVP 스마트 폴백, 관리자 큐레이션 및 배치 안정화 고도화(2026-09-01)
// 섹션 2: 관리자가 클립보드(Ctrl+V)로 붙여넣는 스팟 대표 이미지를 저장할 Supabase Storage
// 버킷을 생성한다. SQL 마이그레이션이 아니라 Supabase JS 클라이언트의 storage API를
// 쓴다(Storage 버킷 생성은 REST/JS SDK 경유가 표준 방식). 이미 존재하면 아무 것도 하지
// 않는 멱등 스크립트 — 실행: node scripts/migrations/2026-09-01-create-spot-curation-images-bucket.mjs
import { createAdminClient } from '../ingest/lib/supabase-admin.mjs';
import { loadEnv } from '../lib/load-env.mjs';

loadEnv();
const supabase = createAdminClient();

const BUCKET = 'spot-curation-images';

const { data: existing } = await supabase.storage.getBucket(BUCKET);
if (existing) {
  console.log('버킷이 이미 존재합니다:', existing.name);
} else {
  // public: true — 어드민이 업로드한 이미지를 홈/스팟픽 화면에 <img src="공개URL">로
  // 바로 노출해야 하므로(next.config.ts의 remotePatterns가 이미 `*.supabase.co/storage/
  // v1/object/public/**`를 허용해 뒀다 — 애초에 이 용도를 예상해 둔 설정으로 보인다).
  const { data, error } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: '5MB',
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  });
  console.log('생성 결과:', data, 'error:', error?.message);
}
