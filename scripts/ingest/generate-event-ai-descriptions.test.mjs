import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/load-env.mjs', () => ({ loadEnv: vi.fn() }));

const generateDescriptionMock = vi.fn();
vi.mock('./lib/event-ai-description.mjs', () => ({ generateDescription: (...args) => generateDescriptionMock(...args) }));

const eventsSelectMock = vi.fn();
const eventsUpdateMock = vi.fn();
const momPickSelectMock = vi.fn();

vi.mock('./lib/supabase-admin.mjs', () => ({
  createAdminClient: () => ({
    from: (table) => {
      if (table === 'events') {
        return {
          select: eventsSelectMock,
          update: eventsUpdateMock,
        };
      }
      if (table === 'mom_pick_posts') {
        return { select: momPickSelectMock };
      }
      throw new Error(`예상치 못한 테이블: ${table}`);
    },
  }),
}));

// [PostgREST 페이지네이션 대응] 실제 코드는 .range()까지 호출해야 결과가 나온다
// (1,000건 묵시적 상한 수정). 테스트용 결과가 1,000건 미만이면(항상 그렇다) 루프가
// 첫 페이지에서 바로 멈춘다.
function buildEventsSelectChain(result) {
  const chain = {};
  chain.eq = () => chain;
  chain.not = () => chain;
  chain.is = () => chain;
  chain.order = () => chain;
  chain.range = () => Promise.resolve(result);
  return chain;
}

const { fetchCandidates, run } = await import('./generate-event-ai-descriptions.mjs');

