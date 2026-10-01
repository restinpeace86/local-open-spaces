// [스마트서울맵 수집 뱃지 자동 부여](2026-10-01 사용자 지시): "서울형키즈카페
// 뱃지 달아주자" / "키즈카페머니 사용처는.. 뱃지로" / "서울형캠핑장 이렇게
// 달자" / "오케이존 인증 뱃지 달아줘" — 이 뱃지들은 블로그 텍스트 키워드 추측이
// 아니라 스마트서울맵 API가 이미 확정해준 사실이라, 수집 스크립트가 직접
// spot_curations.curation_badges에 써넣는다(curation-badges.ts의
// matchBadgeKeysFromText 자동 매칭 경로를 타지 않음).
//
// [중복 안전성] 이미 그 뱃지가 있으면 중복 추가하지 않고, 기존에 다른 뱃지가
// 있으면 보존한 채 합친다(관리자가 수기로 추가한 뱃지를 덮어쓰지 않음) — 이번
// 세션에서 어린이도서관 뱃지 태깅 때 쓴 것과 동일한 "기존 배열에 합집합" 원칙.
// [URL 길이 제한](2026-10-01 실측): 오케이존 테마(654건)를 500건 단위로 조회하다
// "Bad Request"로 실패했다 — supabase-admin.mjs의 SELECT_LOOKUP_BATCH_SIZE와
// 동일한 이유(GET 요청의 .in() 목록이 URL 쿼리스트링에 그대로 실리는 PostgREST
// 구조, 2026-08-25 그쪽에서 이미 500건 실패를 실측 확인한 전례)라 같은 값(200)
// 으로 맞춘다.
export async function applyCurationBadgeToExternalIds(admin, externalIds, badgeKey) {
  if (!externalIds || externalIds.length === 0) return { taggedCount: 0 };

  const CHUNK_SIZE = 200;
  let taggedCount = 0;

  for (let i = 0; i < externalIds.length; i += CHUNK_SIZE) {
    const chunk = externalIds.slice(i, i + CHUNK_SIZE);

    // eslint-disable-next-line no-await-in-loop
    const { data: spots, error: spotsError } = await admin
      .from('open_spaces')
      .select('id')
      .in('external_id', chunk);
    if (spotsError) throw new Error(`스팟 조회 실패: ${spotsError.message}`);
    if (!spots || spots.length === 0) continue;

    const spotIds = spots.map((s) => s.id);

    // eslint-disable-next-line no-await-in-loop
    const { data: curations, error: curationsError } = await admin
      .from('spot_curations')
      .select('spot_id, curation_badges')
      .in('spot_id', spotIds);
    if (curationsError) throw new Error(`큐레이션 조회 실패: ${curationsError.message}`);

    const existingBySpotId = new Map((curations ?? []).map((c) => [c.spot_id, c.curation_badges ?? []]));

    const upsertRows = spotIds.map((spotId) => {
      const existingBadges = existingBySpotId.get(spotId) ?? [];
      const merged = existingBadges.includes(badgeKey) ? existingBadges : [...existingBadges, badgeKey];
      return { spot_id: spotId, curation_badges: merged };
    });

    // eslint-disable-next-line no-await-in-loop
    const { error: upsertError } = await admin.from('spot_curations').upsert(upsertRows, { onConflict: 'spot_id' });
    if (upsertError) throw new Error(`큐레이션 upsert 실패: ${upsertError.message}`);

    taggedCount += spotIds.length;
  }

  return { taggedCount };
}
