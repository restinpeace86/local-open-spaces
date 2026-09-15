'use client';

import { useEffect, useMemo, useState } from 'react';

// [파이프라인 로그 DB화 및 관리자 모니터링/수동 재수집 탭](2026-09-15 사용자 지시,
// implementation/todo.md [개선사항 3]): "기존에 마크다운 파일(pipeline-log.md)에
// 기록하던 파이프라인 실행 로그 방식을 폐기하고, DB에 구조화된 데이터로 직접 적재한 뒤,
// 관리자 화면에서 이를 시각화하고 개별 소스를 수동 재수집할 수 있는 전용 탭을 구현" —
// 이 앱은 아직 로그인/세션 인증이 없어(/admin/data-grid, /admin/reservations와 동일한
// known gap) 이 페이지도 별도 접근 제어 없이 기존 관례를 그대로 따른다(제3장 제5조
// 추측 금지 — 인증은 이번 지시서 범위 밖).

type AgentStatus = {
  agent_name: string;
  status: 'OK' | 'FAILED';
  executed_at: string;
  error_message: string | null;
  description: string | null;
  period: 'daily' | 'monthly' | null;
  meta_data: Record<string, unknown> | null;
};

type IngestBatch = 'daily' | 'monthly';

function formatRelativeTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return '방금 전';
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}일 전`;
}

function metaSummary(meta: Record<string, unknown> | null): string | null {
  if (!meta) return null;
  const parts: string[] = [];
  if (typeof meta.rawCount === 'number') parts.push(`수신 ${meta.rawCount}건`);
  if (typeof meta.eventsCount === 'number' && meta.eventsCount > 0) parts.push(`events ${meta.eventsCount}건`);
  if (typeof meta.openSpacesCount === 'number' && meta.openSpacesCount > 0) parts.push(`open_spaces ${meta.openSpacesCount}건`);
  if (typeof meta.errorCount === 'number' && meta.errorCount > 0) parts.push(`에러 ${meta.errorCount}건`);
  if (typeof meta.note === 'string' && meta.note) parts.push(meta.note);
  return parts.length > 0 ? parts.join(' · ') : null;
}

export default function AdminPipelinePage() {
  const [agents, setAgents] = useState<AgentStatus[] | null>(null);
  const [rerunnable, setRerunnable] = useState<Record<IngestBatch, string[]> | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [runningAgent, setRunningAgent] = useState<string | null>(null);
  const [rerunMessage, setRerunMessage] = useState<string | null>(null);

  function loadAgents() {
    fetch('/api/admin/pipeline-logs')
      .then((res) => res.json())
      .then((data: { agents?: AgentStatus[]; error?: string }) => {
        if (data.error) throw new Error(data.error);
        setAgents(data.agents ?? []);
      })
      .catch((err: Error) => setErrorMessage(err.message));
  }

  useEffect(() => {
    loadAgents();
    fetch('/api/admin/ingest/rerun')
      .then((res) => res.json())
      .then((data: { daily?: string[]; monthly?: string[] }) => {
        setRerunnable({ daily: data.daily ?? [], monthly: data.monthly ?? [] });
      })
      .catch(() => setErrorMessage('재수집 가능한 소스 목록을 불러오지 못했습니다.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // agent_name → 어느 batch('daily'/'monthly')에서 개별 재수집 가능한지. STEPS 배열
  // (run-daily.mjs/run-monthly.mjs)에 있는 원본 수집 소스만 개별 재실행이 가능하다 —
  // 후처리 단계(CATEGORY_RULES_APPLICATION 등)는 현재도 개별 트리거 경로가 없어(항상
  // 전체 배치의 일부로만 실행됨) 이 화면에서도 재수집 버튼을 만들지 않는다(제5장 제2조
  // Spec 우선 — 없는 기능을 있는 것처럼 보이게 하지 않음).
  const rerunBatchByAgent = useMemo(() => {
    const map = new Map<string, IngestBatch>();
    if (rerunnable) {
      for (const key of rerunnable.daily) map.set(key, 'daily');
      for (const key of rerunnable.monthly) map.set(key, 'monthly');
    }
    return map;
  }, [rerunnable]);

  async function handleRerun(agentName: string, batch: IngestBatch) {
    if (runningAgent) return;
    setRunningAgent(agentName);
    setRerunMessage(null);
    try {
      const res = await fetch('/api/admin/ingest/rerun', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch, sourceKey: agentName }),
      });
      const data: { result?: { count?: number; rawCount?: number; failed?: boolean; note?: string }; error?: string } =
        await res.json();
      if (!res.ok) throw new Error(data.error ?? '재수집 실패');
      const r = data.result;
      setRerunMessage(
        r?.failed
          ? `⚠️ ${agentName} 재수집 실패: ${r.note ?? '알 수 없는 오류'}`
          : `✅ ${agentName} 재수집 완료 — 수신 ${r?.rawCount ?? '?'}건 / 반영 ${r?.count ?? '?'}건`
      );
      loadAgents();
    } catch (err) {
      setRerunMessage(err instanceof Error ? `⚠️ ${err.message}` : '⚠️ 재수집 실패');
    } finally {
      setRunningAgent(null);
    }
  }

  const dailyAgents = agents?.filter((a) => a.period === 'daily') ?? [];
  const monthlyAgents = agents?.filter((a) => a.period === 'monthly') ?? [];
  const otherAgents = agents?.filter((a) => a.period !== 'daily' && a.period !== 'monthly') ?? [];

  function renderGroup(title: string, list: AgentStatus[]) {
    if (list.length === 0) return null;
    const failedCount = list.filter((a) => a.status === 'FAILED').length;
    return (
      <div className="mb-6">
        <h2 className="text-sm font-bold text-gray-800 mb-2">
          {title} <span className="text-xs font-normal text-gray-400">({list.length}개{failedCount > 0 ? `, 실패 ${failedCount}개` : ''})</span>
        </h2>
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs font-semibold text-gray-600">
                <th className="py-2 px-3">에이전트</th>
                <th className="py-2 px-3">설명</th>
                <th className="py-2 px-3">상태</th>
                <th className="py-2 px-3">최근 실행</th>
                <th className="py-2 px-3">상세</th>
                <th className="py-2 px-3">작업</th>
              </tr>
            </thead>
            <tbody>
              {list.map((agent) => {
                const isFailed = agent.status === 'FAILED';
                const batch = rerunBatchByAgent.get(agent.agent_name);
                const summary = metaSummary(agent.meta_data);
                return (
                  <tr key={agent.agent_name} className={isFailed ? 'bg-red-50' : 'bg-white'}>
                    <td className="py-2 px-3 font-mono text-xs font-semibold text-gray-900 whitespace-nowrap">{agent.agent_name}</td>
                    <td className="py-2 px-3 text-xs text-gray-500 max-w-xs">{agent.description ?? '(미등록 — pipeline-agent-registry.mjs 확인 필요)'}</td>
                    <td className="py-2 px-3">
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          isFailed ? 'bg-red-500 text-white' : 'bg-emerald-50 text-emerald-700'
                        }`}
                      >
                        {isFailed ? '🚨 실패' : '✅ 정상'}
                      </span>
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap text-xs text-gray-500">{formatRelativeTime(agent.executed_at)}</td>
                    <td className="py-2 px-3 text-xs text-gray-600 max-w-sm">
                      {isFailed ? (
                        <span className="text-red-700">{agent.error_message ?? '(사유 미기록)'}</span>
                      ) : (
                        summary ?? '-'
                      )}
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      {batch ? (
                        <button
                          type="button"
                          disabled={runningAgent !== null}
                          onClick={() => handleRerun(agent.agent_name, batch)}
                          className="rounded-full bg-gray-900 text-white text-xs font-semibold px-3 py-1 disabled:opacity-50"
                        >
                          {runningAgent === agent.agent_name ? '실행 중...' : '재수집 실행'}
                        </button>
                      ) : (
                        <span className="text-xs text-gray-300">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-lg font-bold text-gray-900">🔁 파이프라인 관리</h1>
      <p className="text-sm text-gray-500 mt-1 mb-4">
        데이터 수집/후처리 에이전트별 최근 실행 상태(pipeline_logs)와 개별 소스 수동 재수집을 한 화면에서 확인합니다.
      </p>

      {errorMessage && <p className="text-sm text-red-500 mb-3">{errorMessage}</p>}
      {rerunMessage && <p className="text-sm mb-3">{rerunMessage}</p>}
      {agents === null && !errorMessage && <p className="text-sm text-gray-400">불러오는 중...</p>}
      {agents !== null && agents.length === 0 && (
        <p className="text-sm text-gray-400">아직 기록된 실행 로그가 없습니다(배치가 한 번도 실행되지 않았을 수 있습니다).</p>
      )}

      {renderGroup('Daily (시한성 이벤트 수집 + 후처리)', dailyAgents)}
      {renderGroup('Monthly (상시 시설 수집 + 후처리)', monthlyAgents)}
      {renderGroup('기타/미분류', otherAgents)}
    </div>
  );
}
