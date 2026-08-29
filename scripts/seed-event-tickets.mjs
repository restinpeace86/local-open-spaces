// [이벤트픽 & 티켓 할인 정보 MVP](2026-08-29 사용자 지시) 요구사항 2: "초기 테스트를 위해
// 나들이/체험형 축제 및 티켓 샘플 데이터를 세팅하는 초기화 로직". 실제 축제/티켓 제휴처
// 연동은 이번 지시서 범위 밖이라(추측 금지) 지시서가 명시적으로 요청한 "샘플 데이터"만
// 채운다 — deals처럼 실제 상거래 데이터를 다루는 테이블이 아니라 화면 검증용 표본 데이터를
// 요구한 것이라 가짜 데이터 금지 원칙에 해당하지 않는다.
//
// 멱등성: event_tickets에 이미 행이 있으면 아무 것도 하지 않는다(반복 실행해도 중복
// 삽입되지 않음). 실행: node scripts/seed-event-tickets.mjs
import { pathToFileURL } from 'url';
import { createAdminClient } from './ingest/lib/supabase-admin.mjs';
import { loadEnv } from './lib/load-env.mjs';

loadEnv();

export const SAMPLE_EVENT_TICKETS = [
  {
    title: '가을 단풍 나들이 축제',
    description: '온 가족이 함께 즐기는 가을 단풍길 산책과 지역 농산물 장터, 어린이 체험 부스가 함께 열립니다.',
    category: '지역축제',
    event_period: '2026-10-01 ~ 2026-10-10',
    location_name: '중앙공원 일대',
    original_price: 10000,
    discount_price: 6000,
    discount_rate: 40,
    image_url: null,
    booking_url: 'https://example.com/tickets/autumn-festival',
    is_active: true,
  },
  {
    title: '키즈 체험 페스티벌 입장권',
    description: '유아/어린이 대상 안전 체험 프로그램 20종을 자유이용권 하나로 즐길 수 있는 행사입니다.',
    category: '체험프로그램',
    event_period: '2026-09-15 ~ 2026-09-30',
    location_name: '실내 컨벤션홀',
    original_price: 25000,
    discount_price: 15000,
    discount_rate: 40,
    image_url: null,
    booking_url: 'https://example.com/tickets/kids-festival',
    is_active: true,
  },
  {
    title: '실내 워터파크 가족 이용권',
    description: '4인 가족 기준 실내 워터파크 종일 이용권 할인 티켓입니다(우천/미세먼지와 무관하게 이용 가능).',
    category: '입장권',
    event_period: '상시(연중무휴)',
    location_name: '실내 워터파크',
    original_price: 120000,
    discount_price: 79000,
    discount_rate: 34,
    image_url: null,
    booking_url: 'https://example.com/tickets/waterpark',
    is_active: true,
  },
  {
    title: '동물원 주말 가족 입장권',
    description: '주말 한정 동물원 입장권 할인가 — 사육사 해설 프로그램이 함께 포함됩니다.',
    category: '입장권',
    event_period: '매주 토·일',
    location_name: '시립 동물원',
    original_price: 18000,
    discount_price: 12000,
    discount_rate: 33,
    image_url: null,
    booking_url: 'https://example.com/tickets/zoo-weekend',
    is_active: true,
  },
  {
    title: '농촌 체험 마을 당일치기 프로그램',
    description: '고구마 캐기, 떡메치기 등 계절 체험과 점심 식사가 포함된 당일 프로그램입니다.',
    category: '체험프로그램',
    event_period: '2026-09-01 ~ 2026-11-30',
    location_name: '농촌 체험 마을',
    original_price: 35000,
    discount_price: 28000,
    discount_rate: 20,
    image_url: null,
    booking_url: 'https://example.com/tickets/farm-experience',
    is_active: true,
  },
];

export async function seedEventTickets(client) {
  const { count, error: countError } = await client
    .from('event_tickets')
    .select('id', { count: 'exact', head: true });
  if (countError) throw new Error(`event_tickets 카운트 조회 실패: ${countError.message}`);

  if ((count ?? 0) > 0) {
    console.log(`  이미 ${count}건 존재해 샘플 데이터를 넣지 않습니다(멱등 처리).`);
    return { inserted: 0, skipped: true };
  }

  const { error } = await client.from('event_tickets').insert(SAMPLE_EVENT_TICKETS);
  if (error) throw new Error(`event_tickets 샘플 삽입 실패: ${error.message}`);

  console.log(`✅ 샘플 이벤트/티켓 ${SAMPLE_EVENT_TICKETS.length}건 삽입 완료`);
  return { inserted: SAMPLE_EVENT_TICKETS.length, skipped: false };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const client = createAdminClient();
  seedEventTickets(client).catch((err) => {
    console.error('❌', err.message);
    process.exit(1);
  });
}
