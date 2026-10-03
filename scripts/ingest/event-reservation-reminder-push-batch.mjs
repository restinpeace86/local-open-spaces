// [예약 오픈 알림](2026-09-20 사용자 지시): "사전예약 오픈일에 맞추어 예약 오픈전 10분전
// 이라던가 앱 푸시 주는 기능을 만들고 싶은데" — 관리자가 이벤트마다 직접 입력해 둔
// events.next_reservation_open_at을 기준으로, 그 시각이 다가온 이벤트를 찜(북마크)해 둔
// 유저에게 웹 푸시를 보낸다.
//
// [찜(북마크) 연동으로 설계 변경](2026-09-20 사용자 지시): "내 알림신청목록은 찜했을때
// 찜한것에 대하여만 알림오도록 하는거지" — 별도 구독 테이블(event_reservation_reminders,
// 폐기함) 없이 이미 있는 user_bookmarks를 그대로 구독 신호로 재사용한다.
//
// [등급 정책 재개정 — 2단계 분기](2026-10-03 사용자 지시): "찜기능에대하여 2개로
// 분기해서 우수회원들은 예약 알림기능까지.. 그 아래는.. 그냥 찜해서 찜한것
// 마이페이지 같은데서 볼수 있는기능" — 찜(user_bookmarks에 담기는 것) 자체는
// 그대로 열심맘(active) 이상이면 누구나 가능하지만, 예약 오픈 알림 발송은 그보다
// 높은 우수맘(excellent) 이상만 받도록 분리한다(2026-09-20 당시엔 찜과 동일 기준
// 이었음 — 이번 지시로 알림 쪽 문턱만 올림). 결과적으로 mom-pick-push-send-batch.mjs
// (우수맘/excellent 이상)와 동일한 문턱이 됐다.
//
// [정밀도에 대한 정직한 기록] 이 배치는 GitHub Actions 스케줄(cron)로 10분마다 실행된다.
// GitHub Actions의 스케줄 트리거는 공식적으로 "정확한 시각 실행을 보장하지 않으며 부하가
// 높을 때 지연될 수 있다"고 명시돼 있어(제3장 제5조 추측 금지 — 정밀 타이머인 척하지
// 않음), "정확히 10분 전"이 아니라 "약 5~15분 전" 사이에 발송된다. 창(window)을 실행
// 주기보다 넓게 잡아(15분 폭, 10분 주기) 지연이 있어도 이벤트를 놓치지 않게 한다.
//
// [중복 발송 방지] reservation_open_reminder_sent_at이 next_reservation_open_at과 정확히
// 같으면 "이미 이 회차를 처리했다"로 간주하고 건너뛴다 — 관리자가 다음 회차 시각으로
// 갱신하면(값이 달라짐) 자연히 다시 발송 대상이 된다(별도 boolean 리셋 로직 불필요, 이미
// PATCH /api/admin/data-grid/reservation-open-at가 저장 시 이 컬럼을 null로 되돌려둔다).
import { pathToFileURL } from 'url';
import webpush from 'web-push';
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from './lib/supabase-admin.mjs';

const WINDOW_START_MINUTES = 5;
const WINDOW_END_MINUTES = 15;
// src/lib/community/grades.ts의 canReceivePushNotifications(hasReachedGrade(grade,
// 'excellent'))와 동일한 문턱 — GRADE_RANK 순서상 'excellent' 이상은 ['excellent','power'].
const ELIGIBLE_GRADES = ['excellent', 'power'];

function configureWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    throw new Error('NEXT_PUBLIC_VAPID_PUBLIC_KEY 또는 VAPID_PRIVATE_KEY가 설정되지 않았습니다.');
  }
  webpush.setVapidDetails('mailto:no-reply@example.com', publicKey, privateKey);
}

