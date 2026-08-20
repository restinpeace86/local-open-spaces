import { expect, test } from '@playwright/test';
import { preparePage } from './support/mocks';
import { visible, visibleButton } from './support/locators';
// tests/e2e/support/kakao-test-state.d.ts: window.__kakaoTestState 전역 타입은 tsconfig 포함 범위 내에서
// 별도 import 없이 전역으로 병합된다.

// implementation/todo.md 핵심 사용자 시나리오 E2E 통합 테스트.
// playwright.config.ts의 Mobile(390px)/Desktop(1280px) 프로젝트가 각 테스트를 두 뷰포트에서 각각 실행한다.

test.describe('시나리오 1: Header 알림 설정 모달 열기/닫기 및 LocalStorage 상태 변경', () => {
  test('벨 아이콘으로 팝오버를 열고/닫고, 설정 변경이 LocalStorage에 즉시 반영되며 닫아도 유지된다', async ({ page }) => {
    await preparePage(page);

    const popover = page.locator('div.w-80');
    const bell = page.getByRole('button', { name: '알림', exact: true });
    // notification-bell.tsx: 팝오버가 열리면 전체 화면을 덮는 바깥 클릭 감지용 오버레이(fixed inset-0 z-40)가
    // 벨 버튼 위까지 뒤덮어 클릭을 가로챈다. 실제 사용자도 이 오버레이를 클릭해 팝오버를 닫으므로 동일하게 검증한다.
    const outsideOverlay = page.locator('div.fixed.inset-0.z-40');

    // 최초에는 팝오버가 닫혀 있고, 알림 설정 LocalStorage 키가 아직 생성되지 않았다.
    await expect(popover).toBeHidden();
    expect(await page.evaluate(() => window.localStorage.getItem('user_notification_settings'))).toBeNull();

    // 열기
    await bell.click();
    await expect(popover).toBeVisible();
    await expect(popover.getByText('알림함', { exact: true })).toBeVisible();

    // 닫기 (팝오버 바깥 영역 클릭)
    await outsideOverlay.click();
    await expect(popover).toBeHidden();

    // 다시 열고 설정 화면으로 진입
    await bell.click();
    await popover.getByRole('button', { name: '알림 설정', exact: true }).click();
    await expect(popover.getByText('맞춤 알림 받기', { exact: true })).toBeVisible();

    // 옵션 변경 시 즉시 LocalStorage에 반영되는지 각각 검증
    await popover.getByLabel('맞춤 알림 받기').check();
    let stored = await page.evaluate(() => window.localStorage.getItem('user_notification_settings'));
    expect(JSON.parse(stored ?? 'null')).toMatchObject({ enabled: true });

    await popover.getByRole('button', { name: '20km', exact: true }).click();
    stored = await page.evaluate(() => window.localStorage.getItem('user_notification_settings'));
    expect(JSON.parse(stored ?? 'null')).toMatchObject({ radius: '20km' });

    await popover.getByRole('button', { name: '영유아', exact: true }).click();
    stored = await page.evaluate(() => window.localStorage.getItem('user_notification_settings'));
    expect(JSON.parse(stored ?? 'null')).toMatchObject({ target_ages: ['infant'] });

    await popover.getByLabel('예약 마감 D-1 알림').check();
    stored = await page.evaluate(() => window.localStorage.getItem('user_notification_settings'));
    expect(JSON.parse(stored ?? 'null')).toEqual({
      enabled: true,
      radius: '20km',
      target_ages: ['infant'],
      d_minus_one_alert: true,
    });

    // 목록 화면으로 복귀 후 팝오버를 닫아도 값이 유지된다
    await popover.getByRole('button', { name: '알림 설정', exact: true }).click();
    await expect(popover.getByText('알림함', { exact: true })).toBeVisible();

    await outsideOverlay.click();
    await expect(popover).toBeHidden();

    stored = await page.evaluate(() => window.localStorage.getItem('user_notification_settings'));
    expect(JSON.parse(stored ?? 'null')).toEqual({
      enabled: true,
      radius: '20km',
      target_ages: ['infant'],
      d_minus_one_alert: true,
    });
  });
});

