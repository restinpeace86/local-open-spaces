// [찜한 이마트 강좌 상태 변화 알림](2026-10-06 todo.md 개선사항 1 — 이마트 메인
// 배치가 GitHub Actions에서 WAFForbiddenException(403)으로 계속 막혀(지점
// 분할까지 시도했지만 실패, implementation/2026-10-05-emart-waf-store-
// chunking.md / emart-culture-club-batch.yml 참고) 로컬 PC 작업 스케줄러로
// 옮기기로 한 결정의 일부다: "찜했을경우 5분마다 찜한 이벤트에 대하여서도
// 현재는 pc를 통한 수행..(이마트 한정)" — lottemart-culture-club-status-
// watch.mjs와 동일한 설계(찜한 것만 범위를 좁혀 자주 재확인, event-
// reservation-reminder-push-batch.mjs와 동일한 "찜을 구독 신호로 재사용").
//
// [클래스 단건 상태 재확인 — 실측 확인] 이마트 GraphQL API는 응답에 "현재
// 등록상태"를 직접 알려주는 필드가 없다(emart-culture-club.mjs 주석 참고) —
// 메인 배치는 classStatus 필터값(접수대기/접수중/정원마감)별로 3번 나눠
// 질의해서 "어느 버킷에 걸렸는지"로 상태를 역산한다. 이 스크립트도 동일한
// 방식을 class_id 단건에 적용한다: filterData에 classId + classStatus를
// 함께 넣어 3개 버킷을 순서대로 조회하고, 걸리는 버킷이 그 강좌의 현재
// 상태다. 3개 버킷 전부에서 빠지면 메인 배치가 애초에 추적하지 않는 네 번째
// 상태, 즉 '접수마감'으로 넘어간 것이다(메인 배치가 다루는 버킷이 정확히 이
// 3개로 한정돼 있다는 걸 알고 있으므로 추측이 아니다 — 2026-10-06-emart-
// culture-club-filter-status-closed.sql 참고).
//
// [액션 가능한 전환만 알림] '정원마감'은 UI상 "대기접수, 취소 시 등록 가능"
// (emart-culture-club.mjs 주석) — 롯데마트의 '대기자신청'과 같은 "해볼 만한"
// 상태로 취급한다. '접수대기'(아직 오픈 전)나 '접수마감'(끝남)에서 '접수중'/
// '정원마감'으로 넘어갈 때만 푸시한다.
import { pathToFileURL } from 'url';
import webpush from 'web-push';
import { loadEnv } from '../lib/load-env.mjs';
import { fetchWithTimeout } from './lib/fetch-with-timeout.mjs';
import { createAdminClient } from './lib/supabase-admin.mjs';
import { applyRandomStartupDelay } from './lib/random-startup-delay.mjs';
import { normalizeEmartStatus } from './lib/culture-club-common.mjs';

const env = loadEnv();
const GRAPHQL_URL = 'https://wrihg4edszhmvagptse4t4eggi.appsync-api.ap-northeast-2.amazonaws.com/graphql';
const REQUEST_PACING_MIN_MS = 1000;
const REQUEST_PACING_MAX_MS = 1500;
// [랜덤 시작 지연] 5분 주기라 다른 배치들처럼 몇 분씩 늘리면 "5분마다"라는
// 약속이 무너진다 — lottemart-culture-club-status-watch.mjs와 동일하게
// 최대 30초로 작게만 흔든다.
const MAX_STARTUP_DELAY_MS = 30 * 1000;
const ELIGIBLE_GRADES = ['excellent', 'power'];
// 조회 순서: 액션 가능한 것부터 먼저 확인(대부분의 찜 강좌는 이미 접수중일
// 것이므로 평균 요청 수를 줄이는 효과도 있음).
const STATUS_CHECK_ORDER = ['접수중', '정원마감', '접수대기'];
const FALLBACK_STATUS = '접수마감';
const ACTIONABLE_STATUSES = new Set(['접수중', '정원마감']);
const BROWSER_LIKE_HEADERS = {
  Origin: 'https://www.cultureclub.emart.com',
  Referer: 'https://www.cultureclub.emart.com/enrolment',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
};

const QUERY = `query getClassByFiltering($keyword: String, $filterData: [FilterData], $sortKey: String, $from: Int, $size: Int) {
  getClassByFiltering(keyword: $keyword, filterData: $filterData, sortKey: $sortKey, from: $from, size: $size) {
    total
    data { classId }
  }
}`;

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

async function isClassInStatusBucket(classId, status) {
  const apiKey = env.EMART_CULTURE_CLUB_API_KEY;
  if (!apiKey) {
    throw new Error('EMART_CULTURE_CLUB_API_KEY 환경변수가 설정되지 않았습니다.');
  }

  const res = await fetchWithTimeout(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, ...BROWSER_LIKE_HEADERS },
    body: JSON.stringify({
      query: QUERY,
      variables: {
        keyword: '',
        filterData: [
          { type: 'classId', data: [classId] },
          { type: 'classStatus', data: [status] },
        ],
        sortKey: 'deadline',
        from: 0,
        size: 1,
      },
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`이마트 상태 조회 실패 (HTTP ${res.status}, class_id=${classId}): ${text.slice(0, 300)}`);
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`이마트 상태 응답이 JSON이 아닙니다(class_id=${classId}): ${text.slice(0, 300)}`);
  }

  if (json.errors) {
    throw new Error(`이마트 상태 조회 GraphQL 에러(class_id=${classId}): ${JSON.stringify(json.errors).slice(0, 300)}`);
  }

  return (json.data?.getClassByFiltering?.data ?? []).length > 0;
}

