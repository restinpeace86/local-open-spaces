'use client';

import { useEffect, useState } from 'react';
import { AdminTable, AdminRow, AdminOpenSpaceRow, AdminEventRow, AdminRawIngestRow, extractLngLat } from '@/components/admin/data-grid-client';
import { MigrateToEventModal } from '@/components/admin/migrate-to-event-modal';
import { ServiceCategory } from '@/lib/admin/service-category';
import { BlogCurationModal } from '@/components/admin/blog-curation-modal';
import { EventBlogCurationModal } from '@/components/admin/event-blog-curation-modal';
import { SpotPicker, SpotOption } from '@/components/community/spot-picker';
import { SpotCurationQuickModal } from '@/components/admin/spot-curation-quick-modal';
import { SpotDedupQuickModal } from '@/components/admin/spot-dedup-quick-modal';
import { useBackdropDismiss } from '@/lib/admin/use-backdrop-dismiss';
import { GroupMemberRow } from '@/app/api/admin/spot-dedup/group-members/route';
import { cleanupMessyText, looksLikeMessyText } from '@/lib/admin/cleanup-messy-text';
import { EVENTS_ALLOWED_CATEGORY_MINS } from '@/lib/admin/category-min-groups';

// [개편] 행 클릭 시 해당 행의 전체 원천 컬럼(구조화된 값) + raw_data/raw_payload 원문 JSON을
// 함께 보여주는 Read-Only 뷰어. 3개 탭(open_spaces/events/raw_ingest_data) 행 형태가 서로
// 달라 탭별로 제목/부제/원문 필드를 분기한다. 데스크톱은 중앙 모달, 모바일은 하단 바텀시트로
// 표시해 spec/common의 모달 관례를 따른다(기존 구현 유지).
// [상세 모달 URL/이미지 UX 개선](2026-08-29 사용자 지시): "전체 컬럼" 목록의 URL 값이
// 그냥 텍스트라 오퍼레이터가 매번 복사해서 새 탭에 붙여넣어야 했다. http(s) URL은 클릭 시
// 새 창으로 열리는 링크로, 그중 이미지 URL(썸네일 등)은 실제 미리보기 이미지로 렌더링한다.
function isHttpUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}

function isImageUrlField(key: string, value: string): boolean {
  if (key === 'thumbnail_url') return true;
  return /\.(jpe?g|png|gif|webp|svg|avif)(\?.*)?$/i.test(value);
}

// [원문 JSON 필드를 HTML로 보기](2026-09-06 사용자 지시): "events에서 raw_data
// 원문보면.. DTLCONT 같은 컬럼에는 글이 쫙 있긴한데.. 이게 html로 되어있는거
// 같아.. 해당 컬럼만 좀 눌러서 다시 팝업띄워서 html로 보고 닫을수 있는 기능" —
// 원천 API(raw_data/raw_payload)의 특정 필드값이 HTML 태그를 포함하는지 감지한다.
// <br>처럼 닫는 태그가 없는 경우도 있어 여는 태그 하나만 있어도 HTML로 간주하는
// 넓은 휴리스틱을 쓴다 — 오탐이 있어도 무해하다(관리자가 버튼을 눌러야만
// 렌더링을 시도한다).
function looksLikeHtml(value: unknown): value is string {
  return typeof value === 'string' && /<[a-z][^>]*>/i.test(value);
}

function getModalContent(table: AdminTable, row: AdminRow): { title: string; subtitle: string; raw: unknown } {
  if (table === 'raw_ingest_data') {
    const r = row as AdminRawIngestRow;
    return { title: r.source_id, subtitle: `${r.source} · ${new Date(r.fetched_at).toLocaleString('ko-KR')}`, raw: r.raw_payload };
  }
  if (table === 'events') {
    const r = row as AdminEventRow;
    // [0순위 우선 요청](2026-08-26): 검수 효율성을 위해 행사 기간(start_date~end_date)을
    // 상세 패널에서도 곧바로 보이도록 부제에 포함한다(기존에는 "전체 컬럼" 목록에 묻혀 있었음).
    return {
      title: r.title,
      subtitle: `${r.source ?? '(source 미표기)'} · ${r.external_id} · 📅 ${r.start_date} ~ ${r.end_date}${
        r.is_active === false ? ' · 비활성' : ''
      }`,
      raw: r.raw_data,
    };
  }
  const r = row as AdminOpenSpaceRow;
  return { title: r.name, subtitle: `${r.source_type} · ${r.external_id}`, raw: r.raw_data };
}

// [카테고리 정제 & 어드민 확장](2026-08-26): 상세 모달에서 category_min을 직접 선택해
// 수동 수정할 수 있다(open_spaces/events 탭 전용, raw_ingest_data에는 이 컬럼 자체가 없음).
// 저장 시 category_min_source가 항상 'MANUAL'로 바뀐다(서버 규약 — PATCH /api/admin/data-grid/category-min).
function CategoryMinEditor({
  table,
  row,
  categoryMinOptions,
  onUpdated,
}: {
  table: 'open_spaces' | 'events';
  row: AdminOpenSpaceRow | AdminEventRow;
  categoryMinOptions: string[];
  onUpdated: (id: string, nextCategoryMin: string | null, nextSource: string | null) => void;
}) {
  const [value, setValue] = useState(row.category_min ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // [events 표준 중분류 사용 범위 15종 제한](2026-09-12 사용자 지시): "매일 재수집..
  // 상세팝업에서 표준 중분류 선택하고.. 여기서 표준 중분류 수동선택하여 저장하는
  // 부분엔 우리가 사용하기로 한 중분류들만 나왔으면 해" — events 탭에서만 좁힌다
  // (open_spaces는 이 정책 대상이 아니라 기존처럼 실제 존재하는 값 전체를 보여준다).
  // seoul_public_reservation(강의실/테니스장 등 15종 밖 값도 RAW로 그대로 씀)
  // 행을 실수로 열었을 때 현재 값이 목록에 없어 빈 선택으로 보이는 걸 막기 위해,
  // 현재 값이 15종 밖이면 그 값도 맨 앞에 함께 보여준다(값을 숨기거나 지우지 않음
  // — 제3장 제5조 추측 금지, 있는 값을 안 보이게만 하는 것도 일종의 임의 변경).
  const options =
    table === 'events'
      ? Array.from(new Set([...(row.category_min ? [row.category_min] : []), ...EVENTS_ALLOWED_CATEGORY_MINS]))
      : categoryMinOptions;

  const handleSave = async () => {
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/admin/data-grid/category-min', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table, id: row.id, category_min: value || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '수동 수정 실패');
      onUpdated(row.id, json.row.category_min, json.row.category_min_source);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '수동 수정 실패');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-gray-200 p-3">
      <h3 className="text-xs font-semibold text-gray-500 mb-2">
        표준 중분류(category_min) 수동 수정
        {row.category_min_source && (
          <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">
            현재: {row.category_min_source}
          </span>
        )}
      </h3>
      <div className="flex items-center gap-2">
        <select
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs flex-1"
        >
          <option value="">(미분류)</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="rounded-full bg-purple-600 text-white text-xs font-semibold px-3 py-1.5 disabled:opacity-40 hover:bg-purple-700"
        >
          {isSaving ? '저장 중...' : '저장(MANUAL)'}
        </button>
      </div>
      {errorMessage && <p className="mt-1.5 text-xs text-red-500">{errorMessage}</p>}
    </div>
  );
}