describe('generate-event-ai-descriptions', () => {
  beforeEach(() => {
    generateDescriptionMock.mockReset();
    eventsSelectMock.mockReset();
    eventsUpdateMock.mockReset();
    momPickSelectMock.mockReset();
    eventsUpdateMock.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    momPickSelectMock.mockReturnValue({ not: vi.fn().mockResolvedValue({ data: [], error: null }) });
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
  });

  describe('fetchCandidates', () => {
    it('리뷰가 있는 이벤트를 먼저, 나머지는 최신순으로 정렬해 batchSize만큼만 돌려준다', async () => {
      const rows = [
        { id: 'a', title: '오래된 글(리뷰 없음)', description: '설명A', created_at: '2026-01-01T00:00:00Z' },
        { id: 'b', title: '최신 글(리뷰 없음)', description: '설명B', created_at: '2026-10-01T00:00:00Z' },
        { id: 'c', title: '인기 글(리뷰 있음)', description: '설명C', created_at: '2026-01-05T00:00:00Z' },
      ];
      eventsSelectMock.mockReturnValue(buildEventsSelectChain({ data: rows, error: null }));
      momPickSelectMock.mockReturnValue({ not: vi.fn().mockResolvedValue({ data: [{ event_id: 'c' }], error: null }) });

      const client = { from: (t) => (t === 'events' ? { select: eventsSelectMock } : { select: momPickSelectMock }) };
      const { rows: result, totalCandidates } = await fetchCandidates(client, 2);

      expect(totalCandidates).toBe(3);
      expect(result.map((r) => r.id)).toEqual(['c', 'b']);
    });

    it('한 페이지(1,000건)를 넘는 후보도 .range() 페이지네이션으로 전부 가져온다(2026-10-21 실측 버그 수정)', async () => {
      // 실제 PostgREST 1,000건 묵시적 상한을 재현: 첫 페이지는 꽉 찬 1,000건,
      // 두 번째 페이지는 나머지 1건만 와서 루프가 멈춰야 한다.
      const page1 = Array.from({ length: 1000 }, (_, i) => ({
        id: `p1-${i}`,
        title: `제목${i}`,
        description: '설명',
        created_at: '2026-01-01T00:00:00Z',
      }));
      const page2 = [{ id: 'p2-0', title: '마지막건', description: '설명', created_at: '2026-01-02T00:00:00Z' }];
      let callCount = 0;
      const chain = {};
      chain.eq = () => chain;
      chain.not = () => chain;
      chain.is = () => chain;
      chain.order = () => chain;
      chain.range = () => {
        callCount += 1;
        return Promise.resolve({ data: callCount === 1 ? page1 : page2, error: null });
      };
      eventsSelectMock.mockReturnValue(chain);
      momPickSelectMock.mockReturnValue({ not: vi.fn().mockResolvedValue({ data: [], error: null }) });

      const client = { from: (t) => (t === 'events' ? { select: eventsSelectMock } : { select: momPickSelectMock }) };
      const { totalCandidates } = await fetchCandidates(client, 10);

      expect(totalCandidates).toBe(1001);
      expect(callCount).toBe(2);
    });
  });

  describe('run', () => {
    it('OPENAI_API_KEY와 GEMINI_API_KEY가 둘 다 없으면 에러를 던진다', async () => {
      await expect(run()).rejects.toThrow(/최소 하나는 필요/);
    });

    it('대상이 없으면 즉시 종료한다', async () => {
      process.env.GEMINI_API_KEY = 'gemini-key';
      eventsSelectMock.mockReturnValue(buildEventsSelectChain({ data: [], error: null }));

      const stats = await run();

      expect(stats).toEqual({ processed: 0, succeeded: 0, failed: 0 });
      expect(generateDescriptionMock).not.toHaveBeenCalled();
    });

    it('대상을 재작성하고 ai_description을 업데이트한다', async () => {
      process.env.GEMINI_API_KEY = 'gemini-key';
      const rows = [{ id: 'a', title: '제목', description: '원본 설명', created_at: '2026-10-01T00:00:00Z' }];
      eventsSelectMock.mockReturnValue(buildEventsSelectChain({ data: rows, error: null }));
      generateDescriptionMock.mockResolvedValue('감성적으로 재작성된 설명');
      const eqMock = vi.fn().mockResolvedValue({ error: null });
      eventsUpdateMock.mockReturnValue({ eq: eqMock });

      const stats = await run();

      expect(stats).toEqual({ processed: 1, succeeded: 1, failed: 0 });
      expect(eventsUpdateMock).toHaveBeenCalledWith({ ai_description: '감성적으로 재작성된 설명' });
      expect(eqMock).toHaveBeenCalledWith('id', 'a');
    }, 10000);

    it('dryRun이면 DB를 갱신하지 않는다', async () => {
      process.env.GEMINI_API_KEY = 'gemini-key';
      const rows = [{ id: 'a', title: '제목', description: '원본 설명', created_at: '2026-10-01T00:00:00Z' }];
      eventsSelectMock.mockReturnValue(buildEventsSelectChain({ data: rows, error: null }));
      generateDescriptionMock.mockResolvedValue('감성적으로 재작성된 설명');

      const stats = await run({ dryRun: true });

      expect(stats).toEqual({ processed: 1, succeeded: 1, failed: 0 });
      expect(eventsUpdateMock).not.toHaveBeenCalled();
    });

    it('재작성 실패 건은 failed로 집계하고 나머지는 계속 처리한다', async () => {
      process.env.GEMINI_API_KEY = 'gemini-key';
      const rows = [
        { id: 'a', title: '실패할 글', description: '설명A', created_at: '2026-10-01T00:00:00Z' },
        { id: 'b', title: '성공할 글', description: '설명B', created_at: '2026-10-02T00:00:00Z' },
      ];
      eventsSelectMock.mockReturnValue(buildEventsSelectChain({ data: rows, error: null }));
      generateDescriptionMock.mockRejectedValueOnce(new Error('LLM 호출 실패')).mockResolvedValueOnce('재작성 결과');

      const stats = await run();

      expect(stats).toEqual({ processed: 2, succeeded: 1, failed: 1 });
    }, 10000);
  });
});
