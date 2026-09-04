import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// [Decision 020](2026-09-04) / spec/community/mom-pick-grades.md 2.1: [설문형 스마트
// 리뷰 폼] 3단계 사진 업로드. `/api/admin/spot-curations/upload-image`(2026-09-01)와
// 동일한 패턴(무작위 파일명, Supabase Storage 공개 버킷)을 재사용하되(제5장 제4조),
// 이 라우트는 관리자 전용이 아니라 로그인한 아무 사용자나 호출할 수 있어 먼저 서버
// 세션으로 로그인 여부를 확인한다 — 그 다음 실제 업로드는 service_role로 수행한다
// (이 프로젝트의 Storage 버킷들은 아직 authenticated 역할 쓰기 정책이 없다).
const BUCKET = 'mom-pick-post-images';
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB, 버킷 fileSizeLimit과 동일
const ALLOWED_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: '이미지 파일(file)이 필요합니다.' }, { status: 400 });
    }
    const extension = ALLOWED_TYPES[file.type];
    if (!extension) {
      return NextResponse.json({ error: `지원하지 않는 이미지 형식입니다: ${file.type}` }, { status: 400 });
    }
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: '이미지 용량은 5MB를 넘을 수 없습니다.' }, { status: 400 });
    }

    const admin = createAdminClient();
    const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, buffer, {
      contentType: file.type,
      upsert: false,
    });
    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: publicUrlData } = admin.storage.from(BUCKET).getPublicUrl(path);
    return NextResponse.json({ url: publicUrlData.publicUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : '이미지 업로드 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
