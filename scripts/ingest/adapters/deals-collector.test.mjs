// [제휴 특가 Deals 시스템 및 수집 어댑터 MVP](2026-08-29 사용자 지시) 단위 테스트
// - transformDealItem: RawDealItem → deals 행 변환(할인율 계산/유효성 검증)
// - upsertDeals: affiliate_url 충돌 키 upsert
// - collectDeals: fetch가 아직 미구현임을 명확히 드러내는지(뼈대 확인)
import { describe, expect, it } from 'vitest';
import { collectDeals, transformDealItem, upsertDeals } from './deals-collector.mjs';

describe('transformDealItem', () => {
  it('정상 항목을 deals 행으로 변환하고 할인율을 가격으로부터 계산한다', () => {
    const row = transformDealItem({
      title: '한우 세트',
      description: '설 명절 한우 선물세트',
      originalPrice: 100000,
      discountPrice: 70000,
      imageUrl: 'https://example.com/beef.jpg',
      affiliateUrl: 'https://link.coupang.com/a/beef',
    });

    expect(row).toEqual({
      title: '한우 세트',
      description: '설 명절 한우 선물세트',
      original_price: 100000,
      discount_price: 70000,
      discount_rate: 30,
      image_url: 'https://example.com/beef.jpg',
      affiliate_url: 'https://link.coupang.com/a/beef',
      is_active: true,
    });
  });

  it('discountRate가 원본에 이미 있으면 계산 대신 그 값을 쓴다(0~100 범위로 보정)', () => {
    const row = transformDealItem({
      title: '특가 상품',
      originalPrice: 10000,
      discountPrice: 9000,
      discountRate: 150, // 비정상 값도 100으로 clamp
      affiliateUrl: 'https://link.coupang.com/a/x',
    });

    expect(row.discount_rate).toBe(100);
  });

  it('title 또는 affiliateUrl이 없으면 드롭한다(null 반환)', () => {
    expect(
      transformDealItem({ originalPrice: 1000, discountPrice: 900, affiliateUrl: 'https://x.com' })
    ).toBeNull();
    expect(transformDealItem({ title: '상품', originalPrice: 1000, discountPrice: 900 })).toBeNull();
  });

  it('할인가가 정가보다 크면 드롭한다', () => {
    expect(
      transformDealItem({
        title: '이상한 상품',
        originalPrice: 1000,
        discountPrice: 2000,
        affiliateUrl: 'https://x.com',
      })
    ).toBeNull();
  });

  it('가격이 숫자가 아니면 드롭한다', () => {
    expect(
      transformDealItem({
        title: '상품',
        originalPrice: 'free',
        discountPrice: 900,
        affiliateUrl: 'https://x.com',
      })
    ).toBeNull();
  });
});

describe('upsertDeals', () => {
  it('affiliate_url을 충돌 키로 upsert를 호출한다', async () => {
    let capturedArgs;
    const fakeClient = {
      from: () => ({
        upsert: (rows, options) => {
          capturedArgs = { rows, options };
          return Promise.resolve({ error: null });
        },
      }),
    };

    const rows = [{ title: 'a', affiliate_url: 'https://x.com' }];
    const result = await upsertDeals(fakeClient, rows);

    expect(result).toEqual({ count: 1 });
    expect(capturedArgs.options).toEqual({ onConflict: 'affiliate_url' });
    // [코드 점검 및 성능 안정화](2026-09-01 사용자 지시) 항목 2: 이제 500건 청크로
    // slice()해서 넘기므로(대량 유입 대비) 원본 배열과 참조가 아니라 내용만 같다.
    expect(capturedArgs.rows).toEqual(rows);
  });

  it('행이 0건이면 upsert를 호출하지 않는다', async () => {
    const fakeClient = { from: () => ({ upsert: () => Promise.reject(new Error('호출되면 안 됨')) }) };
    const result = await upsertDeals(fakeClient, []);
    expect(result).toEqual({ count: 0 });
  });

  it('upsert 에러 시 명확한 메시지로 던진다', async () => {
    const fakeClient = {
      from: () => ({ upsert: () => Promise.resolve({ error: { message: 'DB 오류' } }) }),
    };
    await expect(upsertDeals(fakeClient, [{ affiliate_url: 'x' }])).rejects.toThrow('deals upsert 실패: DB 오류');
  });

  // [코드 점검 및 성능 안정화](2026-09-01 사용자 지시) 항목 2: playground.mjs가 실제로
  // 겪었던 "대량 행을 단일 upsert 호출에 몰아넣어 응답 없이 멈추는" 문제를 재현하지
  // 않도록, 500건을 넘으면 여러 번의 upsert 호출로 쪼개지는지 확인한다.
  it('500건을 넘으면 여러 번의 upsert 호출로 청크 처리한다', async () => {
    const calls = [];
    const fakeClient = {
      from: () => ({
        upsert: (batch) => {
          calls.push(batch.length);
          return Promise.resolve({ error: null });
        },
      }),
    };

    const rows = Array.from({ length: 1200 }, (_, i) => ({ affiliate_url: `https://x.com/${i}` }));
    const result = await upsertDeals(fakeClient, rows);

    expect(result).toEqual({ count: 1200 });
    expect(calls).toEqual([500, 500, 200]);
  });
});

describe('collectDeals (뼈대 확인)', () => {
  it('실제 제휴 API가 아직 연동되지 않아 명확한 미구현 에러를 던진다', async () => {
    await expect(collectDeals({ dryRun: true })).rejects.toThrow('fetchDealsFromAffiliateApi()는 아직 구현되지 않았습니다');
  });
});
