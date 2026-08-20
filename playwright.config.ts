import { defineConfig, devices } from '@playwright/test';

// implementation/todo.md: 핵심 사용자 시나리오 E2E 통합 테스트 - PC/모바일 뷰포트 각각 검증
// 공공 API/Supabase/Kakao Maps 실 네트워크 호출은 tests/e2e/support/mocks.ts에서 라우트 가로채기로
// 대체하므로(Zero-Cost 원칙), 실제 API 키/도메인 화이트리스트 없이도 CI에서 결정론적으로 동작한다.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'Mobile',
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } },
    },
    {
      name: 'Desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    // implementation/todo.md: next dev(Turbopack HMR)는 병렬 워커가 동시에 첫 컴파일을 트리거하면
    // 청크가 무효화되며 ERR_ABORTED가 발생해 테스트가 불안정해진다. 프로덕션 빌드로 고정해 결정론적으로 실행한다.
    command: 'npm run build && npm run start',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key',
      NEXT_PUBLIC_KAKAO_MAP_API_KEY: process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY ?? 'placeholder-kakao-key',
    },
  },
});
