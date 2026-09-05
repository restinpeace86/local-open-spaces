'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCategoryMeta } from '@/lib/spaces/category-meta';
import {
  buildOpenSpacesCategoryMinGroups,
  buildEventsCategoryMinGroups,
  type CategoryMinGroup,
} from '@/lib/admin/category-min-groups';
import { RawDataModal } from '@/components/admin/raw-data-modal';
import { CategoryRulesModal } from '@/components/admin/category-rules-modal';
import { Pagination } from '@/components/admin/pagination';
import { CuratedItemsPanel } from '@/components/admin/curated-items-panel';
import { SpotCurationsPanel } from '@/components/admin/spot-curations-panel';
import { MomPickPostsPanel } from '@/components/admin/mom-pick-posts-panel';
import { SpotDedupPanel } from '@/components/admin/spot-dedup-panel';
import { CategoryMappingPanel } from '@/components/admin/category-mapping-panel';

// [관리자 화면(/admin/data-grid) 기능 고도화 및 범용 제휴 상품 테이블 개편](2026-08-30
// 사용자 지시): 'curated_items'를 네 번째 탭으로 추가한다. 아래 나머지 탭 3개(open_spaces/
// events/raw_ingest_data)는 표준 중분류/타겟 연령 체계에 깊게 결합된 공유 테이블 렌더링
// 로직을 그대로 쓰지만, curated_items는 데이터 모양이 근본적으로 달라(제휴 상품 vs
// 위치 기반 시설/행사) 그 공유 로직에 억지로 끼워넣지 않고 별도의 자기완결적 패널
// (CuratedItemsPanel)로 렌더링한다 — 기존 3개 탭의 필터/테이블 코드는 전혀 건드리지
// 않는다(아래에서 tab === 'curated_items'일 때 이 컴포넌트로 조기 분기).
// [개선사항10 - 중복 스팟 그룹핑 및 매핑 탭](2026-09-04 todo.md): 'spot_dedup'을
// 여섯 번째 탭으로 추가한다. 위 curated_items/spot_curations/mom_pick_posts와 동일한
// 이유(데이터 모양이 근본적으로 다름 — 그룹 단위 후보 목록 + 매핑 폼)로 자기완결적인
// 별도 패널(SpotDedupPanel)로 렌더링한다.
// [노출 중분류 매핑/중복 스팟 검수 탭 분리](2026-09-05 사용자 지시): "중분류 매핑과
// 중복 스팟 검수 탭을 분리해라" — 'category_mapping'을 일곱 번째 탭으로 추가하고,
// spot_dedup 패널이 갖고 있던 "노출 중분류 관리"/"노출 중분류 대량 매핑" 섹션을
// 그쪽(CategoryMappingPanel)으로 옮긴다.
export type AdminTable =
  | 'open_spaces'
  | 'events'
  | 'raw_ingest_data'
  | 'curated_items'
  | 'spot_curations'
  | 'mom_pick_posts'
  | 'spot_dedup'
  | 'category_mapping';

