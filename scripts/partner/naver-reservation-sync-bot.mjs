// [나드리픽 파트너 PMS — 네이버 예약 스태프 계정 동기화 봇](2026-09-21 사용자 지시,
// implementation/todo.md [개선사항 2] 재개):
//
// [경로 재확정 배경] 원래 [개선사항 2]는 웹훅 기반 실시간 수신(naver-booking,
// email-inbound)과 "새 reservations 테이블" 제안이 섞여 있어, 기존
// `public.reservations`(스팟 방문 예약 신청용, 완전히 다른 스키마)와 이름이
// 충돌하고 이미 구현된 bookings/웹훅 인프라와도 아키텍처가 상충해 한 차례
// 스킵했다. 이후 사용자가 명확히 확인: "웹훅은 계속 봤는데 더이상 웹훅할 수
// 있는게 없음.. 현재 유일하게 네이버 예약 정보 가져올 수 있는 방법은 (1) 업체
// 사장님이 네이버 예약 시스템에 우리 계정을 스태프로 등록 → 그 계정으로 봇이
// 주기적으로 접근 (2) 크롬 확장 프로그램으로 실시간 반영 — (2)는 비현실적이라
// 배제, (1)이 유일한 실제 경로. "기존 reservations 테이블 기준으로 하면 되지..
// 중요한건 그 프로세스" — 새 테이블을 또 만들지 않고, 이미 이 정확한 목적
// (파트너별 네이버 예약, source='naver')으로 설계된 `bookings`에 필요한
// 컬럼만 얹었다(2026-09-21-naver-reservation-sync-columns.sql).
//
// [정직한 한계 고지 — 반드시 읽을 것] 이 세션에는 네이버 예약 파트너센터
// 스태프 계정도, 그 화면의 실제 HTML/DOM도 없어(권한 위임을 실제로 받은 뒤에만
// 접근 가능) 예약 목록 페이지의 실제 구조를 한 번도 보지 못했다. 그래서:
//   - 로그인 세션 주입, 업체(bizes_id) 순회, Supabase upsert(멱등키
//     naver_reservation_id 기준), 로깅/에러 처리 등 "프로세스" 전체는 실제로
//     동작하는 완성 코드다(사용자가 "중요한 건 프로세스"라고 확정한 부분).
//   - 딱 한 곳, `extractReservationsFromPage()`(실제 페이지에서 예약 데이터를
//     뽑아내는 부분)만은 실제 DOM 셀렉터를 추측해 하드코딩하지 않았다 — 정규식
//     라벨 매칭(이메일 파서)과 달리 CSS 셀렉터는 "그럴듯한 추측"이 거의 항상
//     틀리고, 틀렸을 때 조용히 0건을 반환해 실패를 숨기는 게 더 위험하다(추측
//     금지, 제3장 제5조). 대신 DEBUG_NAVER_SCRAPE=true로 실행하면 실제 페이지의
//     HTML/스크린샷을 저장하도록 만들어 뒀다 — 그 결과물을 공유해 주면 다음
//     단계에서 실제 셀렉터로 완성할 수 있다.
//
// 실행: node scripts/partner/naver-reservation-sync-bot.mjs [--debug]
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from '../ingest/lib/supabase-admin.mjs';
import { mapNaverReservationStatus } from './naver-reservation-status.mjs';

loadEnv();

const DEBUG = process.argv.includes('--debug') || process.env.DEBUG_NAVER_SCRAPE === 'true';
// 실제 네이버 예약 파트너센터 URL을 이 세션에서 확인하지 못해 일반적으로 알려진
// 형태를 기본값으로 두되, 반드시 실제 값으로 검증/교체해야 한다(env로 즉시
// 덮어쓸 수 있게 해 둠 — 하드코딩된 값을 코드 수정 없이 고칠 수 있도록).
const BASE_URL = process.env.NAVER_PARTNER_CENTER_BASE_URL ?? 'https://partner.booking.naver.com';

export function parseSessionCookies() {
  const raw = process.env.NAVER_STAFF_SESSION_COOKIES_JSON;
  if (!raw) {
    throw new Error(
      'NAVER_STAFF_SESSION_COOKIES_JSON 환경변수가 없습니다. 스태프 권한이 위임된 계정으로 ' +
        '네이버에 로그인한 브라우저에서 쿠키를 내보내(예: Cookie-Editor 확장 프로그램) ' +
        'Playwright의 context.addCookies() 입력 형식(JSON 배열, {name,value,domain,path,...})으로 넣어야 합니다.'
    );
  }
  const cookies = JSON.parse(raw);
  if (!Array.isArray(cookies) || cookies.length === 0) {
    throw new Error('NAVER_STAFF_SESSION_COOKIES_JSON은 비어 있지 않은 배열이어야 합니다.');
  }
  return cookies;
}