export async function run() {
  configureWebPush();
  const admin = createAdminClient();

  const now = Date.now();
  const windowStart = new Date(now + WINDOW_START_MINUTES * 60 * 1000).toISOString();
  const windowEnd = new Date(now + WINDOW_END_MINUTES * 60 * 1000).toISOString();

  const { data: candidateEvents, error: eventsError } = await admin
    .from('events')
    .select('id, title, next_reservation_open_at, reservation_open_reminder_sent_at')
    .gte('next_reservation_open_at', windowStart)
    .lt('next_reservation_open_at', windowEnd);
  if (eventsError) throw new Error(`대상 이벤트 조회 실패: ${eventsError.message}`);

  const targetEvents = (candidateEvents ?? []).filter(
    (event) => event.reservation_open_reminder_sent_at !== event.next_reservation_open_at
  );

  let sentCount = 0;
  let expiredCount = 0;
  let eventsProcessed = 0;

  for (const event of targetEvents) {
    const { data: bookmarks, error: bookmarksError } = await admin
      .from('user_bookmarks')
      .select('user_id')
      .eq('event_id', event.id);
    if (bookmarksError) {
      console.error(`[EVENT_RESERVATION_REMINDER] ${event.id} 찜 조회 실패: ${bookmarksError.message}`);
      continue;
    }

    // push_subscriptions.user_id와 profiles.id는 둘 다 auth.users(id)를 가리키는 형제 FK라
    // PostgREST 임베디드 조회로 자동 연결되지 않는다(mom-pick-push-send-batch.mjs와 동일한
    // 실측 확인 사례) — 두 번 조회해 JS에서 등급으로 걸러낸다.
    const bookmarkedUserIds = [...new Set((bookmarks ?? []).map((r) => r.user_id))];
    const { data: eligibleProfiles, error: profilesError } =
      bookmarkedUserIds.length > 0
        ? await admin.from('profiles').select('id').in('id', bookmarkedUserIds).in('grade', ELIGIBLE_GRADES)
        : { data: [], error: null };
    if (profilesError) {
      console.error(`[EVENT_RESERVATION_REMINDER] ${event.id} 찜한 유저 등급 조회 실패: ${profilesError.message}`);
      continue;
    }

    const userIds = (eligibleProfiles ?? []).map((p) => p.id);
    const { data: subscriptions, error: subsError } =
      userIds.length > 0
        ? await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth_key').in('user_id', userIds)
        : { data: [], error: null };
    if (subsError) {
      console.error(`[EVENT_RESERVATION_REMINDER] ${event.id} 구독 정보 조회 실패: ${subsError.message}`);
      continue;
    }

    const payload = JSON.stringify({
      title: '🔔 예약 오픈 알림',
      body: `"${event.title}" 예약이 곧 열려요! 서두르세요.`,
      url: '/',
    });

    for (const sub of subscriptions ?? []) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } }, payload);
        sentCount += 1;
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await admin.from('push_subscriptions').delete().eq('id', sub.id);
          expiredCount += 1;
        } else {
          console.error(`[EVENT_RESERVATION_REMINDER] ${sub.id} 발송 실패(${err.statusCode ?? 'unknown'}): ${err.message}`);
        }
      }
    }

    // 구독자가 0명이었어도 이 회차는 처리된 것으로 표시한다 — 다음 tick에서 같은
    // 이벤트를 다시 조회/재처리하지 않기 위함(창이 넓어 여러 tick에 걸쳐 잡힐 수 있음).
    const { error: markError } = await admin
      .from('events')
      .update({ reservation_open_reminder_sent_at: event.next_reservation_open_at })
      .eq('id', event.id);
    if (markError) {
      console.error(`[EVENT_RESERVATION_REMINDER] ${event.id} 발송 완료 표시 실패: ${markError.message}`);
      continue;
    }
    eventsProcessed += 1;
  }

  console.log(
    `[EVENT_RESERVATION_REMINDER] 완료 — 대상 이벤트 ${targetEvents.length}건 중 처리 ${eventsProcessed}건, 발송 ${sentCount}건, 만료 정리 ${expiredCount}건`
  );
  return { targetEventCount: targetEvents.length, eventsProcessed, sentCount, expiredCount };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  loadEnv();
  run()
    .then(({ sentCount }) => {
      console.log(`▶▶▶ [EVENT_RESERVATION_REMINDER] 종료: ${sentCount}건 발송`);
      process.exitCode = 0;
    })
    .catch((err) => {
      console.error(`❌ [EVENT_RESERVATION_REMINDER] 실행 실패: ${err.message}`);
      process.exitCode = 1;
    });
}
