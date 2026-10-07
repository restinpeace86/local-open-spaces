// [문화센터 찜 푸시 발송 — 공유 모듈](2026-10-08): culture-club-status-watch.mjs
// 에만 있던 "찜한 유저에게 웹푸시 보내기" 로직을 emart-culture-club-register-
// reminder.mjs(접수시작 10분 전 사전 알림, 사용자 지시)도 그대로 써야 해서
// 공유 모듈로 뺀다(제5장 제4조 기존 구조 우선 — 두 번째 스크립트가 같은
// 로직을 다시 베껴 쓰지 않는다). 기존 동작은 title을 항상 "🔔 찜한 강좌
// 접수 가능"으로 고정했는데, 사전 알림은 아직 접수가 시작되지 않은 상태라
// 다른 제목/문구가 필요해 title/body를 호출부가 넘기도록만 바꿨다 — 조회
// 대상(찜한 유저 중 등급 필터)과 발송/만료 정리 로직 자체는 그대로다.
import webpush from 'web-push';

export const ELIGIBLE_GRADES = ['excellent', 'power'];

export function configureWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    throw new Error('NEXT_PUBLIC_VAPID_PUBLIC_KEY 또는 VAPID_PRIVATE_KEY가 설정되지 않았습니다.');
  }
  webpush.setVapidDetails('mailto:no-reply@example.com', publicKey, privateKey);
}

export async function sendPushToBookmarkers(admin, cultureClubClassId, { title, body, url = '/', logPrefix = 'CULTURE_CLUB_PUSH' }) {
  const { data: bookmarks, error: bookmarksError } = await admin
    .from('user_bookmarks')
    .select('user_id')
    .eq('culture_club_class_id', cultureClubClassId);
  if (bookmarksError) throw new Error(`찜한 유저 조회 실패: ${bookmarksError.message}`);

  const bookmarkedUserIds = [...new Set((bookmarks ?? []).map((r) => r.user_id))];
  if (bookmarkedUserIds.length === 0) return { sentCount: 0, expiredCount: 0 };

  const { data: eligibleProfiles, error: profilesError } = await admin
    .from('profiles')
    .select('id')
    .in('id', bookmarkedUserIds)
    .in('grade', ELIGIBLE_GRADES);
  if (profilesError) throw new Error(`찜한 유저 등급 조회 실패: ${profilesError.message}`);

  const userIds = (eligibleProfiles ?? []).map((p) => p.id);
  if (userIds.length === 0) return { sentCount: 0, expiredCount: 0 };

  const { data: subscriptions, error: subsError } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth_key')
    .in('user_id', userIds);
  if (subsError) throw new Error(`구독 정보 조회 실패: ${subsError.message}`);

  const payload = JSON.stringify({ title, body, url });

  let sentCount = 0;
  let expiredCount = 0;
  for (const sub of subscriptions ?? []) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } }, payload);
      sentCount += 1;
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        await admin.from('push_subscriptions').delete().eq('id', sub.id);
        expiredCount += 1;
      } else {
        console.error(`[${logPrefix}] ${sub.id} 발송 실패(${err.statusCode ?? 'unknown'}): ${err.message}`);
      }
    }
  }
  return { sentCount, expiredCount };
}
