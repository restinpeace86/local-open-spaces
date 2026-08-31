import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// [개발 종합 요청] 스팟픽 MVP 스마트 폴백, 관리자 큐레이션 및 배치 안정화 고도화(2026-09-01)
// 섹션 2 "클립보드 이미지 Ctrl+V 바로 업로드": 브라우저 clipboard 이벤트에서 얻은 이미지
// Blob을 그대로 FormData로 받아 Supabase Storage(spot-curation-images, public 버킷)에
// 올리고 공개 URL을 반환한다. 파일 자체의 이름은 신뢰하지 않고(사용자 입력) 서버에서
// 무작위 파일명을 생성한다.
const BUCKET = 'spot-curation-images';
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB, 버킷 fileSizeLimit과 동일하게 맞춘 방어적 체크
const ALLOWED_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export async function POST(request: NextRequest) {
  try {
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
    const path = `${crypto.randomUUID()}.${extension}`;
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
