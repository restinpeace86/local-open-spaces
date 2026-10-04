// [찜한 롯데마트 강좌 상태 변화 알림](2026-10-04 사용자 지시): "나도 상태 변화
// 알림이 좋을것 같지만 그경우 일 1회 배치로는 크게 의미가 없어 이경우 좀 자주
// 가져오던가 해야해" — 전체 카탈로그(60개 지점, 15,000여건)를 자주 재스캔하는
// 건 요청량이 과도하다(지점당 평균 수 페이지, 다중값 배치 조회 불가 — 매 실행
// 650~700개 요청). 대신 "찜한 강좌만" 범위를 좁혀, 그 소수 class_id만 상세
// 페이지(courseview.do)로 개별 재조회한다 — event-reservation-reminder-push-
// batch.mjs와 동일한 "찜(user_bookmarks)을 구독 신호로 재사용" 설계.
//
// [상세 페이지 상태 마크업 — 실측 확인](2026-10-04): 목록 페이지(searchList.do)의
// `class="btn-status"` 대신 상세 페이지(courseview.do)는 `class="btn-status-red"`
// (접수마감 시 finish 접미사 추가)를 쓴다 — CSS class 이름만 다를 뿐 onclick
// 함수명(fn_courseApp/fn_waitAppPopOpen/fn_fieldCnsl)과 "현장접수" 텍스트
// 판별 로직은 목록 페이지와 동일하게 재사용 가능함을 확인했다. 실측 중 실제로
// 하루 안에 상태가 바뀐 사례도 발견했다(전화문의 → 접수마감, 같은 날 오전
// 수집 이후 몇 시간 뒤 재확인 시점) — 상태가 실제로 자주 바뀐다는 걸 재확인.
//
// [알림 대상 전환 — "접수 불가 → 접수 가능"만] 상태가 바뀔 때마다 전부 알리면
// 소음이 된다(예: 전화문의 → 접수마감처럼 어차피 못 하는 상태끼리의 전환).
// "지금까지 온라인으로 못 하던 게 이제 가능해짐"(접수마감/전화문의/현장접수 →
// 바로신청/대기자신청)으로 전환될 때만 푸시를 보낸다. 상태 컬럼 자체는 전환
// 종류와 무관하게 항상 최신화한다(찜한 강좌는 "실시간에 가깝게" 보여준다는
// 취지 — 사용자 지시: "상태에 대한 실시간감지는 찜한 것만 가능합니다").
//
// [발송 대상 등급] event-reservation-reminder-push-batch.mjs와 동일하게 우수맘
// (excellent) 이상만 푸시를 받는다(canReceivePushNotifications과 동일 문턱).
import { pathToFileURL } from 'url';
import webpush from 'web-push';
import { parse } from 'node-html-parser';
import { loadEnv } from '../lib/load-env.mjs';
import { fetchWithTimeout } from './lib/fetch-with-timeout.mjs';
import { createAdminClient } from './lib/supabase-admin.mjs';

const DETAIL_URL = 'https://culture.lottemart.com/cu/gus/course/courseinfo/courseview.do';
const REQUEST_PACING_MIN_MS = 1000;
const REQUEST_PACING_MAX_MS = 1500;
const ELIGIBLE_GRADES = ['excellent', 'power'];
const ACTIONABLE_STATUSES = new Set(['바로신청', '대기자신청']);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomPacingDelay() {
  return REQUEST_PACING_MIN_MS + Math.random() * (REQUEST_PACING_MAX_MS - REQUEST_PACING_MIN_MS);
}

function configureWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    throw new Error('NEXT_PUBLIC_VAPID_PUBLIC_KEY 또는 VAPID_PRIVATE_KEY가 설정되지 않았습니다.');
  }
  webpush.setVapidDetails('mailto:no-reply@example.com', publicKey, privateKey);
}