// [노출 중분류 개별 행 수정](2026-09-05 사용자 지시): "노출 중분류 변경할 수 있도록
// 해줘 open_spaces쪽에서" — open_spaces 전용(events에는 service_category_id 컬럼
// 자체가 없음). 새 PATCH 엔드포인트를 만들지 않고, 이미 있는 대량/선택 매핑
// 라우트(POST /api/admin/open-spaces/bulk-category-mapping)를 `ids: [row.id]`
// 하나짜리로 재사용한다(제5장 제4조 기존 구조 우선) — 그 라우트가 이미 이 경로에서
// service_category_id를 명시적으로 null(선택 해제)까지 허용하도록 확장돼 있다.
function ServiceCategoryEditor({
  row,
  serviceCategories,
  onUpdated,
}: {
  row: AdminOpenSpaceRow;
  serviceCategories: ServiceCategory[];
  onUpdated: (id: string, nextServiceCategoryId: string | null) => void;
}) {
  const [value, setValue] = useState(row.service_category_id ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const currentCategory = serviceCategories.find((c) => c.id === row.service_category_id);

  const handleSave = async () => {
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/admin/open-spaces/bulk-category-mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [row.id], service_category_id: value || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '수동 수정 실패');
      onUpdated(row.id, value || null);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '수동 수정 실패');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-gray-200 p-3">
      <h3 className="text-xs font-semibold text-gray-500 mb-2">
        노출 중분류(service_category_id) 수동 수정
        {currentCategory && (
          <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">
            현재: {currentCategory.parent_category} &gt; {currentCategory.category_name}
          </span>
        )}
      </h3>
      <div className="flex items-center gap-2">
        <select
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs flex-1"
        >
          <option value="">(선택 안 함)</option>
          {serviceCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.parent_category} &gt; {c.category_name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="rounded-full bg-purple-600 text-white text-xs font-semibold px-3 py-1.5 disabled:opacity-40 hover:bg-purple-700"
        >
          {isSaving ? '저장 중...' : '저장'}
        </button>
      </div>
      {errorMessage && <p className="mt-1.5 text-xs text-red-500">{errorMessage}</p>}
    </div>
  );
}

// [10대 타겟 분류 체계 실제 적용](2026-08-27): 상세 모달에서 target_audience를 직접 선택해
// 수동 수정할 수 있다(events 탭 전용 — target_audience는 events에만 있는 컬럼).
// CategoryMinEditor와 동일 관례: 저장 시 target_audience_source가 항상 'MANUAL'로 바뀐다.
function TargetAudienceEditor({
  row,
  targetAudienceOptions,
  onUpdated,
}: {
  row: AdminEventRow;
  targetAudienceOptions: string[];
  onUpdated: (id: string, nextTargetAudience: string | null, nextSource: string | null) => void;
}) {
  const [value, setValue] = useState(row.target_audience ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSave = async () => {
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/admin/data-grid/target-audience', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, target_audience: value || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '수동 수정 실패');
      onUpdated(row.id, json.row.target_audience, json.row.target_audience_source);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '수동 수정 실패');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-gray-200 p-3">
      <h3 className="text-xs font-semibold text-gray-500 mb-2">
        타겟 연령(target_audience) 수동 수정
        {row.target_audience_source && (
          <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">
            현재: {row.target_audience_source}
          </span>
        )}
      </h3>
      <div className="flex items-center gap-2">
        <select
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs flex-1"
        >
          <option value="">(미분류)</option>
          {targetAudienceOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="rounded-full bg-purple-600 text-white text-xs font-semibold px-3 py-1.5 disabled:opacity-40 hover:bg-purple-700"
        >
          {isSaving ? '저장 중...' : '저장(MANUAL)'}
        </button>
      </div>
      {errorMessage && <p className="mt-1.5 text-xs text-red-500">{errorMessage}</p>}
    </div>
  );
}

// [관리자 이벤트 상세 팝업 내 '운영 요일 / 반복 규칙' 설정 추가](2026-09-12 사용자 지시):
// "상세팝업에서 표준 중분류 선택 ➡️ 타겟 연령 선택 ➡️ 블로그 검증 ➡️ 스팟 연결 이런
// 식인데 여기에 일자는 기본적으로 원천데이터꺼로 하긴하는데 예외 규칙을 여기서
// 집어넣으면 해당 예외 규칙도 적용되도록.." — start_date~end_date(원본 기간)는 그대로
// 두고, 그 안에서 실제 운영 요일(operating_weekdays)/정기 휴무 요일(excluded_weekdays)을
// 지정한다. 두 개념은 서로 독립적으로 조합 가능하다("택 1 또는 조합" — 예: 매일 운영 +
// 월요일만 휴무). 저장된 규칙은 "오늘 진행중" 판단 시 isEventOperatingOn()으로 검사된다
// (src/lib/spaces/event-operating-schedule.ts, 현재 /api/spots/linked-events에서 사용).
const WEEKDAY_LABELS: Record<string, string> = { SUN: '일', MON: '월', TUE: '화', WED: '수', THU: '목', FRI: '금', SAT: '토' };
const WEEKDAY_DISPLAY_ORDER = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

type OperatingPreset = 'DAILY' | 'WEEKEND' | 'CUSTOM';

function sameDaySet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((d) => setB.has(d));
}

// 저장된 값에서 프리셋을 되짚어낸다(다시 열었을 때 이전에 고른 프리셋이 그대로 보이도록).
function detectOperatingPreset(operatingWeekdays: string[] | null | undefined): {
  preset: OperatingPreset;
  customDays: string[];
} {
  const days = operatingWeekdays ?? [];
  if (days.length === 0) return { preset: 'DAILY', customDays: [] };
  if (sameDaySet(days, ['SAT', 'SUN'])) return { preset: 'WEEKEND', customDays: [] };
  return { preset: 'CUSTOM', customDays: days };
}