export type AdminOpenSpaceRow = {
  id: string;
  external_id: string;
  source_type: string;
  source: string | null;
  name: string;
  category: string;
  category_min: string | null;
  category_min_source: string | null;
  address: string;
  location: unknown;
  location_precision: string;
  is_free: boolean | null;
  operating_hours: string | null;
  info_url: string | null;
  is_kids_friendly: boolean;
  has_parking: boolean;
  stroller_accessible: boolean;
  facility_type: string;
  target_age_group: string | null;
  raw_data: unknown;
  sigungu_name: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type AdminEventRow = {
  id: string;
  external_id: string;
  source: string | null;
  title: string;
  event_type: string;
  category_maj: string | null;
  category_min: string | null;
  category_min_source: string | null;
  target_audience: string | null;
  target_audience_source: string | null;
  venue_name: string | null;
  sigungu_name: string | null;
  start_date: string;
  end_date: string;
  location: unknown;
  location_precision: string;
  is_reservation_required: boolean | null;
  reservation_url: string | null;
  reservation_start_date: string | null;
  reservation_end_date: string | null;
  is_free: boolean | null;
  thumbnail_url: string | null;
  is_kids_friendly: boolean;
  has_parking: boolean;
  stroller_accessible: boolean;
  facility_type: string;
  target_age_group: string | null;
  booking_status: string | null;
  is_active: boolean | null;
  raw_data: unknown;
  created_at: string | null;
};

export type AdminRawIngestRow = {
  source: string;
  source_id: string;
  fetched_at: string;
  raw_payload: unknown;
};

export type AdminRow = AdminOpenSpaceRow | AdminEventRow | AdminRawIngestRow;

type FilterOptions = {
  open_spaces: {
    sourceTypes: string[];
    sources: string[];
    categories: string[];
    minClassNames: string[];
    svcStatNms: string[];
    categoryMins: string[];
    // [Admin 필터 체크박스 렌더링 안정성 확보](2026-08-28): 서버에서 재시도까지 실패한
    // 경우에만 true — "카테고리가 원래 0개"와 "조회 실패로 0개"를 구분하기 위함.
    categoryMinsFetchFailed?: boolean;
  };
  events: {
    sources: string[];
    categories: string[];
    minClassNames: string[];
    svcStatNms: string[];
    categoryMins: string[];
    categoryMinsFetchFailed?: boolean;
  };
  raw_ingest_data: { sources: string[] };
  // curated_items/spot_curations는 표준 중분류/타겟 연령 등 이 필터 체계를 전혀 쓰지
  // 않는다(각각 자기완결적인 CuratedItemsPanel/SpotCurationsPanel이 담당) —
  // currentOptions/categoryMinGroups 계산이 타입 에러 없이 안전하게 통과하도록 최소
  // 형태만 둔다.
  curated_items: Record<string, never>;
  spot_curations: Record<string, never>;
  mom_pick_posts: Record<string, never>;
  spot_dedup: Record<string, never>;
  category_mapping: Record<string, never>;
};

type TriState = 'all' | 'true' | 'false';
const TRI_STATE_LABEL: Record<TriState, string> = { all: '전체', true: '예', false: '아니오' };

const PAGE_SIZE_OPTIONS = [50, 100, 200];

// [행사 데이터 수집/정제 파이프라인 및 홈 피드 필터링 개선](2026-08-27) 사용자 지시 4번:
// 서버(src/app/api/admin/data-grid/route.ts)와 동일한 NULL 선택 예약 토큰. 실제 category_min/
// target_audience 값과 절대 겹치지 않도록 이중 밑줄로 감싼 식별자를 쓴다.
const NULL_FILTER_TOKEN = '__NULL__';

// [10대 타겟 분류 체계 실제 적용](2026-08-27): 고정 태그라 category_min과 달리 RPC로
// DB에서 discover하지 않고 하드코딩한다(값 자체가 스펙으로 확정된 enum).
// [행사 데이터 수집/정제 파이프라인 및 홈 피드 필터링 개선] 후속 지시(2026-08-27): NULL/ALL
// 중 유아/어린이/가족 관련 신호가 있어 수동 검수가 필요한 행을 모아두는 'OTHER'(기타) 추가.
const TARGET_AUDIENCE_TAGS = [
  'INFANT', 'KIDS_PRE', 'KIDS_SCHOOL', 'FAMILY', 'TEEN', 'YOUTH', 'ADULT', 'SENIOR', 'ALL', 'FACILITY', 'OTHER',
] as const;

const TAB_LABEL: Record<AdminTable, string> = {
  open_spaces: 'open_spaces (공간·시설)',
  events: 'events (행사·체험)',
  raw_ingest_data: 'raw_ingest_data (원천 보존)',
  curated_items: '🏷️ 큐레이션/제휴 상품',
  spot_curations: '📍 스팟 큐레이션',
  mom_pick_posts: '👑 맘스픽 채택 관리',
  spot_dedup: '🔗 중복 스팟 검수 및 매핑',
  category_mapping: '🗂️ 노출 중분류 매핑',
};

// [매일 배치 신규 데이터 모니터링](2026-08-28): get-home-feed.ts와 동일한 관례로 날짜 문자열을
// UTC 기준으로 다룬다(KST 변환 없음).
function todayDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoDateStr(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

type DataGridSummary = {
  open_spaces_created_today: number | null;
  events_created_today: number | null;
};

// 요구사항 1: "/admin/data-grid 상단 요약 카드". 실측 확인(2026-08-28): events는 updated_at
// 컬럼이 없고 open_spaces의 updated_at은 트리거가 없어 created_at과 항상 같은 값이라(1000건
// 샘플 전수 확인) "내용 갱신 건수"는 현재 스키마로 집계할 근거가 없다 — 사용자 확인 후
// 이번에는 신규(created_at) 집계만 구현하고 업데이트 집계는 스키마 변경 결정이 있을 때까지
// 보류한다(추측으로 0건을 표시하면 "갱신이 없었다"는 오해를 주므로 아예 표시하지 않는다).
function TodayBatchSummary() {
  const [summary, setSummary] = useState<DataGridSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/data-grid/summary')
      .then((res) => res.json())
      .then((json: DataGridSummary) => {
        if (!cancelled) setSummary(json);
      })
      .catch(() => {
        if (!cancelled) setErrorMessage('오늘 반영 현황을 불러오지 못했습니다.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (errorMessage) return <p className="text-xs text-red-500">{errorMessage}</p>;
  if (!summary) return <p className="text-xs text-gray-400">오늘 반영 현황 불러오는 중...</p>;

  const openToday = summary.open_spaces_created_today;
  const eventsToday = summary.events_created_today;
  const total = (openToday ?? 0) + (eventsToday ?? 0);

  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1">
      <span className="text-xs font-semibold text-blue-900">📅 오늘 신규 반영: Total {total.toLocaleString('ko-KR')}건</span>
      <span className="text-xs text-blue-800">open_spaces {openToday ?? '-'}건</span>
      <span className="text-xs text-blue-800">events {eventsToday ?? '-'}건</span>
      <span className="text-[11px] text-blue-400">
        ※ 내용 변경(업데이트) 건수는 현재 스키마(updated_at 자동 갱신 트리거 없음)로는 집계할 수 없습니다.
      </span>
    </div>
  );
}

// [외부 공공 API 배치 수집 안정성 및 독립 실행 구조 고도화](2026-09-01 사용자 지시)
// 항목 4 "관리자 수동 재수집 트리거": 이미 구축된 POST /api/admin/ingest/rerun을
// 호출하는 버튼 UI. 소스 목록은 하드코딩하지 않고 GET(같은 라우트)이 run-daily.mjs/
// run-monthly.mjs의 실제 STEPS에서 읽어온 값을 그대로 쓴다.
type IngestBatch = 'daily' | 'monthly';

function IngestRerunPanel() {
  const [sources, setSources] = useState<Record<IngestBatch, string[]> | null>(null);
  const [batch, setBatch] = useState<IngestBatch>('daily');
  const [sourceKey, setSourceKey] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/ingest/rerun')
      .then((res) => res.json())
      .then((data: { daily?: string[]; monthly?: string[] }) => {
        setSources({ daily: data.daily ?? [], monthly: data.monthly ?? [] });
      })
      .catch(() => setErrorMessage('재수집 가능한 소스 목록을 불러오지 못했습니다.'));
  }, []);

  const options = sources?.[batch] ?? [];

  async function handleRerun() {
    if (!sourceKey || isRunning) return;
    setIsRunning(true);
    setResultMessage(null);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/admin/ingest/rerun', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch, sourceKey }),
      });
      const data: { result?: { count?: number; rawCount?: number; failed?: boolean; note?: string }; error?: string } =
        await res.json();
      if (!res.ok) throw new Error(data.error ?? '재수집 실패');
      const r = data.result;
      setResultMessage(
        r?.failed
          ? `⚠️ ${sourceKey} 재수집 실패: ${r.note ?? '알 수 없는 오류'}`
          : `✅ ${sourceKey} 재수집 완료 — 수신 ${r?.rawCount ?? '?'}건 / 반영 ${r?.count ?? '?'}건`
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '재수집 실패');
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold text-gray-700">🔁 개별 소스 수동 재수집</span>
      <select
        value={batch}
        onChange={(e) => {
          setBatch(e.target.value as IngestBatch);
          setSourceKey('');
        }}
        className="rounded border border-gray-300 px-2 py-1 text-xs"
      >
        <option value="daily">Daily</option>
        <option value="monthly">Monthly</option>
      </select>
      <select value={sourceKey} onChange={(e) => setSourceKey(e.target.value)} className="rounded border border-gray-300 px-2 py-1 text-xs">
        <option value="">소스 선택...</option>
        {options.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={handleRerun}
        disabled={!sourceKey || isRunning}
        className="rounded-full bg-gray-900 text-white text-xs font-semibold px-3 py-1 disabled:opacity-50"
      >
        {isRunning ? '재수집 중...' : '재수집 실행'}
      </button>
      {resultMessage && <span className="text-xs text-emerald-700">{resultMessage}</span>}
      {errorMessage && <span className="text-xs text-red-600">{errorMessage}</span>}
    </div>
  );
}

export function extractLngLat(location: unknown): { lng: number; lat: number } | null {
  const geometry = location as { coordinates?: [number, number] } | null;
  if (!geometry?.coordinates) return null;
  return { lng: geometry.coordinates[0], lat: geometry.coordinates[1] };
}

function rawField(raw: unknown, key: string): string | null {
  const obj = raw as Record<string, unknown> | null;
  const value = obj?.[key];
  return typeof value === 'string' ? value : null;
}

function TriStateToggle({ label, value, onChange }: { label: string; value: TriState; onChange: (next: TriState) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-gray-500 shrink-0">{label}</span>
      <div className="flex rounded-lg border border-gray-300 overflow-hidden">
        {(['all', 'true', 'false'] as TriState[]).map((state) => (
          <button
            key={state}
            type="button"
            onClick={() => onChange(state)}
            className={`px-2 py-1 text-xs font-medium transition-colors ${
              value === state ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {TRI_STATE_LABEL[state]}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChipMultiSelect({
  label,
  options,
  selected,
  onToggle,
  colorFor,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  colorFor?: (value: string) => string;
}) {
  if (options.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      <span className="text-xs text-gray-500 self-center shrink-0">{label}</span>
      {options.map((opt) => {
        const isActive = selected.includes(opt);
        const color = colorFor?.(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onToggle(opt)}
            className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium border transition-colors"
            style={
              color
                ? isActive
                  ? { backgroundColor: color, borderColor: color, color: 'white' }
                  : { borderColor: '#d1d5db', color: '#374151', backgroundColor: 'white' }
                : isActive
                  ? { backgroundColor: '#111827', borderColor: '#111827', color: 'white' }
                  : { borderColor: '#d1d5db', color: '#374151', backgroundColor: 'white' }
            }
          >
            {label === '카테고리' ? getCategoryMeta(opt).label : opt}
          </button>
        );
      })}
    </div>
  );
}

// [행사 데이터 수집/정제 파이프라인 및 홈 피드 필터링 개선](2026-08-27) 사용자 지시 4번:
// 표준 중분류/타겟 연령 필터를 단일 셀렉트 드롭다운에서 실제 체크박스 목록으로 변경한다.
// includeNullOption이 true면 목록 맨 앞에 "미지정(NULL)" 체크박스를 추가로 렌더링한다 —
// 기존 값 배열(options)에는 실제 NULL이 포함될 수 없으므로(DB distinct values), 이 옵션을
// 별도로 붙여야 사용자가 NULL 데이터도 체크박스로 선택해 조회할 수 있다.
function CheckboxMultiSelect({
  label,
  options,
  selected,
  onToggle,
  includeNullOption = false,
  fetchFailed = false,
  onRetry,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  includeNullOption?: boolean;
  // [Admin 필터 체크박스 렌더링 안정성 확보](2026-08-28): 실측 근본 원인 —
  // get_category_min_options RPC가 대량 UPDATE 직후 일시적 DB 콜드 캐시/락 경합으로
  // 드물게 실패하면 options가 빈 배열이 되는데, includeNullOption이 true라 이 함수가
  // 그냥 return null 하지 않고 NULL 체크박스만 렌더링해 "목록이 통째로 사라진 것처럼"
  // 보였다. fetchFailed가 true면 그 경우를 명확한 에러 메시지로 구분해 보여준다(서버
  // 쪽에서 이미 재시도를 마친 뒤에도 실패한 경우에만 true가 된다 — 매우 드묾).
  fetchFailed?: boolean;
  onRetry?: () => void;
}) {
  if (options.length === 0 && !includeNullOption && !fetchFailed) return null;
  if (options.length === 0 && fetchFailed) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
        <span className="text-xs font-medium text-amber-700">
          ⚠️ {label} 옵션 목록을 불러오지 못했습니다(일시적 오류) — NULL 필터만 사용 가능합니다.
        </span>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="text-xs font-semibold text-amber-800 underline hover:text-amber-900"
          >
            다시 시도
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      {fetchFailed && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-medium text-amber-600">
            ⚠️ 최신 {label} 목록을 실시간으로 불러오지 못해 최근 스냅샷을 표시 중입니다.
          </span>
          {onRetry && (
            <button type="button" onClick={onRetry} className="text-[11px] font-semibold text-amber-700 underline">
              다시 시도
            </button>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-start gap-1.5">
        <span className="text-xs text-gray-500 shrink-0 pt-1">{label}</span>
        <div className="flex flex-wrap gap-x-3 gap-y-1 max-w-2xl">
          {includeNullOption && (
            <label className="flex items-center gap-1 text-xs text-gray-500 shrink-0">
              <input
                type="checkbox"
                checked={selected.includes(NULL_FILTER_TOKEN)}
                onChange={() => onToggle(NULL_FILTER_TOKEN)}
              />
              미지정(NULL)
            </label>
          )}
          {options.map((opt) => (
            <label key={opt} className="flex items-center gap-1 text-xs text-gray-600 shrink-0">
              <input type="checkbox" checked={selected.includes(opt)} onChange={() => onToggle(opt)} />
              {opt}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

// [대분류/중분류 계층적 탐색 UI](2026-08-28): category_min이 50종 내외로 늘어나면서 flat
// CheckboxMultiSelect가 한 화면에 전부 펼쳐져 지저분해지는 문제를 해결한다. 대분류 탭을
// 눌러 한 번에 하나의 대분류에 속한 중분류만 체크박스로 노출한다(홈 화면
// MajorCategoryGrid와 동일한 관례 — 대분류 탭 전환은 "보이는 범위"만 바꾸고, 선택된
// 중분류(selected)는 탭을 넘나들어도 그대로 유지된다). 아코디언(여러 대분류 동시 확장)
// 대신 단일 포커스 탭 방식을 택한 이유: 이 프로젝트에서 이미 홈 화면 카테고리 그리드를
// 아코디언으로 시도했다가 "처음(아이콘 그리드+공유 칩 목록) 방식이 더 낫다"는 명확한
// 피드백을 받은 전례가 있어(2026-08-27), 동일한 단일 포커스 상호작용을 어드민에도
// 일관되게 적용한다.
function HierarchicalCategoryMinFilter({
  label,
  groups,
  selected,
  onToggle,
  includeNullOption = false,
  fetchFailed = false,
  onRetry,
}: {
  label: string;
  groups: CategoryMinGroup[];
  selected: string[];
  onToggle: (value: string) => void;
  includeNullOption?: boolean;
  fetchFailed?: boolean;
  onRetry?: () => void;
}) {
  const [activeMajor, setActiveMajor] = useState<string | null>(null);

  if (groups.length === 0 && fetchFailed) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
        <span className="text-xs font-medium text-amber-700">
          ⚠️ {label} 옵션 목록을 불러오지 못했습니다(일시적 오류) — NULL 필터만 사용 가능합니다.
        </span>
        {onRetry && (
          <button type="button" onClick={onRetry} className="text-xs font-semibold text-amber-800 underline hover:text-amber-900">
            다시 시도
          </button>
        )}
      </div>
    );
  }
  if (groups.length === 0 && !includeNullOption) return null;

  const currentGroup = groups.find((g) => g.major === activeMajor) ?? groups[0];

  return (
    <div className="flex flex-col gap-1.5">
      {fetchFailed && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-medium text-amber-600">
            ⚠️ 최신 {label} 목록을 실시간으로 불러오지 못해 최근 스냅샷을 표시 중입니다.
          </span>
          {onRetry && (
            <button type="button" onClick={onRetry} className="text-[11px] font-semibold text-amber-700 underline">
              다시 시도
            </button>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-gray-500 shrink-0">{label} — 대분류</span>
        {groups.map((g) => {
          const selectedCount = g.minors.filter((m) => selected.includes(m)).length;
          const isActive = (currentGroup?.major ?? null) === g.major;
          return (
            <button
              key={g.major}
              type="button"
              onClick={() => setActiveMajor(g.major)}
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium border transition-colors ${
                isActive ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {g.major}
              {selectedCount > 0 && <span className="ml-1 text-[10px] font-bold">({selectedCount})</span>}
            </button>
          );
        })}
        {includeNullOption && (
          <label className="ml-2 flex items-center gap-1 text-xs text-gray-500 shrink-0">
            <input type="checkbox" checked={selected.includes(NULL_FILTER_TOKEN)} onChange={() => onToggle(NULL_FILTER_TOKEN)} />
            미지정(NULL)
          </label>
        )}
      </div>
      {currentGroup && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 max-w-2xl pl-1">
          {currentGroup.minors.map((opt) => (
            <label key={opt} className="flex items-center gap-1 text-xs text-gray-600 shrink-0">
              <input type="checkbox" checked={selected.includes(opt)} onChange={() => onToggle(opt)} />
              {opt}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// [카테고리 정제 & 어드민 확장](2026-08-26): category_min_source(RAW/RULE/MANUAL) 출처 뱃지.
const CATEGORY_MIN_SOURCE_STYLE: Record<string, string> = {
  RAW: 'bg-emerald-100 text-emerald-700',
  RULE: 'bg-blue-100 text-blue-700',
  MANUAL: 'bg-purple-100 text-purple-700',
};

// [7대 대분류 실제 적용](2026-08-26): categoryMaj가 있으면(events, category_maj 컬럼 신규)
// "대분류 › 중분류" 형태로 함께 보여준다 — open_spaces는 이 컬럼이 없어 categoryMaj가 항상
// undefined이며 기존과 동일하게 중분류만 표시된다.
function CategoryMinBadge({
  categoryMin,
  categoryMaj,
  source,
}: {
  categoryMin: string | null;
  categoryMaj?: string | null;
  source: string | null;
}) {
  if (!categoryMin) return <span className="text-xs text-gray-300">NULL</span>;
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-xs text-gray-700">
        {categoryMaj && <span className="text-gray-400">{categoryMaj} › </span>}
        {categoryMin}
      </span>
      {source && (
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${CATEGORY_MIN_SOURCE_STYLE[source] ?? 'bg-gray-100 text-gray-600'}`}>
          {source}
        </span>
      )}
    </span>
  );
}

// [10대 타겟 분류 체계 실제 적용](2026-08-27): target_audience_source(RAW_FIELD/CATEGORY/
// TEXT/MANUAL) 출처 뱃지 — CATEGORY_MIN_SOURCE_STYLE과 동일 관례, 색만 별도 팔레트로 구분.
const TARGET_AUDIENCE_SOURCE_STYLE: Record<string, string> = {
  RAW_FIELD: 'bg-emerald-100 text-emerald-700',
  CATEGORY: 'bg-amber-100 text-amber-700',
  TEXT: 'bg-blue-100 text-blue-700',
  MANUAL: 'bg-purple-100 text-purple-700',
  // NULL/ALL 중 유아/어린이/가족 관련 신호가 있어 수동 검수가 필요한 행 — 눈에 띄도록 경고색.
  OTHER: 'bg-red-100 text-red-700',
};

function TargetAudienceBadge({ targetAudience, source }: { targetAudience: string | null; source: string | null }) {
  if (!targetAudience) return <span className="text-xs text-gray-300">NULL</span>;
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-xs text-gray-700">{targetAudience}</span>
      {source && (
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${TARGET_AUDIENCE_SOURCE_STYLE[source] ?? 'bg-gray-100 text-gray-600'}`}>
          {source}
        </span>
      )}
    </span>
  );
}

export function AdminDataGridClient({ filterOptions }: { filterOptions: FilterOptions }) {
  const router = useRouter();
  const [tab, setTab] = useState<AdminTable>('open_spaces');

  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  // [관리자 화면 필터 UI 압축](2026-09-05 사용자 지시): "등록일/표준 중분류/검색어
  // 정도로만 검색하고 있다 — 이 3개 제외하고는 하나의 영역에서 숨기기/펼치기 할 수
  // 있도록" — 나머지 필터(출처 2종/카테고리/원천 중분류/이벤트 전용 필터)를 이
  // 접이식 영역 하나로 몰아 기본은 접어 두고, 목록이 화면을 더 넓게 쓰게 한다.
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(false);
  const [sourceTypes, setSourceTypes] = useState<string[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [minClassName, setMinClassName] = useState('');
  // [행사 데이터 수집/정제 파이프라인 및 홈 피드 필터링 개선](2026-08-27) 사용자 지시 4번:
  // 체크박스를 누를 때마다 즉시 쿼리가 나가지 않도록, 선택 상태를 "대기(pending)"와
  // "적용(applied)" 두 단계로 나눈다 — 체크박스는 pending만 바꾸고, 실제 조회 파라미터/
  // fetch effect는 applied만 바라본다. [조회하기] 버튼을 눌러야 pending → applied로 반영되어
  // 그 순간 단 한 번만 쿼리가 실행된다. 다른 필터(검색어/칩/토글)는 기존처럼 즉시 반영이라
  // 이 두 필터만 별도로 관리한다.
  const [pendingCategoryMin, setPendingCategoryMin] = useState<string[]>([]);
  const [appliedCategoryMin, setAppliedCategoryMin] = useState<string[]>([]);
  const [pendingTargetAudience, setPendingTargetAudience] = useState<string[]>([]);
  const [appliedTargetAudience, setAppliedTargetAudience] = useState<string[]>([]);
  const hasPendingFilterChanges =
    pendingCategoryMin.join(',') !== appliedCategoryMin.join(',') ||
    pendingTargetAudience.join(',') !== appliedTargetAudience.join(',');
  const [isRulesModalOpen, setIsRulesModalOpen] = useState(false);
  // [0순위 우선 요청](2026-08-26): "기본 조회 조건에 WHERE is_active = true를 적용" — 다른
  // tri-state 필터와 달리 기본값이 'all'이 아니라 'true'다(비활성 만료 데이터가 기본적으로
  // 섞여 나오지 않도록). events 탭에만 의미가 있다(open_spaces에는 is_active 컬럼이 없음).
  const [isActive, setIsActive] = useState<TriState>('true');
  // 요구사항 2: 단축 필터([오늘 등록건 보기]/[최근 3일건 보기]) + 달력 기간 조회. 다른 즉시
  // 반영 필터(검색어/칩 등)와 같은 관례로, 값이 바뀌면 바로 쿼리가 나간다(체크박스 필터만
  // pending/applied 2단계인 것과 다름 — 날짜는 오조작 빈도가 낮고 즉시 반영이 자연스럽다).
  // [기본 조회일자 오늘로 설정](2026-08-29 사용자 지시): 오퍼레이터가 페이지에 처음 들어왔을
  // 때 매번 "오늘 등록건 보기"를 눌러야 했던 불편을 없애기 위해, 초기값 자체를 오늘로 고정한다
  // (isActive 필터가 기본값을 'all'이 아니라 'true'로 두는 것과 동일한 관례).
  const [createdFrom, setCreatedFrom] = useState(todayDateStr());
  const [createdTo, setCreatedTo] = useState(todayDateStr());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);

  const [rows, setRows] = useState<AdminRow[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedRow, setSelectedRow] = useState<AdminRow | null>(null);
  // [관리자 페이지 성능 최적화](2026-08-30 사용자 지시) 요구사항 3: "탭 전환 시 자동 데이터
  // 로딩 금지" — 초기 진입/탭 전환 순간에는 빈 뼈대(필터 UI)만 보여주고, 관리자가 [조회하기]를
  // 눌러야만 그 탭의 첫 조회가 나간다. 탭별로 독립된 플래그라 한 번 조회한 탭을 벗어났다
  // 돌아오면 다시 눌러야 한다(요구사항 문구 "탭을 누르는 순간 자동으로 조회하지 않음"을
  // 그대로 지키기 위해 이전 결과를 캐시해두지 않음).
  const [hasLoaded, setHasLoaded] = useState<Record<AdminTable, boolean>>({
    open_spaces: false,
    events: false,
    raw_ingest_data: false,
    curated_items: false,
    spot_curations: false,
    mom_pick_posts: false,
    spot_dedup: false,
    category_mapping: false,
  });

  const resetFilters = () => {
    setQ('');
    setSourceTypes([]);
    setSources([]);
    setCategories([]);
    setMinClassName('');
    setPendingCategoryMin([]);
    setAppliedCategoryMin([]);
    setPendingTargetAudience([]);
    setAppliedTargetAudience([]);
    setIsActive('true');
    setCreatedFrom(todayDateStr());
    setCreatedTo(todayDateStr());
  };

  const switchTab = (next: AdminTable) => {
    setTab(next);
    resetFilters();
    setPage(1);
    setRows([]);
    setTotal(0);
    setHasLoaded((prev) => ({ ...prev, [next]: false }));
  };

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, sourceTypes, sources, categories, minClassName, appliedCategoryMin, appliedTargetAudience, isActive, createdFrom, createdTo]);

  // [행사 데이터 수집/정제 파이프라인 및 홈 피드 필터링 개선](2026-08-27) 사용자 지시 4번:
  // [조회하기] 버튼 클릭 시 pending → applied로 한 번에 반영한다 — 이 시점에만 아래 fetch
  // effect가 재실행된다(체크박스를 누르는 매 순간이 아니라).
  const applyPendingFilters = () => {
    setAppliedCategoryMin(pendingCategoryMin);
    setAppliedTargetAudience(pendingTargetAudience);
  };

  useEffect(() => {
    if (!hasLoaded[tab]) return;

    let cancelled = false;
    setIsLoading(true);
    setErrorMessage(null);

    const params = new URLSearchParams();
    params.set('table', tab);
    if (debouncedQ) params.set('q', debouncedQ);
    if (sourceTypes.length > 0) params.set('source_type', sourceTypes.join(','));
    if (sources.length > 0) params.set('source', sources.join(','));
    if (categories.length > 0) params.set('category', categories.join(','));
    if (minClassName) params.set('min_class_name', minClassName);
    if (appliedCategoryMin.length > 0) params.set('category_min', appliedCategoryMin.join(','));
    if (tab === 'events' && appliedTargetAudience.length > 0) params.set('target_audience', appliedTargetAudience.join(','));
    if (tab === 'events') params.set('is_active', isActive);
    if (tab !== 'raw_ingest_data' && createdFrom) params.set('created_from', createdFrom);
    if (tab !== 'raw_ingest_data' && createdTo) params.set('created_to', createdTo);
    params.set('page', String(page));
    params.set('page_size', String(pageSize));

    fetch(`/api/admin/data-grid?${params.toString()}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? '데이터 조회 실패');
        return json as { rows: AdminRow[]; total: number };
      })
      .then((result) => {
        if (cancelled) return;
        setRows(result.rows);
        setTotal(result.total);
      })
      .catch((err: Error) => {
        if (!cancelled) setErrorMessage(err.message);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, hasLoaded, debouncedQ, sourceTypes, sources, categories, minClassName, appliedCategoryMin, appliedTargetAudience, isActive, createdFrom, createdTo, page, pageSize]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);
  const currentOptions = filterOptions[tab];

  // [대분류/중분류 계층적 탐색 UI](2026-08-28): category_min이 50종 내외로 늘어나 flat
  // 체크박스 목록이 지저분해지는 문제 — 대분류로 묶어 한 번에 하나의 대분류 하위 중분류만
  // 노출한다. tab이 바뀌면(open_spaces ↔ events) 그룹 정의도 달라진다.
  const categoryMinGroups = useMemo(() => {
    if (tab === 'raw_ingest_data' || !('categoryMins' in currentOptions)) return [];
    return tab === 'events'
      ? buildEventsCategoryMinGroups(currentOptions.categoryMins)
      : buildOpenSpacesCategoryMinGroups(currentOptions.categoryMins);
  }, [tab, currentOptions]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="shrink-0 p-4 border-b border-gray-100 flex flex-col gap-3">
        <TodayBatchSummary />
        <IngestRerunPanel />
        {/* [관리자 화면 모바일 점검](2026-09-05 사용자 지시): 제목+버튼 2개가
            justify-between + nowrap이라 좁은 화면에서 버튼이 잘릴 여지가 있어
            flex-wrap을 추가한다(줄바꿈되면 gap-y로 자연스럽게 간격이 생김). */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-sm font-bold text-gray-900">Admin Data Grid</h1>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsRulesModalOpen(true)}
              className="text-xs font-semibold text-white bg-gray-900 rounded-full px-3 py-1.5 hover:bg-gray-700"
            >
              카테고리 키워드 규칙 관리
            </button>
            <button type="button" onClick={resetFilters} className="text-xs text-gray-500 hover:text-gray-800 underline">
              필터 초기화
            </button>
          </div>
        </div>

        {/* 2. 탭 구성 */}
        {/* [관리자 화면 모바일 점검](2026-09-05 사용자 지시): "관리자 화면 모바일에서도
            잘 동작하도록 점검해줘" 실측으로 확인한 버그 — 탭이 이제 8개(오늘
            category_mapping 추가로 늘어남)라 모바일 폭(예: 375px)에서 한 줄에 다
            들어가지 않는데, 이 컨테이너에 가로 스크롤이 전혀 없고(overflow-x-auto
            없음) 바깥 조상(위 return의 `overflow-hidden`)이 넘치는 부분을 그냥
            잘라버려 뒤쪽 탭("🗂️ 노출 중분류 매핑" 등)을 아예 누를 방법이 없었다 —
            SpotCategoryFilter 등 이 프로젝트의 다른 가로 칩 목록과 동일하게
            overflow-x-auto로 가로 스와이프가 가능하게 한다(각 탭 버튼은 shrink-0로
            줄어들어 텍스트가 찌그러지지 않게 한다). */}
        <div className="flex gap-1.5 overflow-x-auto border-b border-gray-100 -mb-3 pb-3">
          {(Object.keys(TAB_LABEL) as AdminTable[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => switchTab(t)}
              className={`shrink-0 px-3 py-1.5 text-xs font-semibold rounded-t-lg transition-colors ${
                tab === t ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>
      </div>

      {/* [관리자 화면 기능 고도화 및 범용 제휴 상품 테이블 개편](2026-08-30 사용자 지시):
          curated_items는 데이터 모양이 근본적으로 달라 아래 공유 필터 바/테이블(open_spaces/
          events/raw_ingest_data 전용)을 타지 않고 자기완결적인 CuratedItemsPanel을
          그대로 렌더링한다 — 기존 3개 탭 로직은 이 분기 밖에 있어 전혀 영향받지 않는다.
          spot_curations도 동일한 이유로 SpotCurationsPanel로 분리한다(2026-09-01). */}
      {tab === 'curated_items' ? (
        <CuratedItemsPanel />
      ) : tab === 'spot_curations' ? (
        <SpotCurationsPanel />
      ) : tab === 'mom_pick_posts' ? (
        <MomPickPostsPanel />
      ) : tab === 'spot_dedup' ? (
        <SpotDedupPanel />
      ) : tab === 'category_mapping' ? (
        <CategoryMappingPanel categoryMinOptions={filterOptions.open_spaces.categoryMins} />
      ) : (
      <>
      <div className="shrink-0 p-4 border-b border-gray-100 flex flex-col gap-3">
        {/* 3. 필터 및 검색 바 */}
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tab === 'raw_ingest_data' ? 'source_id 검색' : '제목/시설명, 주소 키워드 검색'}
          className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
        />

        {/* [관리자 화면 필터 UI 압축](2026-09-05 사용자 지시): "등록일/표준 중분류/
            검색어 정도로만 검색하고 있다" — 이 3개(검색어는 위 입력창, 나머지 둘은
            아래)만 상시 노출하고, 조회하기 버튼도 등록일 줄에 함께 둬 목록 영역이
            화면을 더 넓게 쓰게 한다. */}
        {tab !== 'raw_ingest_data' && 'categoryMins' in currentOptions && (
          <HierarchicalCategoryMinFilter
            label="표준 중분류(category_min)"
            groups={categoryMinGroups}
            selected={pendingCategoryMin}
            includeNullOption
            fetchFailed={currentOptions.categoryMinsFetchFailed}
            onRetry={() => router.refresh()}
            onToggle={(v) =>
              setPendingCategoryMin((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]))
            }
          />
        )}

        {/* 요구사항 2: 단축 필터 + 달력 기간 조회(created_at 기준) — 조회하기 버튼도 이 줄에 함께 둔다 */}
        {tab !== 'raw_ingest_data' && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-gray-500 shrink-0">등록일(created_at)</span>
            <button
              type="button"
              onClick={() => {
                setCreatedFrom(todayDateStr());
                setCreatedTo(todayDateStr());
              }}
              className={`rounded-full px-2.5 py-1 text-xs font-medium border transition-colors ${
                createdFrom === todayDateStr() && createdTo === todayDateStr()
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              오늘 등록건 보기
            </button>
            <button
              type="button"
              onClick={() => {
                setCreatedFrom(daysAgoDateStr(2));
                setCreatedTo(todayDateStr());
              }}
              className={`rounded-full px-2.5 py-1 text-xs font-medium border transition-colors ${
                createdFrom === daysAgoDateStr(2) && createdTo === todayDateStr()
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              최근 3일건 보기
            </button>
            <input
              type="date"
              value={createdFrom}
              onChange={(e) => setCreatedFrom(e.target.value)}
              className="rounded-lg border border-gray-300 px-2 py-1 text-xs"
            />
            <span className="text-xs text-gray-400">~</span>
            <input
              type="date"
              value={createdTo}
              onChange={(e) => setCreatedTo(e.target.value)}
              className="rounded-lg border border-gray-300 px-2 py-1 text-xs"
            />
            {(createdFrom || createdTo) && (
              <button
                type="button"
                onClick={() => {
                  setCreatedFrom('');
                  setCreatedTo('');
                }}
                className="text-xs text-gray-500 hover:text-gray-800 underline"
              >
                날짜 초기화
              </button>
            )}

            <span className="flex-1" />
            <button
              type="button"
              onClick={applyPendingFilters}
              className={`text-xs font-semibold rounded-full px-3 py-1.5 transition-colors ${
                hasPendingFilterChanges ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-100 text-gray-500'
              }`}
            >
              🔍 조회하기
            </button>
          </div>
        )}
        {tab !== 'raw_ingest_data' && hasPendingFilterChanges && (
          <p className="text-[11px] text-amber-600">중분류/타겟 연령 선택이 변경됐습니다 — 조회하기를 눌러야 반영됩니다.</p>
        )}
        {/* raw_ingest_data는 위 등록일 줄 자체가 없어(대용량 로데이터 특성상 날짜
            필터를 지원하지 않음) 조회하기 버튼도 이 탭에는 필요 없다(중분류/타겟
            연령 pending 필터가 애초에 이 탭에 노출되지 않으므로) — 기존 동작 그대로. */}

        <button
          type="button"
          onClick={() => setIsFiltersExpanded((v) => !v)}
          className="self-start text-xs font-medium text-blue-600 hover:underline"
        >
          {isFiltersExpanded ? '▴ 상세 필터 접기' : '▾ 상세 필터 더보기 (출처/카테고리/원천 중분류 등)'}
        </button>

        {isFiltersExpanded && (
          <div className="flex flex-col gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
            {tab === 'open_spaces' && (
              <ChipMultiSelect
                label="출처(source_type)"
                options={filterOptions.open_spaces.sourceTypes}
                selected={sourceTypes}
                onToggle={(v) => setSourceTypes((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]))}
              />
            )}
            <ChipMultiSelect
              label="출처(source)"
              options={currentOptions.sources}
              selected={sources}
              onToggle={(v) => setSources((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]))}
            />
            {tab !== 'raw_ingest_data' && 'categories' in currentOptions && (
              <ChipMultiSelect
                label="카테고리"
                options={currentOptions.categories}
                selected={categories}
                onToggle={(v) => setCategories((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]))}
                colorFor={(v) => getCategoryMeta(v).color}
              />
            )}

            {tab !== 'raw_ingest_data' && 'minClassNames' in currentOptions && (
              <div className="flex flex-wrap gap-3">
                <label className="flex items-center gap-1.5 text-xs text-gray-500">
                  원천 중분류
                  <select
                    value={minClassName}
                    onChange={(e) => setMinClassName(e.target.value)}
                    className="rounded-lg border border-gray-300 px-2 py-1 text-xs"
                  >
                    <option value="">전체</option>
                    {currentOptions.minClassNames.map((v: string) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            {tab === 'events' && (
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                <TriStateToggle label="✅ 활성 상태(is_active)" value={isActive} onChange={setIsActive} />
              </div>
            )}

            {tab === 'events' && (
              <CheckboxMultiSelect
                label="타겟 연령(target_audience)"
                options={[...TARGET_AUDIENCE_TAGS]}
                selected={pendingTargetAudience}
                includeNullOption
                onToggle={(v) =>
                  setPendingTargetAudience((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]))
                }
              />
            )}
          </div>
        )}
      </div>

      {/* 4. 테이블 그리드 */}
      <div className="flex-1 overflow-auto p-4">
        {/* [관리자 페이지 성능 최적화](2026-08-30 사용자 지시) 요구사항 3: 탭 진입/전환
            직후에는 조회를 자동 실행하지 않고 빈 뼈대(필터 UI)만 보여준다 — 이 버튼을
            눌러야 그 탭의 첫 조회가 실행된다. raw_ingest_data는 대용량 로데이터라 특히
            명시적 트리거가 필요하다는 요구사항을 이 공통 게이트가 그대로 충족한다. */}
        {!hasLoaded[tab] && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <p className="text-sm text-gray-500">
              {tab === 'raw_ingest_data'
                ? '대용량 로데이터입니다. 필요할 때만 불러와 주세요.'
                : '필터를 설정한 뒤 불러오기를 눌러주세요.'}
            </p>
            <button
              type="button"
              onClick={() => setHasLoaded((prev) => ({ ...prev, [tab]: true }))}
              className="rounded-full bg-blue-600 text-white text-sm font-semibold px-5 py-2 hover:bg-blue-700"
            >
              📥 불러오기
            </button>
          </div>
        )}

        {hasLoaded[tab] && isLoading && <p className="text-sm text-gray-400">불러오는 중...</p>}
        {hasLoaded[tab] && errorMessage && <p className="text-sm text-red-500">{errorMessage}</p>}
        {hasLoaded[tab] && !isLoading && !errorMessage && rows.length === 0 && (
          <p className="text-sm text-gray-400">조건에 맞는 데이터가 없습니다.</p>
        )}

        {hasLoaded[tab] && !isLoading && !errorMessage && rows.length > 0 && (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="sticky top-0 z-10 bg-white border-b-2 border-gray-200 text-left text-xs font-semibold text-gray-600 shadow-[0_1px_0_0_rgba(0,0,0,0.04)]">
                <th className="py-2.5 pr-3">ID</th>
                <th className="py-2.5 pr-3">출처</th>
                {tab !== 'raw_ingest_data' && <th className="py-2.5 pr-3">원천 대/중분류</th>}
                {tab !== 'raw_ingest_data' && <th className="py-2.5 pr-3">표준 중분류</th>}
                {tab === 'events' && <th className="py-2.5 pr-3">타겟 연령</th>}
                <th className="py-2.5 pr-3">{tab === 'raw_ingest_data' ? '수집 시각' : '제목/명칭'}</th>
                {tab === 'events' && <th className="py-2.5 pr-3">행사기간(start~end)</th>}
                {tab !== 'raw_ingest_data' && <th className="py-2.5 pr-3">장소/시설명</th>}
                {tab !== 'raw_ingest_data' && <th className="py-2.5 pr-3">주소</th>}
                {tab !== 'raw_ingest_data' && <th className="py-2.5 pr-3">위도/경도</th>}
                {tab !== 'raw_ingest_data' && <th className="py-2.5 pr-3">요금</th>}
                {tab !== 'raw_ingest_data' && <th className="py-2.5 pr-3">접수상태</th>}
                <th className="py-2.5 pr-3">{tab === 'raw_ingest_data' ? '' : '수정/적재일'}</th>
                <th className="py-2.5 pr-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => {
                const zebraClass = rowIndex % 2 === 1 ? 'bg-gray-50/60' : 'bg-white';
                if (tab === 'raw_ingest_data') {
                  const r = row as AdminRawIngestRow;
                  return (
                    <tr
                      key={`${r.source}-${r.source_id}`}
                      onClick={() => setSelectedRow(row)}
                      className={`border-b border-gray-100 hover:bg-blue-50 cursor-pointer ${zebraClass}`}
                    >
                      <td className="py-2 pr-3 font-mono text-xs text-gray-900">{r.source_id}</td>
                      <td className="py-2 pr-3 text-gray-600">{r.source}</td>
                      <td className="py-2 pr-3 text-gray-600">{new Date(r.fetched_at).toLocaleString('ko-KR')}</td>
                      <td className="py-2 pr-3" />
                      <td className="py-2 pr-3 text-right text-xs text-blue-600">상세</td>
                    </tr>
                  );
                }

                const isEvent = tab === 'events';
                const r = row as AdminOpenSpaceRow | AdminEventRow;
                const titleText = isEvent ? (r as AdminEventRow).title : (r as AdminOpenSpaceRow).name;
                const venueText = isEvent ? (r as AdminEventRow).venue_name ?? '-' : (r as AdminOpenSpaceRow).name;
                const addressText = isEvent ? (r as AdminEventRow).sigungu_name ?? '-' : (r as AdminOpenSpaceRow).address;
                const categoryValue = isEvent ? (r as AdminEventRow).event_type : (r as AdminOpenSpaceRow).category;
                const meta = getCategoryMeta(categoryValue);
                const coords = extractLngLat(r.location);
                const maxClass = rawField(r.raw_data, 'MAXCLASSNM');
                const minClass = rawField(r.raw_data, 'MINCLASSNM');
                const svcStat = rawField(r.raw_data, 'SVCSTATNM');
                const updatedAt = isEvent ? (r as AdminEventRow).created_at : (r as AdminOpenSpaceRow).updated_at ?? (r as AdminOpenSpaceRow).created_at;
                // 요구사항 3: 오늘 자정 이후 새로 생성된 건 [NEW] 뱃지. "내용 갱신([UPDATED])"은
                // TodayBatchSummary 주석과 동일한 이유로 이번 범위에 포함하지 않는다.
                const isNewToday = Boolean(r.created_at) && r.created_at!.slice(0, 10) === todayDateStr();

                return (
                  <tr
                    key={r.id}
                    onClick={() => setSelectedRow(row)}
                    className={`border-b border-gray-100 hover:bg-blue-50 cursor-pointer ${zebraClass}`}
                  >
                    <td className="py-2 pr-3 font-mono text-[11px] text-gray-500 max-w-[140px] truncate">{r.external_id}</td>
                    <td className="py-2 pr-3 text-gray-600 whitespace-nowrap">{r.source ?? (isEvent ? '-' : (r as AdminOpenSpaceRow).source_type)}</td>
                    <td className="py-2 pr-3 text-gray-600 whitespace-nowrap">
                      {maxClass || minClass ? (
                        <span>
                          {maxClass ?? '-'} / {minClass ?? '-'}
                        </span>
                      ) : (
                        <span
                          className="text-xs font-semibold px-2 py-0.5 rounded-full text-white"
                          style={{ backgroundColor: meta.color }}
                        >
                          {meta.label}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      <CategoryMinBadge
                        categoryMin={r.category_min}
                        categoryMaj={isEvent ? (r as AdminEventRow).category_maj : undefined}
                        source={r.category_min_source}
                      />
                    </td>
                    {isEvent && (
                      <td className="py-2 pr-3 whitespace-nowrap">
                        <TargetAudienceBadge
                          targetAudience={(r as AdminEventRow).target_audience}
                          source={(r as AdminEventRow).target_audience_source}
                        />
                      </td>
                    )}
                    <td className="py-2 pr-3 font-medium text-gray-900 max-w-[220px] truncate">
                      {isNewToday && (
                        <span className="mr-1.5 inline-block align-middle text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500 text-white">
                          NEW
                        </span>
                      )}
                      {titleText}
                    </td>
                    {isEvent && (
                      <td className="py-2 pr-3 text-gray-600 whitespace-nowrap text-xs">
                        {(r as AdminEventRow).start_date} ~ {(r as AdminEventRow).end_date}
                        {(r as AdminEventRow).is_active === false && (
                          <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-600">
                            비활성
                          </span>
                        )}
                      </td>
                    )}
                    <td className="py-2 pr-3 text-gray-600 max-w-[160px] truncate">{venueText}</td>
                    <td className="py-2 pr-3 text-gray-600 max-w-[200px] truncate">{addressText}</td>
                    <td className="py-2 pr-3 text-gray-500 whitespace-nowrap text-xs">
                      {coords ? `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}` : <span className="text-red-500">미존재</span>}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {r.is_free === true && <span className="text-xs text-green-600">🎁 무료</span>}
                      {r.is_free === false && <span className="text-xs text-gray-600">💰 유료</span>}
                      {r.is_free === null && <span className="text-xs text-gray-300">NULL</span>}
                    </td>
                    <td className="py-2 pr-3 text-gray-600 whitespace-nowrap">{svcStat ?? '-'}</td>
                    <td className="py-2 pr-3 text-gray-400 whitespace-nowrap text-xs">{updatedAt ? new Date(updatedAt).toLocaleDateString('ko-KR') : '-'}</td>
                    <td className="py-2 pr-3 text-right text-xs text-blue-600">상세</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="shrink-0 flex items-center justify-between gap-3 border-t border-gray-100 p-3">
        <span className="text-xs text-gray-500">
          총 {total.toLocaleString('ko-KR')}건 · {page} / {totalPages} 페이지
        </span>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-gray-500">
            페이지당
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="rounded-lg border border-gray-300 px-2 py-1 text-xs"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}건
                </option>
              ))}
            </select>
          </label>
          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </div>
      </div>
      </>
      )}

      {selectedRow && tab !== 'raw_ingest_data' && tab !== 'curated_items' && tab !== 'spot_curations' && tab !== 'mom_pick_posts' && tab !== 'spot_dedup' && tab !== 'category_mapping' && (
        <RawDataModal
          table={tab}
          row={selectedRow}
          categoryMinOptions={currentOptions && 'categoryMins' in currentOptions ? currentOptions.categoryMins : []}
          targetAudienceOptions={tab === 'events' ? [...TARGET_AUDIENCE_TAGS] : []}
          onClose={() => setSelectedRow(null)}
          onCategoryMinUpdated={(id, nextCategoryMin, nextSource) => {
            setRows((prev) =>
              prev.map((row) =>
                'id' in row && row.id === id
                  ? { ...row, category_min: nextCategoryMin, category_min_source: nextSource }
                  : row
              )
            );
            setSelectedRow((prev) =>
              prev && 'id' in prev && prev.id === id
                ? { ...prev, category_min: nextCategoryMin, category_min_source: nextSource }
                : prev
            );
          }}
          onTargetAudienceUpdated={(id, nextTargetAudience, nextSource) => {
            setRows((prev) =>
              prev.map((row) =>
                'id' in row && row.id === id
                  ? { ...row, target_audience: nextTargetAudience, target_audience_source: nextSource }
                  : row
              )
            );
            setSelectedRow((prev) =>
              prev && 'id' in prev && prev.id === id
                ? { ...prev, target_audience: nextTargetAudience, target_audience_source: nextSource }
                : prev
            );
          }}
          onLocationUpdated={(id, nextLocation, nextPrecision) => {
            setRows((prev) =>
              prev.map((row) => ('id' in row && row.id === id ? { ...row, location: nextLocation, location_precision: nextPrecision } : row))
            );
            setSelectedRow((prev) =>
              prev && 'id' in prev && prev.id === id ? { ...prev, location: nextLocation, location_precision: nextPrecision } : prev
            );
          }}
          onMigratedToEvent={(id) => {
            // [todo.md 개선사항 5](2026-09-03): 이관 성공 시 원본 open_spaces 행은 서버에서
            // 실제로 삭제됐으므로(중복 노출 방지) 목록/총건수/상세 모달에서도 즉시 제거한다.
            setRows((prev) => prev.filter((row) => !('id' in row) || row.id !== id));
            setTotal((prev) => Math.max(0, prev - 1));
            setSelectedRow(null);
          }}
        />
      )}
      {selectedRow && tab === 'raw_ingest_data' && (
        <RawDataModal table={tab} row={selectedRow} categoryMinOptions={[]} onClose={() => setSelectedRow(null)} />
      )}

      {isRulesModalOpen && <CategoryRulesModal onClose={() => setIsRulesModalOpen(false)} />}
    </div>
  );
}
