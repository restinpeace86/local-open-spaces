import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isToday } from '@/lib/ai-chat/date-resolver';
import { buildWeatherReactionText, recommendMode, resolveWeatherSnapshot } from '@/lib/ai-chat/weather-reaction';

// [스팟픽 AI 맞춤 추천 챗봇 엔진](2026-09-01 사용자 지시) 5단계(Weather & Air): 인터뷰
// 진행 중 딱 한 번 호출되는 날씨/대기질 조회 엔드포인트. LLM을 전혀 쓰지 않는다(요구사항
// 2-①) — DB 조회 + 템플릿 조합만 한다.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { isoDate, hour, lat, lng } = body as { isoDate?: string; hour?: number; lat?: number; lng?: number };

    if (!isoDate || typeof hour !== 'number' || typeof lat !== 'number' || typeof lng !== 'number') {
      return NextResponse.json({ error: '필수 파라미터(isoDate, hour, lat, lng)가 없습니다.' }, { status: 400 });
    }

    const today = isToday(isoDate);
    let nearestWeatherRow = null;

    if (today) {
      const supabase = await createClient();
      const { data, error } = await supabase.rpc('get_nearest_spot_weather', {
        user_lng: lng,
        user_lat: lat,
      });
      if (error) throw new Error(`날씨 조회 실패: ${error.message}`);
      nearestWeatherRow = data?.[0] ?? null;
    }

    const snapshot = await resolveWeatherSnapshot(isoDate, hour, lat, lng, nearestWeatherRow);
    const reactionText = buildWeatherReactionText(snapshot, isoDate, today);

    return NextResponse.json({ snapshot, reactionText, recommendedMode: recommendMode(snapshot) });
  } catch (err) {
    const message = err instanceof Error ? err.message : '날씨 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
