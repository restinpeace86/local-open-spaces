// [제휴 특가 Deals 시스템 및 수집 어댑터 MVP](2026-08-29 사용자 지시)
//
// 쿠팡 파트너스/네이버 쇼핑 등 제휴 마케팅 API 상품 데이터를 deals 테이블에 upsert하는
// 수집 스크립트의 뼈대(지시서 원문: "수집 스크립트/함수의 뼈대를 마련해 주세요"). 지시서가
// 특정 API 하나를 확정하지 않고 "쿠팡 파트너스나 네이버 쇼핑 등"으로 예시만 들었고, 실제
// 연동에 필요한 API 키/시크릿도 아직 없다 — 어떤 API를 쓸지, 정확한 응답 필드명이 무엇인지
// 추측으로 구현하지 않는다(제3장 제5조 추측 금지). 대신 어떤 제휴 API를 연동하든 그대로
// 재사용 가능하도록, 원본 API 응답을 아래 RawDealItem 형태(표준 중간 형태)로만 맞춰 fetch()가
// 반환하게 하면 transform()/collectDeals()는 수정 없이 그대로 동작하는 구조로 만든다.
//
// 실제 연동 시 남은 작업: fetchDealsFromAffiliateApi()의 내용을 실제 API 호출(인증 포함,
// 예: 쿠팡파트너스 HMAC 서명 헤더)로 교체하고, 그 응답을 RawDealItem[] 형태로 매핑하면 된다.
// deals 테이블은 open_spaces/events와 성격이 달라(위치 기반 공간/행사가 아닌 커머스 상품)
// BaseCollectorAdapter를 상속하지 않는다 — 그 베이스 클래스는 external_id 기준 dedup/지오코딩
// 등 위치 데이터 파이프라인에 결합돼 있어(base-collector-adapter.mjs, targetTable이
// 'open_spaces'|'events'|'multi'만 허용) 그대로 재사용하면 오히려 억지 끼워맞추기가 된다.

import { createAdminClient } from '../lib/supabase-admin.mjs';

/**
 * @typedef {Object} RawDealItem
 * @property {string} title - 상품명
 * @property {string} [description] - 설명
 * @property {number} originalPrice - 정가(원)
 * @property {number} discountPrice - 할인가(원)
 * @property {number} [discountRate] - 할인율(%), 생략 시 가격으로부터 계산
 * @property {string} [imageUrl] - 상품 이미지 URL
 * @property {string} affiliateUrl - 제휴 트래킹 링크(deals.affiliate_url unique 충돌 키)
 */

// 뼈대: 실제 제휴 API가 확정되면 이 함수 내부를 실제 HTTP 호출로 교체한다. 현재는 어떤
// API/키를 쓸지 정해지지 않아 명시적으로 미구현 처리한다(가짜 데이터로 채우지 않음).
export async function fetchDealsFromAffiliateApi() {
  throw new Error(
    'fetchDealsFromAffiliateApi()는 아직 구현되지 않았습니다 — 실제 제휴 API(쿠팡파트너스/네이버쇼핑 등) 확정 및 API 키 발급 후, 응답을 RawDealItem[] 형태로 매핑해 반환하도록 이 함수를 채워 넣으세요.'
  );
}

// RawDealItem 1건을 deals 테이블 행으로 변환한다. 필수 필드가 없거나 가격이 비정상이면
// null을 반환해 드롭한다(수집 파이프라인 공통 관례 — 무중단 처리, 제5장 제11조).
export function transformDealItem(item) {
  if (!item || typeof item !== 'object') return null;

  const title = typeof item.title === 'string' ? item.title.trim() : '';
  const affiliateUrl = typeof item.affiliateUrl === 'string' ? item.affiliateUrl.trim() : '';
  const originalPrice = Number(item.originalPrice);
  const discountPrice = Number(item.discountPrice);

  if (!title || !affiliateUrl) return null;
  if (!Number.isFinite(originalPrice) || originalPrice < 0) return null;
  if (!Number.isFinite(discountPrice) || discountPrice < 0 || discountPrice > originalPrice) return null;

  const discountRate =
    typeof item.discountRate === 'number' && Number.isFinite(item.discountRate)
      ? Math.max(0, Math.min(100, Math.round(item.discountRate)))
      : originalPrice > 0
      ? Math.round(((originalPrice - discountPrice) / originalPrice) * 100)
      : 0;

  return {
    title,
    description: typeof item.description === 'string' ? item.description.trim() || null : null,
    original_price: Math.round(originalPrice),
    discount_price: Math.round(discountPrice),
    discount_rate: discountRate,
    image_url: typeof item.imageUrl === 'string' ? item.imageUrl.trim() || null : null,
    affiliate_url: affiliateUrl,
    is_active: true,
  };
}

// affiliate_url을 충돌 키로 upsert한다 — deals는 external_id 체계(위치 기반 소스 전용)를 쓰지
// 않으므로 scripts/ingest/lib/supabase-admin.mjs의 공용 upsertRows()를 재사용하지 않는다.
export async function upsertDeals(client, rows) {
  if (rows.length === 0) return { count: 0 };
  const { error } = await client.from('deals').upsert(rows, { onConflict: 'affiliate_url' });
  if (error) throw new Error(`deals upsert 실패: ${error.message}`);
  return { count: rows.length };
}

// fetch → transform → upsert 오케스트레이션(뼈대). dryRun이면 실제 upsert 없이 변환 결과만 본다.
export async function collectDeals({ dryRun = false } = {}) {
  console.log(`▶ [DEALS] 수집 시작 (dry-run: ${dryRun})`);
  const rawItems = await fetchDealsFromAffiliateApi();
  const rows = rawItems.map(transformDealItem).filter(Boolean);
  console.log(`  표준 스키마 변환 완료: ${rows.length}건 (수신 ${rawItems.length}건 중)`);

  if (dryRun) {
    console.log(JSON.stringify(rows.slice(0, 3), null, 2));
    return { count: rows.length, upserted: false };
  }
  if (rows.length === 0) {
    console.log('  upsert할 유효 행이 없어 종료합니다.');
    return { count: 0, upserted: true };
  }

  const client = createAdminClient();
  const { count } = await upsertDeals(client, rows);
  console.log(`✅ [DEALS] Supabase deals upsert 완료: ${count}건`);
  return { count, upserted: true };
}