function WeekdayCheckboxGrid({ selected, onToggle }: { selected: string[]; onToggle: (code: string) => void }) {
  return (
    <div className="flex gap-1.5 mt-1.5">
      {WEEKDAY_DISPLAY_ORDER.map((code) => (
        <label
          key={code}
          className={`flex-1 text-center rounded-lg border px-1.5 py-1 text-xs cursor-pointer select-none ${
            selected.includes(code) ? 'border-purple-500 bg-purple-50 text-purple-700 font-semibold' : 'border-gray-200 text-gray-500'
          }`}
        >
          <input type="checkbox" checked={selected.includes(code)} onChange={() => onToggle(code)} className="hidden" />
          {WEEKDAY_LABELS[code]}
        </label>
      ))}
    </div>
  );
}

function OperatingScheduleEditor({
  row,
  onUpdated,
}: {
  row: AdminEventRow;
  onUpdated: (id: string, nextOperatingWeekdays: string[] | null, nextExcludedWeekdays: string[] | null) => void;
}) {
  const initial = detectOperatingPreset(row.operating_weekdays);
  const [preset, setPreset] = useState<OperatingPreset>(initial.preset);
  const [customDays, setCustomDays] = useState<string[]>(initial.customDays);
  const [excludeEnabled, setExcludeEnabled] = useState((row.excluded_weekdays ?? []).length > 0);
  const [excludedDays, setExcludedDays] = useState<string[]>(row.excluded_weekdays ?? []);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function toggleCustomDay(code: string) {
    setCustomDays((prev) => (prev.includes(code) ? prev.filter((d) => d !== code) : [...prev, code]));
  }

  function toggleExcludedDay(code: string) {
    setExcludedDays((prev) => (prev.includes(code) ? prev.filter((d) => d !== code) : [...prev, code]));
  }

  const handleSave = async () => {
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const operatingWeekdays =
        preset === 'DAILY' ? null : preset === 'WEEKEND' ? ['SAT', 'SUN'] : customDays.length > 0 ? customDays : null;
      const excludedWeekdaysToSave = excludeEnabled && excludedDays.length > 0 ? excludedDays : null;

      const res = await fetch('/api/admin/events/operating-schedule', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, operating_weekdays: operatingWeekdays, excluded_weekdays: excludedWeekdaysToSave }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '운영 요일/반복 규칙 저장 실패');
      onUpdated(row.id, json.row.operating_weekdays, json.row.excluded_weekdays);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '운영 요일/반복 규칙 저장 실패');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-gray-200 p-3">
      <h3 className="text-xs font-semibold text-gray-500 mb-2">
        운영 요일 / 반복 규칙
        <span className="ml-1.5 text-[10px] font-normal text-gray-400">
          (기간: {row.start_date} ~ {row.end_date} 내 예외 규칙 — 기본값: 매일 운영)
        </span>
      </h3>

      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ['DAILY', '매일 운영'],
            ['WEEKEND', '주말만 운영(토·일)'],
            ['CUSTOM', '특정 요일 지정'],
          ] as [OperatingPreset, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setPreset(value)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              preset === value ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {preset === 'CUSTOM' && <WeekdayCheckboxGrid selected={customDays} onToggle={toggleCustomDay} />}

      <label className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-gray-600 cursor-pointer">
        <input type="checkbox" checked={excludeEnabled} onChange={(e) => setExcludeEnabled(e.target.checked)} />
        정기 휴무일 지정(예: 매주 월요일 휴무)
      </label>
      {excludeEnabled && <WeekdayCheckboxGrid selected={excludedDays} onToggle={toggleExcludedDay} />}

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="rounded-full bg-purple-600 text-white text-xs font-semibold px-3 py-1.5 disabled:opacity-40 hover:bg-purple-700"
        >
          {isSaving ? '저장 중...' : '저장'}
        </button>
      </div>
      {errorMessage && <p className="mt-1.5 text-xs text-red-500">{errorMessage}</p>}
    </div>
  );
}

// [지오코딩 실패 행 수동 좌표 입력](2026-09-05 사용자 지시): "지오코딩하지 못하여 위경도
// 좌표가 없는경우는 수동으로 위경도 좌표 돌릴수있도록.. events쪽에 구현해줘." — CategoryMinEditor/
// TargetAudienceEditor와 동일 관례: 저장하면 location_precision이 항상 'EXACT'로 바뀐다
// (관리자가 직접 확인한 값이 자동 지오코딩보다 우선). 좌표를 직접 찾기 쉽도록 카카오맵
// 검색 링크(장소명/시군구명으로 새 탭 검색)를 함께 제공한다 — 좌표 자체를 대신 찾아주는
// 것은 아니지만(그건 서버 지오코딩의 역할), 관리자가 손으로 찾아 입력하는 실제 작업
// 흐름에서 반드시 필요한 보조 링크라 함께 넣는다.
function LocationEditor({ row, onUpdated }: { row: AdminEventRow; onUpdated: (id: string, nextLocation: unknown, nextPrecision: string) => void }) {
  const current = extractLngLat(row.location);
  const [lat, setLat] = useState(current ? String(current.lat) : '');
  const [lng, setLng] = useState(current ? String(current.lng) : '');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const kakaoMapSearchUrl = `https://map.kakao.com/?q=${encodeURIComponent(row.venue_name || row.title)}`;

  const handleSave = async () => {
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/admin/data-grid/location', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, lat: Number(lat), lng: Number(lng) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '좌표 수동 수정 실패');
      onUpdated(row.id, json.row.location, json.row.location_precision);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '좌표 수동 수정 실패');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-gray-200 p-3">
      <h3 className="text-xs font-semibold text-gray-500 mb-2">
        좌표(위도/경도) 수동 입력
        <span
          className={`ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
            row.location_precision === 'EXACT' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
          }`}
        >
          현재: {row.location_precision}
        </span>
        <a
          href={kakaoMapSearchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-2 text-[11px] font-medium text-blue-600 hover:underline"
        >
          🗺️ 카카오맵에서 찾기
        </a>
      </h3>
      <div className="flex items-center gap-2">
        <input
          type="number"
          step="any"
          value={lat}
          onChange={(e) => setLat(e.target.value)}
          placeholder="위도(lat) 예: 37.4"
          className="w-1/3 rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
        />
        <input
          type="number"
          step="any"
          value={lng}
          onChange={(e) => setLng(e.target.value)}
          placeholder="경도(lng) 예: 127.1"
          className="w-1/3 rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || !lat.trim() || !lng.trim()}
          className="rounded-full bg-purple-600 text-white text-xs font-semibold px-3 py-1.5 disabled:opacity-40 hover:bg-purple-700"
        >
          {isSaving ? '저장 중...' : '저장(EXACT)'}
        </button>
      </div>
      {errorMessage && <p className="mt-1.5 text-xs text-red-500">{errorMessage}</p>}
    </div>
  );
}