test.describe('시나리오 2: Quick 필터 클릭 시 카드 뱃지/스크리닝 결과 검증', () => {
  test('키즈/무료/오늘·주말 필터 각각과 다중 선택(AND) 결과가 리스트/뱃지와 100% 일치한다', async ({ page }) => {
    await preparePage(page);

    const list = visible(page, 'ul');
    const rowByName = (name: string) => list.locator('li', { hasText: name });

    const KIDS = '👶 키즈';
    const FREE = '🎁 무료';
    const TODAY_WEEKEND = '⚡ 오늘/주말';

    const A = '키즈 무료 체험 마당'; // is_free, is_kids_friendly
    const B = '성인 유료 팝업 전시'; // 예약 불필요, 오늘 기간 포함
    const C = '영유아 무료 체험 프로그램'; // is_free, target_age_group=영유아
    const D = '예약 필수 유료 공연'; // is_reservation_required=true
    const E = '초등 대상 유료 강좌'; // target_age_group=초등, 기간이 먼 미래라 오늘/주말 불포함

    // 필터 미선택: 5건 모두 노출
    await expect(list).toBeVisible();
    for (const name of [A, B, C, D, E]) {
      await expect(rowByName(name)).toHaveCount(1);
    }

    // 👶 키즈: A, C, E 만 노출되고 각각 근거 뱃지를 표시한다
    await visibleButton(page, KIDS).click();
    await expect(rowByName(A)).toHaveCount(1);
    await expect(rowByName(A).getByText('👶 키즈/어린이', { exact: true })).toBeVisible();
    await expect(rowByName(C)).toHaveCount(1);
    await expect(rowByName(C).getByText('👶 유아전용', { exact: true })).toBeVisible();
    await expect(rowByName(E)).toHaveCount(1);
    await expect(rowByName(E).getByText('👶 키즈/어린이', { exact: true })).toBeVisible();
    await expect(rowByName(B)).toHaveCount(0);
    await expect(rowByName(D)).toHaveCount(0);

    // 🎁 무료 추가 선택(다중 선택 AND): 키즈 ∩ 무료 = A, C
    await visibleButton(page, FREE).click();
    await expect(rowByName(A)).toHaveCount(1);
    await expect(rowByName(A).getByText(FREE, { exact: true })).toBeVisible();
    await expect(rowByName(C)).toHaveCount(1);
    await expect(rowByName(C).getByText(FREE, { exact: true })).toBeVisible();
    await expect(rowByName(E)).toHaveCount(0); // 무료가 아니라서 제외

    // 필터 초기화 후 🎁 무료 단독 선택: A, C 만 노출
    await visibleButton(page, KIDS).click(); // 키즈 해제
    await expect(rowByName(A)).toHaveCount(1);
    await expect(rowByName(C)).toHaveCount(1);
    await expect(rowByName(B)).toHaveCount(0);
    await expect(rowByName(D)).toHaveCount(0);
    await expect(rowByName(E)).toHaveCount(0);

    // 필터 초기화 후 ⚡ 오늘/주말 단독 선택: A, B, C 노출 (예약 필수 D, 기간 먼 E 제외)
    await visibleButton(page, FREE).click(); // 무료 해제
    await visibleButton(page, TODAY_WEEKEND).click();
    await expect(rowByName(A)).toHaveCount(1);
    await expect(rowByName(B)).toHaveCount(1);
    await expect(rowByName(C)).toHaveCount(1);
    await expect(rowByName(D)).toHaveCount(0);
    await expect(rowByName(E)).toHaveCount(0);
  });
});

test.describe('시나리오 3: 반경 버튼 20km/30km 팝업 노출 + 필터 선택 후 해금 + 지도 자동 줌/클러스터링', () => {
  test('필터 미선택 시 팝업이 뜨고, 필터 선택 후에는 팝업 없이 반경이 적용되며 지도가 자동으로 재조정된다', async ({
    page,
  }) => {
    await preparePage(page);

    // 초기 지도 마운트 시 반경 원(circle) 기준 자동 줌(setBounds) 1회 발생을 기다린다.
    await page.waitForFunction(() => (window.__kakaoTestState?.setBoundsCalls.length ?? 0) >= 1);

    const promptText = '광역 범위를 사용할 수 있습니다';
    const cancelButton = page.getByRole('button', { name: '아니오', exact: true });
    // radius-selector.tsx: 잠긴 20km/30km는 실제 disabled 속성이 아닌 aria-disabled 스타일링일 뿐이며
    // onClick으로 안내 팝업을 띄우는 것이 의도된 동작이다. Playwright의 기본 actionability 검사는
    // aria-disabled=true를 클릭 불가로 간주해 대기하므로, 실제 사용자의 클릭과 동일하게 강제로 클릭한다.
    const clickLockedRadius = (label: string) => visibleButton(page, label).click({ force: true });

    // 카테고리/Quick 필터 미선택 상태: 20km 클릭 시 광역 안내 팝업 노출
    await clickLockedRadius('20km');
    await expect(page.getByText(promptText)).toBeVisible();
    await cancelButton.click();
    await expect(page.getByText(promptText)).toBeHidden();

    // 30km도 동일하게 팝업 노출
    await clickLockedRadius('30km');
    await expect(page.getByText(promptText)).toBeVisible();
    await cancelButton.click();
    await expect(page.getByText(promptText)).toBeHidden();

    // Quick 필터를 1개 선택하면 20km/30km 광역 반경이 해금된다
    await visibleButton(page, '👶 키즈').click();

    const boundsCallsBeforeUnlock = await page.evaluate(
      () => window.__kakaoTestState?.setBoundsCalls.length ?? 0
    );
    const addMarkersCallsBeforeUnlock = await page.evaluate(
      () => window.__kakaoTestState?.addMarkersCalls.length ?? 0
    );

    await visibleButton(page, '20km').click();

    // 팝업이 뜨지 않고 즉시 20km가 적용된다
    await expect(page.getByText(promptText)).toBeHidden();
    await expect(visibleButton(page, '20km')).toHaveClass(/bg-blue-600/);

    // 반경 변경으로 지도 뷰가 새 반경 원에 맞춰 자동 재조정(setBounds)되고,
    // 새로 조회된 데이터로 마커 클러스터링이 재수행(addMarkers)된다.
    await page.waitForFunction(
      (prevCount) => (window.__kakaoTestState?.setBoundsCalls.length ?? 0) > prevCount,
      boundsCallsBeforeUnlock
    );
    await page.waitForFunction(
      (prevCount) => (window.__kakaoTestState?.addMarkersCalls.length ?? 0) > prevCount,
      addMarkersCallsBeforeUnlock
    );
  });
});