// [정직한 한계 고지 참고] 실제 페이지 구조 확인 전까지는 항상 빈 배열을
// 반환한다 — 마치 파싱에 성공한 것처럼 추측 데이터를 만들어 반환하면(0건인지
// 실패인지 구분이 안 가는) DB에 아무 영향이 없어 보여도 실제로는 그냥 아무
// 것도 동기화되지 않고 있다는 사실이 로그에조차 드러나지 않는 게 더 나쁘다 —
// 그래서 매번 명확한 경고를 남긴다.
async function extractReservationsFromPage(page, bizesId) {
  if (DEBUG) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dir = new URL('./.debug/', import.meta.url);
    try {
      const fs = await import('node:fs/promises');
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(new URL(`${bizesId}-${timestamp}.html`, dir), await page.content(), 'utf-8');
      await page.screenshot({ path: new URL(`${bizesId}-${timestamp}.png`, dir).pathname, fullPage: true });
      console.log(`  [debug] 페이지 원본을 scripts/partner/.debug/${bizesId}-${timestamp}.{html,png}에 저장했습니다.`);
    } catch (err) {
      console.warn('  [debug] 디버그 저장 실패(무시하고 계속 진행):', err instanceof Error ? err.message : err);
    }
  }

  console.warn(
    `  ⚠️ [TODO] bizes_id=${bizesId}: 예약 목록 추출 로직이 아직 구현되지 않았습니다 ` +
      '(실제 네이버 예약 파트너센터 페이지 구조를 확인한 적이 없어 셀렉터를 추측하지 않았습니다). ' +
      '--debug로 실행해 저장된 HTML/스크린샷을 확인한 뒤, 실제 구조에 맞춰 이 함수만 채우면 됩니다.'
  );
  return [];
}

export async function upsertReservation(admin, partnerId, reservation) {
  const status = mapNaverReservationStatus(reservation.statusLabel) ?? 'confirmed';
  if (!mapNaverReservationStatus(reservation.statusLabel)) {
    console.warn(
      `  ⚠️ 알 수 없는 상태 라벨 "${reservation.statusLabel}"(예약번호 ${reservation.naverReservationId}) ` +
        `— 추측하지 않고 'confirmed'로 안전하게 처리합니다. naver-reservation-status.mjs에 라벨을 추가해 주세요.`
    );
  }

  const { error } = await admin.from('bookings').upsert(
    {
      partner_id: partnerId,
      naver_reservation_id: reservation.naverReservationId,
      customer_name: reservation.customerName,
      customer_phone: reservation.customerPhone,
      booking_date: reservation.bookingDate,
      booking_time: reservation.bookingTime,
      headcount: reservation.headcount,
      source: 'naver',
      status,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'naver_reservation_id' }
  );

  if (error) {
    console.error(`  ❌ 예약 저장 실패(naver_reservation_id=${reservation.naverReservationId}):`, error.message);
    return false;
  }
  return true;
}

async function main() {
  const cookies = parseSessionCookies();
  const admin = createAdminClient();

  const { data: partners, error: partnersError } = await admin
    .from('partners')
    .select('id, farm_name, naver_bizes_id')
    .not('naver_bizes_id', 'is', null);
  if (partnersError) throw new Error(`파트너 목록 조회 실패: ${partnersError.message}`);
  if (!partners || partners.length === 0) {
    console.log('naver_bizes_id가 설정된 파트너가 없습니다 — 동기화할 대상이 없어 종료합니다.');
    return;
  }
  console.log(`동기화 대상 파트너 ${partners.length}곳: ${partners.map((p) => p.farm_name).join(', ')}`);

  const browser = await chromium.launch({ headless: !DEBUG });
  const context = await browser.newContext();
  await context.addCookies(cookies);
  const page = await context.newPage();

  let totalUpserted = 0;
  let totalFailed = 0;

  try {
    for (const partner of partners) {
      console.log(`\n[${partner.farm_name}] bizes_id=${partner.naver_bizes_id} 처리 중...`);
      try {
        // 실제 예약 목록 페이지 URL 경로도 이 세션에서 확인하지 못했다 —
        // BASE_URL과 동일한 이유로 env로 통째로 덮어쓸 수 있게 해 둔다.
        const listPath = process.env.NAVER_PARTNER_CENTER_LIST_PATH ?? `/bizes/${partner.naver_bizes_id}/booking-list`;
        await page.goto(`${BASE_URL}${listPath}`, { waitUntil: 'networkidle' });

        const reservations = await extractReservationsFromPage(page, partner.naver_bizes_id);
        console.log(`  ${reservations.length}건 추출됨`);

        for (const reservation of reservations) {
          const success = await upsertReservation(admin, partner.id, reservation);
          if (success) totalUpserted += 1;
          else totalFailed += 1;
        }
      } catch (err) {
        console.error(`  ❌ [${partner.farm_name}] 처리 중 오류:`, err instanceof Error ? err.message : err);
        totalFailed += 1;
      }
    }
  } finally {
    await browser.close();
  }

  console.log(`\n완료 — 저장 ${totalUpserted}건, 실패 ${totalFailed}건.`);
}

// [테스트 가능성](scripts/migrations/2026-08-28-deactivate-duplicate-seoul-
// reservation-legacy.mjs와 동일한 기존 관례, 제5장 제4조): 직접 실행됐을
// 때만 main()이 돌게 해, 테스트 파일이 이 모듈에서 순수 함수만 import해도
// 브라우저/Supabase 연결이 실제로 일어나지 않는다.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('❌', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