// [개선사항10](2026-09-11 사용자 지시, implementation/todo.md): "매칭되는 스팟이 없는
// 경우 관리자가 수동으로 스팟을 지정하거나 신규 등록하여 연결할 수 있도록 관리자
// 툴 플로우를 지원". 기존 SpotPicker(맘스픽 글쓰기 스팟 검색, /api/spots/search +
// 카카오 로컬 Fallback + Auto-Upsert)를 그대로 재사용한다(제5장 제4조 기존 구조
// 우선 — 검색·신규 등록 로직을 다시 만들지 않음).
//
// [연결된 스팟의 노출 중분류 확인/입력](2026-09-12 사용자 지시): "연결하면 연결됨이라고
// 뜨는데.. 해당 장소가 노출 중분류가 있는지 확인하고.. 없으면 노출 중분류를 입력하라고
// 하고 해당 팝업화면에서 노출 중분류 선택 및 저장 가능하도록 해줘" — get-nearby.ts
// 실측 확인 결과, 노출 중분류(service_category_id)가 없어도 필터 없는 기본 스팟픽
// 지도에는 나오지만, 노출 중분류로 필터링하는 순간(get_spots_by_service_category)
// 전혀 걸리지 않는다. 스팟을 고르거나(SpotPicker) 이미 연결된 스팟을 불러올 때마다
// 그 스팟의 service_category_id를 함께 조회해 경고/입력 UI를 보여준다.
function SpaceLinkEditor({
  row,
  serviceCategories,
  onUpdated,
}: {
  row: AdminEventRow;
  serviceCategories: ServiceCategory[];
  onUpdated: (id: string, nextSpaceId: string | null) => void;
}) {
  const [selected, setSelected] = useState<SpotOption | null>(
    row.space_id ? { id: row.space_id, name: '(연결됨 — 이름 확인 중...)', address: null } : null
  );
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // undefined = 아직 조회 전, null = 조회 완료했지만 노출 중분류 없음.
  const [spaceServiceCategoryId, setSpaceServiceCategoryId] = useState<string | null | undefined>(undefined);
  const [isLoadingSpaceInfo, setIsLoadingSpaceInfo] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState('');
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  const [categoryErrorMessage, setCategoryErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const spaceId = selected?.id ?? null;
    if (!spaceId) {
      setSpaceServiceCategoryId(undefined);
      return;
    }
    setIsLoadingSpaceInfo(true);
    fetch(`/api/admin/data-grid/space-link?space_id=${encodeURIComponent(spaceId)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !data.space) return;
        setSelected((prev) =>
          prev && prev.id === spaceId ? { ...prev, name: data.space.standard_name ?? data.space.name ?? prev.name } : prev
        );
        setSpaceServiceCategoryId(data.space.service_category_id ?? null);
        setCategoryDraft(data.space.service_category_id ?? '');
      })
      .catch(() => {
        // 조용한 부가 조회 실패는 연결 자체를 막지 않는다(제5장 제11조).
      })
      .finally(() => setIsLoadingSpaceInfo(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  async function handleSelect(spot: SpotOption | null) {
    setSelected(spot);
    setSpaceServiceCategoryId(undefined);
    setCategoryErrorMessage(null);
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/admin/data-grid/space-link', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, space_id: spot?.id ?? null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '연결된 스팟 수정 실패');
      onUpdated(row.id, json.row.space_id);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '연결된 스팟 수정 실패');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveCategory() {
    if (!selected) return;
    setIsSavingCategory(true);
    setCategoryErrorMessage(null);
    try {
      const res = await fetch('/api/admin/open-spaces/bulk-category-mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [selected.id], service_category_id: categoryDraft || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '노출 중분류 저장 실패');
      setSpaceServiceCategoryId(categoryDraft || null);
    } catch (err) {
      setCategoryErrorMessage(err instanceof Error ? err.message : '노출 중분류 저장 실패');
    } finally {
      setIsSavingCategory(false);
    }
  }

  const currentCategory = serviceCategories.find((c) => c.id === spaceServiceCategoryId);

  return (
    <div className="mt-3 rounded-xl border border-gray-200 p-3">
      <h3 className="text-xs font-semibold text-gray-500 mb-2">
        연결된 스팟(open_spaces)
        <span
          className={`ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
            row.space_id ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
          }`}
        >
          {row.space_id ? '연결됨' : '미연결'}
        </span>
        {isSaving && <span className="ml-2 text-[11px] text-gray-400">저장 중...</span>}
      </h3>
      <SpotPicker selected={selected} onSelect={handleSelect} />
      {errorMessage && <p className="mt-1.5 text-xs text-red-500">{errorMessage}</p>}

      {selected && isLoadingSpaceInfo && spaceServiceCategoryId === undefined && (
        <p className="mt-2 text-[11px] text-gray-400">노출 중분류 확인 중...</p>
      )}

      {selected && !isLoadingSpaceInfo && spaceServiceCategoryId && (
        <p className="mt-2 text-[11px] font-medium text-emerald-700">
          ✅ 노출 중분류: {currentCategory ? `${currentCategory.parent_category} > ${currentCategory.category_name}` : spaceServiceCategoryId}
        </p>
      )}

      {selected && !isLoadingSpaceInfo && spaceServiceCategoryId === null && (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/60 p-2.5">
          <p className="text-[11px] font-semibold text-amber-800 mb-1.5">
            ⚠️ 이 스팟은 노출 중분류가 없어요 — 카테고리 필터로는 스팟픽에서 찾을 수 없어요. 지금 지정해 주세요.
          </p>
          <div className="flex items-center gap-2">
            <select
              value={categoryDraft}
              onChange={(e) => setCategoryDraft(e.target.value)}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs flex-1"
            >
              <option value="">(선택 안 함)</option>
              {serviceCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.parent_category} &gt; {c.category_name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleSaveCategory}
              disabled={isSavingCategory || !categoryDraft}
              className="shrink-0 rounded-full bg-purple-600 text-white text-xs font-semibold px-3 py-1.5 disabled:opacity-40 hover:bg-purple-700"
            >
              {isSavingCategory ? '저장 중...' : '저장'}
            </button>
          </div>
          {categoryErrorMessage && <p className="mt-1.5 text-xs text-red-500">{categoryErrorMessage}</p>}
        </div>
      )}
    </div>
  );
}

export function RawDataModal({
  table,
  row,
  categoryMinOptions,
  targetAudienceOptions = [],
  serviceCategories = [],
  onClose,
  onCategoryMinUpdated,
  onTargetAudienceUpdated,
  onOperatingScheduleUpdated,
  onLocationUpdated,
  onSpaceLinkUpdated,
  onServiceCategoryUpdated,
  onMigratedToEvent,
  onDeleted,
}: {
  table: AdminTable;
  row: AdminRow;
  categoryMinOptions: string[];
  targetAudienceOptions?: string[];
  // [노출 중분류 개별 행 수정](2026-09-05 사용자 지시): 원래 open_spaces 탭 전용이었으나,
  // [연결된 스팟의 노출 중분류 확인/입력](2026-09-12 사용자 지시)부터 events 탭의
  // SpaceLinkEditor도 이 목록을 재사용한다(제5장 제4조 — 같은 목록을 또 조회하지 않음).
  serviceCategories?: ServiceCategory[];
  onClose: () => void;
  onCategoryMinUpdated?: (id: string, nextCategoryMin: string | null, nextSource: string | null) => void;
  onTargetAudienceUpdated?: (id: string, nextTargetAudience: string | null, nextSource: string | null) => void;
  // [운영 요일/반복 규칙](2026-09-12 사용자 지시): events 탭 전용.
  onOperatingScheduleUpdated?: (id: string, nextOperatingWeekdays: string[] | null, nextExcludedWeekdays: string[] | null) => void;
  onLocationUpdated?: (id: string, nextLocation: unknown, nextPrecision: string) => void;
  // [개선사항10](2026-09-11 사용자 지시): events 탭 전용, 연결된 스팟(space_id) 수동 지정.
  onSpaceLinkUpdated?: (id: string, nextSpaceId: string | null) => void;
  onServiceCategoryUpdated?: (id: string, nextServiceCategoryId: string | null) => void;
  // [todo.md 개선사항 5](2026-09-03): open_spaces 탭에서만 전달된다 — 이관 성공 시 부모가
  // 목록에서 이 행을 제거하고 상세 모달을 닫는다(원본이 실제로 삭제됐으므로).
  onMigratedToEvent?: (id: string) => void;
  // [open_spaces 삭제 기능](2026-09-06 사용자 지시): open_spaces 탭에서만 전달된다 —
  // 삭제 성공 시 부모가 목록에서 이 행을 제거하고 상세 모달을 닫는다.
  onDeleted?: (id: string) => void;
}) {
  const { title, subtitle, raw } = getModalContent(table, row);
  const prettyJson = JSON.stringify(raw ?? null, null, 2);
  const [isMigrateModalOpen, setIsMigrateModalOpen] = useState(false);
  const [isBlogCurationModalOpen, setIsBlogCurationModalOpen] = useState(false);
  // [이벤트픽 관리자 블로그 큐레이션](2026-09-11 사용자 지시, todo.md 개선사항7-2)
  const [isEventBlogCurationModalOpen, setIsEventBlogCurationModalOpen] = useState(false);
  // [open_spaces 상세에서 스팟 큐레이션 바로 열기](2026-09-08 사용자 지시)
  const [isSpotCurationModalOpen, setIsSpotCurationModalOpen] = useState(false);
  // [open_spaces 상세에서 중복 스팟 검토](2026-09-09 사용자 지시)
  const [isSpotDedupModalOpen, setIsSpotDedupModalOpen] = useState(false);
  // [개선사항2](todo.md, 2026-09-09) "원본에 대한 정보는 어떤 방식이든 확인할 수
  // 있어야합니다" — 그룹 대표의 원본 멤버 목록 보기.
  const [isGroupMembersModalOpen, setIsGroupMembersModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // [원문 JSON 필드를 HTML로 보기](2026-09-06 사용자 지시) — 어떤 필드를 HTML로
  // 열었는지 저장한다(null이면 팝업 닫힘).
  const [htmlPreviewField, setHtmlPreviewField] = useState<{ key: string; value: string } | null>(null);
  // [원문 JSON 필드 정돈해서 보기](2026-09-12 사용자 지시) — HTML은 아니지만
  // \r\n·&nbsp; 등이 섞여 원문 그대로는 알아보기 힘든 필드를 정돈해서 열었는지 저장.
  const [cleanedTextPreviewField, setCleanedTextPreviewField] = useState<{ key: string; value: string } | null>(null);
  // [드래그 시 팝업 닫힘 버그 수정](2026-09-05 사용자 지시) 참고: use-backdrop-dismiss.ts
  const backdropDismiss = useBackdropDismiss(onClose);

  // raw가 평범한 객체일 때만 상위 필드를 훑어 HTML처럼 보이는 문자열 필드를 찾는다
  // (배열/문자열/숫자 등 다른 모양의 raw_data도 있어 방어적으로 확인한다).
  const htmlLikeFields: [string, string][] =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? Object.entries(raw as Record<string, unknown>).filter((entry): entry is [string, string] => looksLikeHtml(entry[1]))
      : [];

  // [원문 JSON 필드 정돈해서 보기](2026-09-12 사용자 지시): "html이면 html로 지금처럼
  // 볼수있게하는데 html이 아닌경우 이와 같이 되어있는지 확인하고 해당 컬럼 글만
  // 정돈돼서 볼수있게" — htmlLikeFields와 상호 배타적으로, 진짜 태그가 없는 필드
  // 중에서만 찾는다(같은 필드에 버튼 두 개가 겹치지 않게).
  const messyTextFields: [string, string][] =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? Object.entries(raw as Record<string, unknown>).filter(
          (entry): entry is [string, string] => !looksLikeHtml(entry[1]) && looksLikeMessyText(entry[1])
        )
      : [];

  // [open_spaces 삭제 기능](2026-09-06 사용자 지시): "내가 불필요하다고 생각하는건
  // 관리자 화면에서 삭제하는게 더 좋을까?" → "open_spaces쪽의 데이터" 삭제.
  // 실측 확인(src/app/api/admin/open-spaces/route.ts 주석 참고): open_spaces는
  // service_categories와 달리 대부분 CASCADE/SET NULL로 참조돼 있어 DB가 삭제를
  // 막아주지 않는다 — 삭제 전 영향 범위(예약/북마크/큐레이션 등)를 먼저 조회해
  // 관리자가 실제 건수를 보고 판단하게 한다. 실제 예약이 있으면 서버가 자체적으로
  // 삭제를 거부한다(아래 catch에서 그 에러 문구를 그대로 보여준다).
  async function handleDelete() {
    setDeleteError(null);
    const spotId = (row as AdminOpenSpaceRow).id;
    try {
      const previewRes = await fetch(`/api/admin/open-spaces?ids=${encodeURIComponent(spotId)}`);
      const previewData = await previewRes.json();
      if (!previewRes.ok) throw new Error(previewData.error ?? '삭제 영향 범위 조회에 실패했습니다.');

      const impact = previewData.impact as {
        events: number;
        reservations: number;
        spot_curations: number;
        spot_weather_caches: number;
        mom_pick_posts: number;
        user_bookmarks: number;
      };
      const impactLines = [
        impact.reservations > 0 ? `⚠️ 실제 예약 ${impact.reservations}건` : null,
        impact.user_bookmarks > 0 ? `⚠️ 사용자 북마크 ${impact.user_bookmarks}건` : null,
        impact.spot_curations > 0 ? `스팟 큐레이션 ${impact.spot_curations}건(함께 삭제됨)` : null,
        impact.events > 0 ? `연결된 행사 ${impact.events}건(위치 연결만 해제됨)` : null,
        impact.mom_pick_posts > 0 ? `맘스픽 게시글 ${impact.mom_pick_posts}건(위치 연결만 해제됨)` : null,
      ].filter((line): line is string => Boolean(line));
      const confirmMessage =
        impactLines.length > 0
          ? `이 스팟을 삭제하면:\n${impactLines.join('\n')}\n\n정말 삭제하시겠습니까?`
          : '이 스팟을 삭제할까요? 연결된 데이터는 없습니다.';
      if (!window.confirm(confirmMessage)) return;

      setIsDeleting(true);
      const res = await fetch('/api/admin/open-spaces', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [spotId] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '삭제에 실패했습니다.');

      onDeleted?.(spotId);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : '삭제에 실패했습니다.');
    } finally {
      setIsDeleting(false);
    }
  }

  const structuredEntries = Object.entries(row).filter(([key]) => key !== 'raw_data' && key !== 'raw_payload');

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center" {...backdropDismiss}>
      <div
        className="w-full md:w-[720px] max-h-[85vh] md:max-h-[80vh] overflow-y-auto bg-white rounded-t-2xl md:rounded-2xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900">{title}</h2>
              <p className="text-xs text-gray-400">{subtitle}</p>
            </div>
            <button type="button" onClick={onClose} className="shrink-0 text-gray-400 hover:text-gray-600" aria-label="닫기">
              ✕
            </button>
          </div>

          {table !== 'raw_ingest_data' && table !== 'curated_items' && table !== 'spot_curations' && table !== 'mom_pick_posts' && table !== 'spot_dedup' && table !== 'category_mapping' && onCategoryMinUpdated && (
            <CategoryMinEditor
              table={table}
              row={row as AdminOpenSpaceRow | AdminEventRow}
              categoryMinOptions={categoryMinOptions}
              onUpdated={onCategoryMinUpdated}
            />
          )}

          {table === 'events' && onTargetAudienceUpdated && (
            <TargetAudienceEditor
              row={row as AdminEventRow}
              targetAudienceOptions={targetAudienceOptions}
              onUpdated={onTargetAudienceUpdated}
            />
          )}

          {table === 'events' && onOperatingScheduleUpdated && (
            <OperatingScheduleEditor row={row as AdminEventRow} onUpdated={onOperatingScheduleUpdated} />
          )}

          {table === 'events' && onLocationUpdated && <LocationEditor row={row as AdminEventRow} onUpdated={onLocationUpdated} />}

          {table === 'events' && onSpaceLinkUpdated && (
            <SpaceLinkEditor row={row as AdminEventRow} serviceCategories={serviceCategories} onUpdated={onSpaceLinkUpdated} />
          )}

          {/* [이벤트픽 관리자 블로그 큐레이션](2026-09-11 사용자 지시, todo.md
              개선사항7-2): "Events 탭 상세 팝업 내부에 블로그 큐레이션 버튼 추가" —
              open_spaces의 블로그 큐레이션 버튼과 같은 톤/위치 관례를 따른다. */}
          {table === 'events' && (
            <button
              type="button"
              onClick={() => setIsEventBlogCurationModalOpen(true)}
              className="mt-3 w-full rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
            >
              🔍 블로그 큐레이션 (방문 후기/추천 블로그 등록)
            </button>
          )}

          {table === 'open_spaces' && onServiceCategoryUpdated && (
            <ServiceCategoryEditor
              row={row as AdminOpenSpaceRow}
              serviceCategories={serviceCategories}
              onUpdated={onServiceCategoryUpdated}
            />
          )}

          {/* [관리자용 블로그 큐레이션 모달](2026-09-05 사용자 지시, Decision 021):
              "관리자가 장소 상세 페이지에서 버튼을 누르면.." — 이 버튼이 그 트리거다. */}
          {table === 'open_spaces' && onServiceCategoryUpdated && (
            <button
              type="button"
              onClick={() => setIsBlogCurationModalOpen(true)}
              className="mt-3 w-full rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
            >
              🔍 블로그로 큐레이션 (뱃지/노출 중분류 빠르게 채우기)
            </button>
          )}

          {/* [open_spaces 상세에서 스팟 큐레이션 바로 열기](2026-09-08 사용자 지시):
              "스팟큐레이션(가격, 메뉴 등 입력)도 블로그 큐레이션처럼.. 같은 레벨로
              해당 버튼 아래에 스팟 큐레이션 버튼 만들어서.. 누르면 스팟큐레이션
              팝업가서 입력하도록 해줘" — 블로그 큐레이션 버튼과 같은 레벨(바로 아래)에
              둔다. 블로그 큐레이션과 달리 onServiceCategoryUpdated 없이도(노출
              중분류 갱신 콜백과 무관) 항상 열 수 있다 — 스팟 큐레이션은 노출
              중분류를 바꾸지 않는다. */}
          {table === 'open_spaces' && (
            <button
              type="button"
              onClick={() => setIsSpotCurationModalOpen(true)}
              className="mt-2 w-full rounded-xl border border-sky-200 bg-sky-50/60 px-3 py-2.5 text-xs font-semibold text-sky-800 hover:bg-sky-100"
            >
              🏷️ 스팟 큐레이션 (대표 이미지/영업시간/가격/메뉴 입력)
            </button>
          )}

          {/* [open_spaces 상세에서 중복 스팟 검토](2026-09-09 사용자 지시): "8월 일반캠핑존
              C형.. 장소기준으로는 난지캠핑장 하나 아니야?" → "중복스팟 검수 및 매핑..
              해당 스팟 상세에 대하여 버튼 만들어서.." — 위 두 버튼과 같은 레벨에 둔다.
              기존 관리자 '중복 스팟 그룹핑' 탭(spot-dedup-panel.tsx)의 병합 로직을
              그대로 재사용한다(SpotDedupQuickModal 참고, 제5장 제4조). */}
          {table === 'open_spaces' && (
            <button
              type="button"
              onClick={() => setIsSpotDedupModalOpen(true)}
              className="mt-2 w-full rounded-xl border border-orange-200 bg-orange-50/60 px-3 py-2.5 text-xs font-semibold text-orange-800 hover:bg-orange-100"
            >
              🔗 중복 스팟 검토 (같은 장소 병합)
            </button>
          )}

          {/* [개선사항2](todo.md, 2026-09-09) "다만 어떻게 병합되었는지 원본에 대한
              정보는 어떤 방식이든 확인할 수 있어야합니다" — 목록에는 이제 그룹 대표
              1건만 보이므로(data-grid/route.ts), 그 대표에서 원본 멤버 전체를 열람할
              수 있는 버튼을 별도로 둔다. group_id가 있는 행(=대표)에만 보인다. */}
          {table === 'open_spaces' && (row as AdminOpenSpaceRow).group_id && (
            <button
              type="button"
              onClick={() => setIsGroupMembersModalOpen(true)}
              className="mt-2 w-full rounded-xl border border-violet-200 bg-violet-50/60 px-3 py-2.5 text-xs font-semibold text-violet-800 hover:bg-violet-100"
            >
              🔗 병합된 원본 데이터 보기
            </button>
          )}

          {/* [todo.md 개선사항 5](2026-09-03): 스팟픽에 잘못 분류돼 있던 데이터(예: 실제로는
              기간이 있는 행사·체험 프로그램)를 이벤트픽 테이블로 옮기는 액션. open_spaces
              탭에서만 의미가 있다. */}
          {table === 'open_spaces' && onMigratedToEvent && (
            <div className="mt-3 rounded-xl border border-purple-200 bg-purple-50/60 p-3 flex items-center justify-between gap-3">
              <p className="text-xs text-purple-800">
                이 데이터가 사실은 시작/종료가 있는 행사·체험 프로그램인가요?
              </p>
              <button
                type="button"
                onClick={() => setIsMigrateModalOpen(true)}
                className="shrink-0 rounded-full bg-purple-600 text-white text-xs font-semibold px-3 py-1.5 hover:bg-purple-700"
              >
                🚚 이벤트픽으로 이동
              </button>
            </div>
          )}

          {/* [open_spaces 삭제 기능](2026-09-06 사용자 지시): "내가 불필요하다고
              생각하는건 관리자 화면에서 삭제하는게 더 좋을까?" */}
          {table === 'open_spaces' && (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50/60 p-3 flex items-center justify-between gap-3">
              <p className="text-xs text-red-800">불필요하거나 잘못 등록된 데이터인가요?</p>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="shrink-0 rounded-full bg-red-600 text-white text-xs font-semibold px-3 py-1.5 hover:bg-red-700 disabled:opacity-50"
              >
                {isDeleting ? '삭제 중...' : '🗑 이 스팟 삭제'}
              </button>
            </div>
          )}
          {deleteError && <p className="mt-1.5 text-xs text-red-600">{deleteError}</p>}

          <h3 className="mt-4 text-xs font-semibold text-gray-500">전체 컬럼</h3>
          <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            {structuredEntries.map(([key, value]) => {
              const isUrl = isHttpUrl(value);
              return (
                <div key={key} className="flex gap-1.5 overflow-hidden">
                  <span className="shrink-0 text-gray-400">{key}:</span>
                  {isUrl && isImageUrlField(key, value) ? (
                    <a href={value} target="_blank" rel="noopener noreferrer" className="shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={value}
                        alt={key}
                        className="h-14 w-14 object-cover rounded border border-gray-200"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    </a>
                  ) : isUrl ? (
                    <a
                      href={value}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 underline truncate hover:text-blue-700"
                    >
                      {value}
                    </a>
                  ) : (
                    <span className="text-gray-700 truncate">{value === null || value === undefined ? 'NULL' : String(value)}</span>
                  )}
                </div>
              );
            })}
          </div>

          <h3 className="mt-4 text-xs font-semibold text-gray-500">
            {table === 'raw_ingest_data' ? 'raw_payload (원문 JSON)' : 'raw_data (원문 JSON)'}
          </h3>

          {/* [원문 JSON 필드를 HTML로 보기](2026-09-06 사용자 지시): "DTLCONT 같은
              컬럼에는 글이 쫙 있긴한데.. html로 되어있는거 같아.. 해당 컬럼만 좀
              눌러서 다시 팝업띄워서 html로 보고 닫을수 있는 기능달던가해줘" */}
          {htmlLikeFields.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {htmlLikeFields.map(([key, value]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setHtmlPreviewField({ key, value })}
                  className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-100"
                >
                  🔍 {key} HTML로 보기
                </button>
              ))}
            </div>
          )}

          {/* [원문 JSON 필드 정돈해서 보기](2026-09-12 사용자 지시): "\r\n&nbsp;&nbsp;
              - 4회차 - ... 이런식으로 되어있으면 \r \n같은거 적용해서 정돈된
              글로 볼수있게해줘" — HTML 태그는 없지만 이스케이프된 개행/엔티티만
              섞여 원문 그대로는 알아보기 힘든 필드용 버튼. */}
          {messyTextFields.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {messyTextFields.map(([key, value]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCleanedTextPreviewField({ key, value })}
                  className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100"
                >
                  📄 {key} 정돈해서 보기
                </button>
              ))}
            </div>
          )}

          <pre className="mt-1.5 rounded-lg bg-gray-900 text-gray-100 text-xs p-3 overflow-x-auto whitespace-pre-wrap break-words">
            {prettyJson}
          </pre>
        </div>
      </div>

      {htmlPreviewField && (
        <HtmlFieldPreviewModal field={htmlPreviewField} onClose={() => setHtmlPreviewField(null)} />
      )}

      {cleanedTextPreviewField && (
        <CleanedTextPreviewModal field={cleanedTextPreviewField} onClose={() => setCleanedTextPreviewField(null)} />
      )}

      {isMigrateModalOpen && table === 'open_spaces' && onMigratedToEvent && (
        <MigrateToEventModal
          row={row as AdminOpenSpaceRow}
          onClose={() => setIsMigrateModalOpen(false)}
          onMigrated={(id) => {
            setIsMigrateModalOpen(false);
            onMigratedToEvent(id);
          }}
        />
      )}

      {isBlogCurationModalOpen && table === 'open_spaces' && onServiceCategoryUpdated && (
        <BlogCurationModal
          spot={{
            id: (row as AdminOpenSpaceRow).id,
            name: (row as AdminOpenSpaceRow).name,
            address: (row as AdminOpenSpaceRow).address,
            service_category_id: (row as AdminOpenSpaceRow).service_category_id,
            sigungu_name: (row as AdminOpenSpaceRow).sigungu_name,
          }}
          serviceCategories={serviceCategories}
          onClose={() => setIsBlogCurationModalOpen(false)}
          onServiceCategoryUpdated={onServiceCategoryUpdated}
        />
      )}

      {isEventBlogCurationModalOpen && table === 'events' && (
        <EventBlogCurationModal
          event={{
            id: (row as AdminEventRow).id,
            title: (row as AdminEventRow).title,
            sigunguName: (row as AdminEventRow).sigungu_name,
          }}
          onClose={() => setIsEventBlogCurationModalOpen(false)}
        />
      )}

      {isSpotCurationModalOpen && table === 'open_spaces' && (
        <SpotCurationQuickModal
          spotId={(row as AdminOpenSpaceRow).id}
          spotName={(row as AdminOpenSpaceRow).name}
          spotAddress={(row as AdminOpenSpaceRow).address}
          onClose={() => setIsSpotCurationModalOpen(false)}
          onSaved={() => setIsSpotCurationModalOpen(false)}
        />
      )}

      {isSpotDedupModalOpen && table === 'open_spaces' && (
        <SpotDedupQuickModal
          spot={{
            id: (row as AdminOpenSpaceRow).id,
            name: (row as AdminOpenSpaceRow).name,
            category: (row as AdminOpenSpaceRow).category,
            category_min: (row as AdminOpenSpaceRow).category_min,
            address: (row as AdminOpenSpaceRow).address,
            service_category_id: (row as AdminOpenSpaceRow).service_category_id,
          }}
          serviceCategories={serviceCategories}
          onClose={() => setIsSpotDedupModalOpen(false)}
        />
      )}

      {isGroupMembersModalOpen && table === 'open_spaces' && (row as AdminOpenSpaceRow).group_id && (
        <GroupMembersModal
          groupId={(row as AdminOpenSpaceRow).group_id as string}
          onClose={() => setIsGroupMembersModalOpen(false)}
        />
      )}
    </div>
  );
}

// [개선사항2](todo.md, 2026-09-09) "다만 어떻게 병합되었는지 원본에 대한 정보는
// 어떤 방식이든 확인할 수 있어야합니다" — 그룹 대표 상세에서 여는, 같은 group_id를
// 공유하는 전체 원본 멤버(대표 포함) 목록. HtmlFieldPreviewModal과 동일하게 이
// 파일 안의 작은 지역 컴포넌트로 둔다(다른 화면에서 재사용되지 않음).
function GroupMembersModal({ groupId, onClose }: { groupId: string; onClose: () => void }) {
  const backdropDismiss = useBackdropDismiss(onClose);
  const [members, setMembers] = useState<GroupMemberRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/spot-dedup/group-members?group_id=${encodeURIComponent(groupId)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? '그룹 멤버 조회에 실패했습니다.');
        if (!cancelled) setMembers(data.items ?? []);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : '그룹 멤버 조회에 실패했습니다.');
      });
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  return (
    <div className="fixed inset-0 bg-black/50 z-[80] flex items-end md:items-center justify-center" {...backdropDismiss}>
      <div
        className="w-full md:w-[560px] max-h-[80vh] overflow-y-auto bg-white rounded-t-2xl md:rounded-2xl shadow-xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-gray-900">🔗 병합된 원본 데이터{members ? ` (${members.length}건)` : ''}</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        {!members && !error && <p className="text-xs text-gray-400">불러오는 중...</p>}
        {members && (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-xs text-left">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="py-2 px-3">상호명</th>
                  <th className="py-2 px-3">원본 중분류</th>
                  <th className="py-2 px-3">출처</th>
                  <th className="py-2 px-3">구분</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {members.map((m) => (
                  <tr key={m.id}>
                    <td className="py-2 px-3 font-medium text-gray-800">{m.name}</td>
                    <td className="py-2 px-3 text-gray-600">{m.category_min ?? m.category}</td>
                    <td className="py-2 px-3 text-gray-500">{m.source ?? m.source_type}</td>
                    <td className="py-2 px-3">
                      {m.is_dedup_representative ? (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700">대표</span>
                      ) : (
                        <span className="text-[10px] text-gray-400">원본</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// [원문 JSON 필드를 HTML로 보기](2026-09-06 사용자 지시): raw_data/raw_payload의
// 특정 필드(예: 서울시 공공 예약 API의 DTLCONT — 상세 안내문이 HTML로 인코딩돼
// 있음)를 실제 HTML로 렌더링해서 읽기 좋게 보여준다. 이 값은 우리 파이프라인이
// 이미 원천 그대로 수집해 DB(raw_data)에 저장해둔, 관리자만 보는 디버그용
// 데이터라 dangerouslySetInnerHTML을 쓴다 — 목적 자체가 "HTML을 HTML로 보기"이며
// (블로그 큐레이션의 외부 크롤링 텍스트처럼 그대로 렌더링하면 안 되는 경우와
// 다르다), 일반 사용자에게 노출되는 화면이 아니다.
function HtmlFieldPreviewModal({ field, onClose }: { field: { key: string; value: string }; onClose: () => void }) {
  const backdropDismiss = useBackdropDismiss(onClose);
  return (
    <div className="fixed inset-0 bg-black/50 z-[80] flex items-end md:items-center justify-center" {...backdropDismiss}>
      <div
        className="w-full md:w-[640px] max-h-[85vh] overflow-y-auto bg-white rounded-t-2xl md:rounded-2xl shadow-xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-gray-900">{field.key} (HTML 미리보기)</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>
        <div
          className="rounded-lg border border-gray-200 p-3 text-sm leading-relaxed text-gray-800 [&_p]:mb-2"
          style={{ whiteSpace: 'pre-wrap' }}
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: field.value }}
        />
      </div>
    </div>
  );
}

// [원문 JSON 필드 정돈해서 보기](2026-09-12 사용자 지시): "html이면 html로 지금처럼
// 볼수있게하는데 html이 아닌경우 이와 같이 되어있는지 확인하고 해당 컬럼 글만
// 정돈돼서 볼수있게" — HtmlFieldPreviewModal과 형태는 같지만, 이 필드엔 진짜
// HTML 태그가 없으므로 dangerouslySetInnerHTML을 쓰지 않고(엔티티를 태그로 오인해
// 렉더링할 위험 없이) cleanupMessyText로 정돈한 일반 텍스트를 그대로 보여준다.
function CleanedTextPreviewModal({ field, onClose }: { field: { key: string; value: string }; onClose: () => void }) {
  const backdropDismiss = useBackdropDismiss(onClose);
  return (
    <div className="fixed inset-0 bg-black/50 z-[80] flex items-end md:items-center justify-center" {...backdropDismiss}>
      <div
        className="w-full md:w-[640px] max-h-[85vh] overflow-y-auto bg-white rounded-t-2xl md:rounded-2xl shadow-xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-gray-900">{field.key} (정돈된 텍스트)</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>
        <div className="rounded-lg border border-gray-200 p-3 text-sm leading-relaxed text-gray-800 whitespace-pre-line">
          {cleanupMessyText(field.value)}
        </div>
      </div>
    </div>
  );
}
