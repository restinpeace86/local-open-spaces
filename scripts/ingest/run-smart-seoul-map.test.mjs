import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function makeFakeAdapter({ sourceKey, badgeKey, count = 2 }) {
  return {
    sourceKey,
    badgeKey,
    lastExternalIds: ['ext-1', 'ext-2'],
    run: vi.fn(async ({ dryRun } = {}) => ({ count, upserted: !dryRun })),
  };
}

describe('run-smart-seoul-map run()', () => {
  let adapters;
  let applyCurationBadgeMock;

  beforeEach(() => {
    vi.resetModules();

    adapters = {
      kidsCafe: makeFakeAdapter({ sourceKey: 'SMART_SEOUL_KIDS_CAFE', badgeKey: 'kc_seoul_type' }),
      voucher: makeFakeAdapter({ sourceKey: 'SMART_SEOUL_KIDS_CAFE_VOUCHER', badgeKey: 'kc_voucher_accepted' }),
      camping: makeFakeAdapter({ sourceKey: 'SMART_SEOUL_CAMPING', badgeKey: 'CAMPING_SEOUL_OPERATED' }),
      okZone: makeFakeAdapter({ sourceKey: 'SMART_SEOUL_OK_ZONE', badgeKey: 'ok_zone_certified' }),
      forest: makeFakeAdapter({ sourceKey: 'SMART_SEOUL_TODDLER_FOREST', badgeKey: null }),
    };
    applyCurationBadgeMock = vi.fn().mockResolvedValue({ taggedCount: 2 });

    vi.doMock('./lib/supabase-admin.mjs', () => ({ createAdminClient: () => ({ marker: 'admin' }) }));
    vi.doMock('./lib/apply-curation-badge.mjs', () => ({ applyCurationBadgeToExternalIds: applyCurationBadgeMock }));
    vi.doMock('./adapters/smart-seoul-kids-cafe-adapter.mjs', () => ({
      SmartSeoulKidsCafeAdapter: function SmartSeoulKidsCafeAdapter() {
        return adapters.kidsCafe;
      },
    }));
    vi.doMock('./adapters/smart-seoul-kids-cafe-voucher-adapter.mjs', () => ({
      SmartSeoulKidsCafeVoucherAdapter: function SmartSeoulKidsCafeVoucherAdapter() {
        return adapters.voucher;
      },
    }));
    vi.doMock('./adapters/smart-seoul-camping-adapter.mjs', () => ({
      SmartSeoulCampingAdapter: function SmartSeoulCampingAdapter() {
        return adapters.camping;
      },
    }));
    vi.doMock('./adapters/smart-seoul-ok-zone-adapter.mjs', () => ({
      SmartSeoulOkZoneAdapter: function SmartSeoulOkZoneAdapter() {
        return adapters.okZone;
      },
    }));
    vi.doMock('./adapters/smart-seoul-toddler-forest-adapter.mjs', () => ({
      SmartSeoulToddlerForestAdapter: function SmartSeoulToddlerForestAdapter() {
        return adapters.forest;
      },
    }));
  });

  afterEach(() => {
    vi.doUnmock('./lib/supabase-admin.mjs');
    vi.doUnmock('./lib/apply-curation-badge.mjs');
    vi.doUnmock('./adapters/smart-seoul-kids-cafe-adapter.mjs');
    vi.doUnmock('./adapters/smart-seoul-kids-cafe-voucher-adapter.mjs');
    vi.doUnmock('./adapters/smart-seoul-camping-adapter.mjs');
    vi.doUnmock('./adapters/smart-seoul-ok-zone-adapter.mjs');
    vi.doUnmock('./adapters/smart-seoul-toddler-forest-adapter.mjs');
  });

  it('5개 어댑터를 전부 실행하고, badgeKey가 있는 것만 뱃지를 적용한다', async () => {
    const { run } = await import('./run-smart-seoul-map.mjs');

    const results = await run();

    expect(adapters.kidsCafe.run).toHaveBeenCalledWith({ dryRun: false });
    expect(adapters.voucher.run).toHaveBeenCalledWith({ dryRun: false });
    expect(adapters.camping.run).toHaveBeenCalledWith({ dryRun: false });
    expect(adapters.okZone.run).toHaveBeenCalledWith({ dryRun: false });
    expect(adapters.forest.run).toHaveBeenCalledWith({ dryRun: false });

    // 유아숲체험원은 badgeKey가 없어 뱃지 적용 호출에서 제외된다.
    expect(applyCurationBadgeMock).toHaveBeenCalledTimes(4);
    expect(applyCurationBadgeMock).toHaveBeenCalledWith(expect.anything(), ['ext-1', 'ext-2'], 'kc_seoul_type');
    expect(applyCurationBadgeMock).toHaveBeenCalledWith(expect.anything(), ['ext-1', 'ext-2'], 'ok_zone_certified');

    expect(results).toHaveLength(5);
    expect(results.find((r) => r.sourceKey === 'SMART_SEOUL_TODDLER_FOREST').taggedCount).toBe(0);
    expect(results.find((r) => r.sourceKey === 'SMART_SEOUL_OK_ZONE').taggedCount).toBe(2);
  });

  it('--only에 해당하는 소스 하나만 실행한다', async () => {
    const { run } = await import('./run-smart-seoul-map.mjs');
    const results = await run({ only: 'SMART_SEOUL_CAMPING' });

    expect(adapters.kidsCafe.run).not.toHaveBeenCalled();
    expect(adapters.camping.run).toHaveBeenCalled();
    expect(results).toHaveLength(1);
    expect(results[0].sourceKey).toBe('SMART_SEOUL_CAMPING');
  });

  it('dryRun=true면 뱃지를 적용하지 않는다', async () => {
    const { run } = await import('./run-smart-seoul-map.mjs');

    await run({ dryRun: true });

    expect(adapters.kidsCafe.run).toHaveBeenCalledWith({ dryRun: true });
    expect(applyCurationBadgeMock).not.toHaveBeenCalled();
  });
});
