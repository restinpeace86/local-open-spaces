// [배치 결과 디스코드 알림 — 재사용 함수 분리](2026-10-07 todo.md 개선사항2-4):
// 이 스크립트는 원래 하네스 전용 CLI였다 — sendDiscordNotification을 export
// 함수로 분리해 다른 배치 스크립트(이마트 크롤러 등)가 재사용할 수 있게
// 했다. 웹훅 전송/누락 시 동작을 검증한다. loadEnv()는 실제 .env.local
// 파일을 읽어 process.env를 덮어쓰므로(이 리포에 실제 DISCORD_WEBHOOK_URL이
// 설정돼 있다), 테스트가 실제 비밀값에 의존하지 않도록 ./lib/load-env.mjs
// 자체를 모킹한다.
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('sendDiscordNotification', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock('./lib/load-env.mjs');
    vi.resetModules();
  });

  it('DISCORD_WEBHOOK_URL이 없으면 조용히 건너뛴다(예외를 던지지 않음)', async () => {
    vi.doMock('./lib/load-env.mjs', () => ({ loadEnv: () => ({}) }));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { sendDiscordNotification } = await import('./notify-discord.mjs');
    await expect(sendDiscordNotification({ title: 'x' })).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('웹훅 URL이 있으면 제목/내용/상태를 담아 전송한다', async () => {
    vi.doMock('./lib/load-env.mjs', () => ({ loadEnv: () => ({ DISCORD_WEBHOOK_URL: 'https://discord.test/webhook' }) }));
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const { sendDiscordNotification } = await import('./notify-discord.mjs');
    await sendDiscordNotification({ title: '✅ 이마트 배치 완료', description: '120건 수집', status: '12.3초' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://discord.test/webhook');
    const body = JSON.parse(options.body);
    expect(body.embeds[0].title).toBe('✅ 이마트 배치 완료');
    expect(body.embeds[0].description).toBe('120건 수집');
    expect(body.embeds[0].fields[0].value).toBe('12.3초');
  });

  it('Discord API가 에러 응답을 주면 예외를 던진다', async () => {
    vi.doMock('./lib/load-env.mjs', () => ({ loadEnv: () => ({ DISCORD_WEBHOOK_URL: 'https://discord.test/webhook' }) }));
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 500 })));

    const { sendDiscordNotification } = await import('./notify-discord.mjs');
    await expect(sendDiscordNotification({ title: 'x' })).rejects.toThrow('500');
  });
});
