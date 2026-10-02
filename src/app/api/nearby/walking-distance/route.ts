import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchTmapWalkingRoute, hasTmapApiKey } from '@/lib/nearby/tmap-walking-client';
import { haversineDistanceMeters, estimateWalkingDurationSeconds } from '@/lib/spaces/walking-distance-estimate';

// [스팟/이벤트 상세 "주변 주차장/식당" 아코디언 — 도보거리 배치 계산](2026-10-02 사용자
// 지시): 아코디언을 펼쳤을 때만 호출한다(접힌 상태는 직선거리 1차 필터만 사용). Tmap
// 무료 한도가 하루 1,000건뿐이라(사용자 확인) (출발지,도착지) 쌍별로 한 번 계산한
// 결과를 nearby_walking_distance_cache에 영구 캐시해 재사용한다 — 주차장/식당 위치는
// 거의 바뀌지 않아 캐시 미스가 사실상 "처음 보는 쌍"일 때만 발생한다.
//
// TMAP_API_KEY가 아직 없거나(2026-10-02 현재) Tmap 호출이 실패하면, 직선거리 기반
// 추정치로 폴백한다(isEstimate:true로 표시 — 추정치를 실측인 것처럼 속이지 않는다,
// 제5장 제11조 무중단 원칙). 추정치는 캐시하지 않는다(다음 호출에서 키가 생기면 바로
// 실제값으로 교체될 수 있어야 하므로).
type TargetInput = {
  targetTable: 'seoul_public_parking_lots' | 'open_spaces';
  targetId: string;
  lat: number;
  lng: number;
};

type RequestBody = {
  originTable: 'open_spaces' | 'events';
  originId: string;
  originLat: number;
  originLng: number;
  targets: TargetInput[];
};

type ResultItem = {
  targetId: string;
  distanceMeters: number;
  durationSeconds: number;
  isEstimate: boolean;
};

const MAX_TARGETS_PER_REQUEST = 20;

export async function POST(request: NextRequest) {
  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '요청 본문이 올바른 JSON이 아닙니다.' }, { status: 400 });
  }

  const { originTable, originId, originLat, originLng, targets } = body;
  if (
    !originTable ||
    !originId ||
    typeof originLat !== 'number' ||
    typeof originLng !== 'number' ||
    !Array.isArray(targets) ||
    targets.length === 0
  ) {
    return NextResponse.json({ error: '필수 파라미터가 누락되었습니다.' }, { status: 400 });
  }
  if (targets.length > MAX_TARGETS_PER_REQUEST) {
    return NextResponse.json({ error: `한 번에 최대 ${MAX_TARGETS_PER_REQUEST}건까지 요청할 수 있습니다.` }, { status: 400 });
  }

  const supabase = createAdminClient();

  // 1. 캐시 조회 — (출발지, 도착지) 조합이 이미 계산된 적 있으면 재사용.
  const { data: cachedRows, error: cacheReadError } = await supabase
    .from('nearby_walking_distance_cache')
    .select('target_id, distance_meters, duration_seconds')
    .eq('origin_table', originTable)
    .eq('origin_id', originId)
    .in(
      'target_id',
      targets.map((t) => t.targetId)
    );

  if (cacheReadError) {
    console.error('[walking-distance] 캐시 조회 실패(실측 계산으로 계속 진행):', cacheReadError.message);
  }

  const cacheByTargetId = new Map((cachedRows ?? []).map((row) => [row.target_id, row]));
  const results: ResultItem[] = [];
  const newCacheRows: { origin_table: string; origin_id: string; target_table: string; target_id: string; distance_meters: number; duration_seconds: number }[] = [];

  for (const target of targets) {
    const cached = cacheByTargetId.get(target.targetId);
    if (cached) {
      results.push({
        targetId: target.targetId,
        distanceMeters: cached.distance_meters,
        durationSeconds: cached.duration_seconds,
        isEstimate: false,
      });
      continue;
    }

    // 2. 캐시 미스 — Tmap 키가 있으면 실제 호출, 없거나 실패하면 직선거리 추정.
    let walkingRoute = null;
    if (hasTmapApiKey()) {
      try {
        walkingRoute = await fetchTmapWalkingRoute(
          { lat: originLat, lng: originLng },
          { lat: target.lat, lng: target.lng }
        );
      } catch (err) {
        console.error(`[walking-distance] Tmap 호출 실패(직선거리 추정으로 폴백): ${(err as Error).message}`);
      }
    }

    if (walkingRoute) {
      results.push({ targetId: target.targetId, ...walkingRoute, isEstimate: false });
      newCacheRows.push({
        origin_table: originTable,
        origin_id: originId,
        target_table: target.targetTable,
        target_id: target.targetId,
        distance_meters: walkingRoute.distanceMeters,
        duration_seconds: walkingRoute.durationSeconds,
      });
    } else {
      const distanceMeters = Math.round(haversineDistanceMeters(originLat, originLng, target.lat, target.lng));
      results.push({
        targetId: target.targetId,
        distanceMeters,
        durationSeconds: estimateWalkingDurationSeconds(distanceMeters),
        isEstimate: true,
      });
    }
  }

  if (newCacheRows.length > 0) {
    const { error: cacheWriteError } = await supabase
      .from('nearby_walking_distance_cache')
      .upsert(newCacheRows, { onConflict: 'origin_table,origin_id,target_table,target_id' });
    if (cacheWriteError) {
      console.error('[walking-distance] 캐시 저장 실패(응답 자체에는 영향 없음):', cacheWriteError.message);
    }
  }

  return NextResponse.json({ results });
}