// [현재 상태 역산] 3개 버킷을 순서대로 조회해 먼저 걸리는 걸 현재 상태로
// 본다(세 버킷은 메인 배치 설계상 상호 배타적이라 둘 이상 동시에 걸릴 일은
// 없다). 전부 빠지면 FALLBACK_STATUS('접수마감')로 본다.
export async function fetchCurrentStatus(classId) {
  for (const status of STATUS_CHECK_ORDER) {
    if (await isClassInStatusBucket(classId, status)) return status;
    await sleep(randomPacingDelay());
  }
  return FALLBACK_STATUS;
}

export function isNewlyActionable(oldStatus, newStatus) {
  return !ACTIONABLE_STATUSES.has(oldStatus) && ACTIONABLE_STATUSES.has(newStatus);
}

async function sendPushToBookmarkers(admin, classId, classTitle, newStatus) {
  const { data: bookmarks, error: bookmarksError } = await admin
    .from('user_bookmarks')
    .select('user_id')
    .eq('emart_class_id', classId);
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
    body: `"${classTitle}" ${newStatus === '접수중' ? '온라인 접수가 시작됐어요!' : '대기 등록(취소 시 등록 가능)이 가능해졌어요!'}`,
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
        console.error(`[EMART_STATUS_WATCH] ${sub.id} 발송 실패(${err.statusCode ?? 'unknown'}): ${err.message}`);
      }
    }
  }
  return { sentCount, expiredCount };
}

async function postPipelineLog(client, { status, errorMessage = null, metaData = null }) {
  try {
    const { error } = await client.from('pipeline_logs').insert({
      agent_name: 'EMART_CLASS_STATUS_WATCH',
      status,
      error_message: errorMessage,
      meta_data: metaData,
      description: '찜한 이마트 컬처클럽 강좌만 class_id 단건 조회로 재확인해 접수 가능 전환 시 푸시',
      // 5분 주기 배치라 'daily'/'monthly' 둘 다 거짓이다 — null로 둔다(제3장 제5조).
      period: null,
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
    .select('emart_class_id')
    .not('emart_class_id', 'is', null);
  if (bookmarkError) throw new Error(`찜한 강좌 목록 조회 실패: ${bookmarkError.message}`);

  const classIds = [...new Set((bookmarkRows ?? []).map((r) => r.emart_class_id))];
  console.log(`▶ 찜한 이마트 강좌 상태 감시 시작 — 대상 ${classIds.length}건`);

  if (classIds.length === 0) {
    await postPipelineLog(admin, { status: 'OK', metaData: { targetCount: 0, changedCount: 0, sentCount: 0 } });
    return { targetCount: 0, changedCount: 0, sentCount: 0 };
  }

  const { data: rows, error: rowsError } = await admin
    .from('emart_culture_club_classes')
    .select('class_id, class_title, filter_status')
    .in('class_id', classIds);
  if (rowsError) throw new Error(`강좌 정보 조회 실패: ${rowsError.message}`);

  let changedCount = 0;
  let sentCount = 0;
  let expiredCount = 0;

  try {
    for (const row of rows ?? []) {
      let newStatus;
      try {
        newStatus = await fetchCurrentStatus(row.class_id);
      } catch (err) {
        console.error(`[EMART_STATUS_WATCH] ${row.class_id} 상태 조회 실패: ${err.message}`);
        continue;
      }

      if (newStatus !== row.filter_status) {
        changedCount += 1;
        const { error: updateError } = await admin
          .from('emart_culture_club_classes')
          .update({ filter_status: newStatus, normalized_status: normalizeEmartStatus(newStatus) })
          .eq('class_id', row.class_id);
        if (updateError) console.error(`[EMART_STATUS_WATCH] ${row.class_id} 상태 갱신 실패: ${updateError.message}`);

        if (isNewlyActionable(row.filter_status, newStatus)) {
          const result = await sendPushToBookmarkers(admin, row.class_id, row.class_title, newStatus);
          sentCount += result.sentCount;
          expiredCount += result.expiredCount;
          console.log(`  [${row.class_id}] ${row.filter_status} → ${newStatus}, 푸시 ${result.sentCount}건 발송`);
        }
      }
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
  applyRandomStartupDelay(MAX_STARTUP_DELAY_MS)
    .then(() => run())
    .then(({ sentCount }) => {
      console.log(`▶▶▶ [EMART_STATUS_WATCH] 종료: ${sentCount}건 발송`);
      process.exitCode = 0;
    })
    .catch((err) => {
      console.error(`❌ [EMART_STATUS_WATCH] 실행 실패: ${err.message}`);
      process.exitCode = 1;
    });
}
