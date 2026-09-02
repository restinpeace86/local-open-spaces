// [Decision 019](2026-09-02) / spec/community/mom-pick-grades.md 2.5: 우수맘 이상
// "맞춤형 큐레이션 푸시 알람" 발송 배치. 매일 아침(주말 포함) 1회, 구독 시점에 스냅샷해둔
// 위치(use-user-location.ts 기반, push_subscriptions.lat/lng) 반경 내에 최근 24시간
// 사이 새로 올라온 스팟/행사가 있으면 푸시를 보낸다.
//
// [범위 한정에 대한 정직한 기록] 원문이 언급한 "아이 연령/선호 성향" 조건까지 반영하려면
// 이벤트/스팟에 신뢰할 수 있는 연령 태그 데이터가 있어야 하는데, 기존
// generate-notifications.ts도 동일한 이유로 target_ages를 저장만 하고 실제로는 쓰지
// 못했다(실측 확인된 기존 한계). 이 배치도 같은 데이터 공백 위에서 "거주 지역(위치)"
// 조건만 확정적으로 반영하고, 연령/성향 매칭은 추측으로 지어내지 않는다(제3장 제5조).
import { pathToFileURL } from 'url';
import webpush from 'web-push';
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from './lib/supabase-admin.mjs';

// spec/notification/notification-settings.md의 기존 알림 반경 기본값('10km')과 동일하게
// 맞춘다 — 이 프로젝트가 이미 "동네 반경"으로 합의한 기준을 재사용한다.
const DEFAULT_RADIUS_METERS = 10_000;
const LOOKBACK_HOURS = 24;

function configureWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    throw new Error('NEXT_PUBLIC_VAPID_PUBLIC_KEY 또는 VAPID_PRIVATE_KEY가 설정되지 않았습니다.');
  }
  // mailto: 연락처는 웹 푸시 표준(VAPID)이 요구하는 형식적 값이다 — 실제 발신 주소가
  // 없어 서비스명만 넣는다(기존 관례상 이 프로젝트에 별도 운영 이메일이 없음).
  webpush.setVapidDetails('mailto:no-reply@example.com', publicKey, privateKey);
}

export async function run() {
  configureWebPush();
  const admin = createAdminClient();

  // push_subscriptions.user_id와 profiles.id는 둘 다 auth.users(id)를 가리키는 형제
  // FK라 PostgREST가 임베디드 조회로 자동 연결하지 못한다(실측 확인: "Could not find a
  // relationship" 에러) — 두 번 조회해 JS에서 직접 이어붙인다.
  const { data: subscriptions, error } = await admin
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth_key, lat, lng')
    .not('lat', 'is', null)
    .not('lng', 'is', null);

  if (error) throw new Error(`구독 목록 조회 실패: ${error.message}`);

  const userIds = [...new Set((subscriptions ?? []).map((s) => s.user_id))];
  const { data: eligibleProfiles, error: profilesError } =
    userIds.length > 0
      ? await admin.from('profiles').select('id, grade').in('id', userIds).in('grade', ['excellent', 'power'])
      : { data: [], error: null };
  if (profilesError) throw new Error(`구독자 등급 조회 실패: ${profilesError.message}`);

  const eligibleUserIds = new Set((eligibleProfiles ?? []).map((p) => p.id));
  const eligibleSubscriptions = (subscriptions ?? []).filter((s) => eligibleUserIds.has(s.user_id));

  const since = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
  let sentCount = 0;
  let skippedCount = 0;
  let expiredCount = 0;

  for (const sub of eligibleSubscriptions) {
    const { data: newItemCount, error: countError } = await admin.rpc('count_new_nearby_items', {
      user_lng: sub.lng,
      user_lat: sub.lat,
      radius_meters: DEFAULT_RADIUS_METERS,
      since_timestamp: since,
    });

    if (countError) {
      console.error(`[MOM_PICK_PUSH] ${sub.id} 주변 신규 항목 집계 실패: ${countError.message}`);
      continue;
    }
    if (!newItemCount || newItemCount <= 0) {
      skippedCount += 1;
      continue;
    }

    const payload = JSON.stringify({
      title: '나드리픽 맘스픽',
      body: `우리 동네에 새로운 스팟/행사가 ${newItemCount}건 있어요! 확인해보세요 🎉`,
      url: '/',
    });

    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } }, payload);
      sentCount += 1;
    } catch (err) {
      // 410(Gone)/404는 브라우저가 구독을 이미 해지했다는 뜻 — 표준 웹 푸시 위생
      // 관례대로 죽은 구독을 정리한다(계속 재시도해도 영원히 실패하므로).
      if (err.statusCode === 410 || err.statusCode === 404) {
        await admin.from('push_subscriptions').delete().eq('id', sub.id);
        expiredCount += 1;
      } else {
        console.error(`[MOM_PICK_PUSH] ${sub.id} 발송 실패(${err.statusCode ?? 'unknown'}): ${err.message}`);
      }
    }
  }

  console.log(
    `[MOM_PICK_PUSH] 완료 — 대상 ${eligibleSubscriptions.length}건 중 발송 ${sentCount}건, 신규 없음 ${skippedCount}건, 만료 정리 ${expiredCount}건`
  );
  return { targetCount: eligibleSubscriptions.length, sentCount, skippedCount, expiredCount };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  loadEnv();
  run()
    .then(({ sentCount }) => {
      console.log(`▶▶▶ [MOM_PICK_PUSH] 종료: ${sentCount}건 발송`);
      process.exitCode = 0;
    })
    .catch((err) => {
      console.error(`❌ [MOM_PICK_PUSH] 실행 실패: ${err.message}`);
      process.exitCode = 1;
    });
}
