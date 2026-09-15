import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getKstHour, resolveThisSaturday, resolveThisSunday, resolveWhenChoice } from '@/lib/ai-chat/date-resolver';
import { buildWeekendOneLiner, buildWidgetGuideMessage, resolveWeatherSnapshot, WeatherSnapshot } from '@/lib/ai-chat/weather-reaction';

// [상단 날씨 위젯 및 실시간·주말 날씨 바텀시트](2026-09-15 사용자 지시,
// implementation/todo.md [개선사항 7]): "챗봇 백엔드에서 이미 수집 중인 '오늘 실시간
// 기상 데이터'와 '이번 주말 예보 데이터'를 프론트엔드 UI에 안정적으로 녹여내는 작업" —
// 실제로 조사해보니 이 데이터는 이미 챗봇 인터뷰 엔진(resolveWeatherSnapshot,
// get_nearest_spot_weather RPC, kma-forecast.ts)이 전부 구현해 두고 있었다. 챗봇 전용
// POST 라우트(/api/ai-chat/weather, isoDate/hour를 인터뷰 단계에서 받음)를 그대로
// 재사용하지 않고 이 화면 전용 GET 라우트를 새로 둔 이유: 홈 헤더는 "오늘 + 이번 주말"을
// 한 번에 다 보여줘야 해서 날짜 하나만 받는 기존 계약과 안 맞고, 인터뷰 진행 상태와도
// 무관해야 하기 때문이다(제5장 제4조 — 로직은 100% 재사용, 계약만 이 화면에 맞게 새로).
function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = Number(searchParams.get('lat'));
    const lng = Number(searchParams.get('lng'));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ error: 'lat, lng가 필요합니다.' }, { status: 400 });
    }

    const now = new Date();
    const hour = getKstHour(now);
    const todayIso = resolveWhenChoice('TODAY', null, now)!;
    const saturdayIso = toIsoDate(resolveThisSaturday(now));
    const sundayIso = toIsoDate(resolveThisSunday(now));

    const supabase = await createClient();
    const { data: nearestRows, error: nearestError } = await supabase.rpc('get_nearest_spot_weather', {
      user_lng: lng,
      user_lat: lat,
    });
    if (nearestError) throw new Error(`날씨 조회 실패: ${nearestError.message}`);
    const nearestWeatherRow = nearestRows?.[0] ?? null;

    const [todaySnapshot, saturdaySnapshot, sundaySnapshot] = await Promise.all([
      resolveWeatherSnapshot(todayIso, hour, lat, lng, nearestWeatherRow, now),
      resolveWeatherSnapshot(saturdayIso, hour, lat, lng, nearestWeatherRow, now),
      resolveWeatherSnapshot(sundayIso, hour, lat, lng, nearestWeatherRow, now),
    ]);

    function buildDayCard(date: string, dayLabel: string, snapshot: WeatherSnapshot) {
      return { date, dayLabel, snapshot, oneLiner: buildWeekendOneLiner(snapshot) };
    }

    return NextResponse.json({
      today: { date: todayIso, snapshot: todaySnapshot, guideMessage: buildWidgetGuideMessage(todaySnapshot) },
      weekend: [buildDayCard(saturdayIso, '토', saturdaySnapshot), buildDayCard(sundayIso, '일', sundaySnapshot)],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '날씨 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