// [실측 확인] lottemart-culture-club.mjs의 parseRegistrationStatus와 동일한
// 우선순위(바로신청 > 대기자신청 > 전화문의 > 현장접수 > 접수마감)지만, 상세
// 페이지는 class명이 "btn-status-red"라 selector만 다르다.
export function parseDetailPageStatus(html) {
  const root = parse(html);
  const buttons = root.querySelectorAll('a').filter((a) => (a.getAttribute('class') ?? '').includes('btn-status'));
  const htmls = buttons.map((b) => b.outerHTML).join(' ');

  if (/fn_courseApp\(/.test(htmls)) return '바로신청';
  if (/fn_waitAppPopOpen\(/.test(htmls)) return '대기자신청';
  if (/fn_fieldCnsl\(\s*['"]{2}\s*\)/.test(htmls)) return '전화문의';
  if (/>현장접수</.test(htmls)) return '현장접수';
  return '접수마감';
}

async function fetchDetailStatus(storeCode, classId, semesterCode, targetCode) {
  const params = new URLSearchParams({
    search_str_cd: storeCode,
    cls_cd: classId,
    search_term_cd: semesterCode,
    search_cls_target: targetCode,
  });
  const res = await fetchWithTimeout(`${DETAIL_URL}?${params.toString()}`, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });
  if (!res.ok) throw new Error(`상세 페이지 조회 실패 (HTTP ${res.status}, class_id=${classId})`);
  const html = await res.text();
  return parseDetailPageStatus(html);
}

export function isNewlyActionable(oldStatus, newStatus) {
  return !ACTIONABLE_STATUSES.has(oldStatus) && ACTIONABLE_STATUSES.has(newStatus);
}

async function sendPushToBookmarkers(admin, classId, classTitle, newStatus) {
  const { data: bookmarks, error: bookmarksError } = await admin
    .from('user_bookmarks')
    .select('user_id')
    .eq('lottemart_class_id', classId);
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

  const payload = JSON.stringify({
    title: '🔔 찜한 강좌 접수 가능',
    body: `"${classTitle}" ${newStatus === '바로신청' ? '온라인 접수가 시작됐어요!' : '대기자 신청이 가능해졌어요!'}`,
    url: '/',
  });

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
        console.error(`[LOTTEMART_STATUS_WATCH] ${sub.id} 발송 실패(${err.statusCode ?? 'unknown'}): ${err.message}`);
      }
    }
  }
  return { sentCount, expiredCount };
}

async function postPipelineLog(client, { status, errorMessage = null, metaData = null }) {
  try {
    const { error } = await client.from('pipeline_logs').insert({
      agent_name: 'LOTTEMART_CLASS_STATUS_WATCH',
      status,
      error_message: errorMessage,
      meta_data: metaData,
      description: '찜한 롯데마트 문화센터 강좌만 상세 페이지로 재확인해 접수 가능 전환 시 푸시',
      period: 'daily',
    });
    if (error) console.error(`⚠️ pipeline_logs 기록 실패(배치 자체에는 영향 없음): ${error.message}`);
  } catch (err) {
    console.error(`⚠️ pipeline_logs 기록 중 예외(배치 자체에는 영향 없음): ${err.message}`);
  }
}

export async function run() {
  configureWebPush();
  const admin = createAdminClient();

  const { data: bookmarkRows, error: bookmarkError } = await admin
    .from('user_bookmarks')
    .select('lottemart_class_id')
    .not('lottemart_class_id', 'is', null);
  if (bookmarkError) throw new Error(`찜한 강좌 목록 조회 실패: ${bookmarkError.message}`);

  const classIds = [...new Set((bookmarkRows ?? []).map((r) => r.lottemart_class_id))];
  console.log(`▶ 찜한 롯데마트 강좌 상태 감시 시작 — 대상 ${classIds.length}건`);

  if (classIds.length === 0) {
    await postPipelineLog(admin, { status: 'OK', metaData: { targetCount: 0, changedCount: 0, sentCount: 0 } });
    return { targetCount: 0, changedCount: 0, sentCount: 0 };
  }

  const { data: rows, error: rowsError } = await admin
    .from('lottemart_culture_club_classes')
    .select('class_id, class_title, store_code, semester_code, target_code, registration_status')
    .in('class_id', classIds);
  if (rowsError) throw new Error(`강좌 정보 조회 실패: ${rowsError.message}`);

  let changedCount = 0;
  let sentCount = 0;
  let expiredCount = 0;

  try {
    for (const row of rows ?? []) {
      let newStatus;
      try {
        newStatus = await fetchDetailStatus(row.store_code, row.class_id, row.semester_code, row.target_code);
      } catch (err) {
        console.error(`[LOTTEMART_STATUS_WATCH] ${row.class_id} 상세 조회 실패: ${err.message}`);
        await sleep(randomPacingDelay());
        continue;
      }

      if (newStatus !== row.registration_status) {
        changedCount += 1;
        const { error: updateError } = await admin
          .from('lottemart_culture_club_classes')
          .update({ registration_status: newStatus })
          .eq('class_id', row.class_id);
        if (updateError) console.error(`[LOTTEMART_STATUS_WATCH] ${row.class_id} 상태 갱신 실패: ${updateError.message}`);

        if (isNewlyActionable(row.registration_status, newStatus)) {
          const result = await sendPushToBookmarkers(admin, row.class_id, row.class_title, newStatus);
          sentCount += result.sentCount;
          expiredCount += result.expiredCount;
          console.log(`  [${row.class_id}] ${row.registration_status} → ${newStatus}, 푸시 ${result.sentCount}건 발송`);
        }
      }

      await sleep(randomPacingDelay());
    }
  } catch (err) {
    await postPipelineLog(admin, { status: 'FAILED', errorMessage: err.message.slice(0, 500) });
    throw err;
  }

  console.log(`✅ 완료 — 대상 ${classIds.length}건 중 상태 변경 ${changedCount}건, 푸시 발송 ${sentCount}건, 만료 정리 ${expiredCount}건`);
  await postPipelineLog(admin, { status: 'OK', metaData: { targetCount: classIds.length, changedCount, sentCount, expiredCount } });
  return { targetCount: classIds.length, changedCount, sentCount, expiredCount };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  loadEnv();
  run()
    .then(({ sentCount }) => {
      console.log(`▶▶▶ [LOTTEMART_STATUS_WATCH] 종료: ${sentCount}건 발송`);
      process.exitCode = 0;
    })
    .catch((err) => {
      console.error(`❌ [LOTTEMART_STATUS_WATCH] 실행 실패: ${err.message}`);
      process.exitCode = 1;
    });
}
