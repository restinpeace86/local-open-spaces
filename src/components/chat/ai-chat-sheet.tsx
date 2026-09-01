'use client';

import { useState } from 'react';
import { NearbyItem } from '@/lib/spaces/get-nearby';
import { formatDistance } from '@/lib/spaces/format';
import { DetailModal } from '@/components/map/detail-modal';
import { getCachedNearbyRestaurants } from '@/lib/ai-chat/nearby-restaurants-cache';
import {
  resolveWhenChoice,
  WhenChoice,
} from '@/lib/ai-chat/date-resolver';
import {
  Budget,
  KidsAgeGroup,
  OutdoorPreference,
  SearchResultItem,
  Vibe,
} from '@/lib/ai-chat/search-engine';
import {
  BUDGET_OPTIONS,
  buildBudgetAck,
  buildKidsAck,
  buildMealQuestion,
  buildTransportAck,
  buildVibeAck,
  buildWhenAck,
  KIDS_AGE_OPTIONS,
  KIDS_COUNT_OPTIONS,
  OUTDOOR_PREFERENCE_OPTIONS,
  TIME_OPTIONS,
  TRANSPORT_OPTIONS,
  VIBE_OPTIONS,
  WHEN_OPTIONS,
} from '@/lib/ai-chat/step-options';

// [스팟픽 AI 맞춤 추천 챗봇 엔진](2026-09-01 사용자 지시): 8단계 인터뷰 상태 머신 +
// 최종 결과 렌더링. 요구사항 2-① "1~8단계 진행 시 LLM을 전혀 호출하지 않음"을 지키기
// 위해 이 컴포넌트는 오직 (a) 프론트 상태 전이 (b) /api/ai-chat/weather(날씨, LLM 미사용
// — 캐시/라이브 예보 조회 + 템플릿 조합) (c) /api/ai-chat/search(최종 검색, LLM은 요약
// 문구 1회 생성에만 사용) 두 API만 호출한다.
type Phase =
  | 'WHEN'
  | 'WHEN_CUSTOM_DATE'
  | 'TIME'
  | 'MEAL'
  | 'TRANSPORT'
  | 'WEATHER_LOADING'
  | 'WEATHER_CHOICE'
  | 'BUDGET'
  | 'KIDS_COUNT'
  | 'KIDS_AGE'
  | 'VIBE'
  | 'SEARCH_LOADING'
  | 'RESULTS'
  | 'EXHAUSTED'
  | 'ERROR';

type ChatMessage = { id: string; from: 'AI' | 'USER'; text: string };

type Answers = {
  whenIso?: string;
  whenLabel?: string;
  timeHour?: number;
  timeLabel?: string;
  wantsMeal?: boolean;
  transportRadiusMeters?: number;
  outdoorPreference?: OutdoorPreference;
  budget?: Budget;
  kidsCount?: number;
  kidsAgeGroup?: KidsAgeGroup;
  vibe?: Vibe;
  vibeLabel?: string;
};

let messageIdSeq = 0;
function nextMessageId(): string {
  messageIdSeq += 1;
  return `m${messageIdSeq}`;
}

export function AiChatSheet({ center, onClose }: { center: { lat: number; lng: number }; onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: nextMessageId(), from: 'AI', text: '안녕하세요! 오늘 아이와 함께할 나들이 장소를 찾아드릴게요 😊 언제 나들이 가실 예정인가요?' },
  ]);
  const [phase, setPhase] = useState<Phase>('WHEN');
  const [answers, setAnswers] = useState<Answers>({});
  const [customDateInput, setCustomDateInput] = useState('');
  const [kidsCountDraft, setKidsCountDraft] = useState<number | null>(null);
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [exhaustedMessage, setExhaustedMessage] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<NearbyItem | null>(null);
  const [restaurantsOpen, setRestaurantsOpen] = useState(false);
  const [restaurantsLoading, setRestaurantsLoading] = useState(false);
  const [restaurants, setRestaurants] = useState<NearbyItem[] | null>(null);

  function pushUser(text: string) {
    setMessages((prev) => [...prev, { id: nextMessageId(), from: 'USER', text }]);
  }
  function pushAi(text: string) {
    setMessages((prev) => [...prev, { id: nextMessageId(), from: 'AI', text }]);
  }

  // ---- 1단계: When ----
  function handleWhenSelect(choice: WhenChoice, label: string) {
    if (choice === 'CUSTOM') {
      setPhase('WHEN_CUSTOM_DATE');
      return;
    }
    const iso = resolveWhenChoice(choice, null);
    if (!iso) return;
    commitWhen(iso, label);
  }

  function handleCustomDateConfirm() {
    const iso = resolveWhenChoice('CUSTOM', customDateInput);
    if (!iso) return;
    commitWhen(iso, customDateInput);
  }

  function commitWhen(iso: string, label: string) {
    pushUser(label);
    setAnswers((a) => ({ ...a, whenIso: iso, whenLabel: label }));
    pushAi(buildWhenAck(label));
    setPhase('TIME');
  }

  // ---- 2단계: Time ----
  function handleTimeSelect(hour: number, label: string) {
    pushUser(label);
    const nextAnswers = { ...answers, timeHour: hour, timeLabel: label };
    setAnswers(nextAnswers);
    pushAi(buildMealQuestion(label));
    setPhase('MEAL');
  }

  // ---- 3단계: Meal(Contextual) ----
  function handleMealSelect(wantsMeal: boolean) {
    pushUser(wantsMeal ? '네, 밖에서 먹을래요' : '아니요, 괜찮아요');
    setAnswers((a) => ({ ...a, wantsMeal }));
    pushAi(buildTransportAck());
    setPhase('TRANSPORT');
  }

  // ---- 4단계: Transport & Distance ----
  async function handleTransportSelect(radiusMeters: number, label: string) {
    pushUser(label);
    const nextAnswers = { ...answers, transportRadiusMeters: radiusMeters };
    setAnswers(nextAnswers);
    setPhase('WEATHER_LOADING');

    try {
      const res = await fetch('/api/ai-chat/weather', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isoDate: nextAnswers.whenIso, hour: nextAnswers.timeHour, lat: center.lat, lng: center.lng }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '날씨 조회 실패');
      pushAi(data.reactionText);
      setPhase('WEATHER_CHOICE');
    } catch {
      pushAi('앗, 날씨 정보를 불러오는 데 문제가 생겼어요. 일단 야외/실내 중 편하신 쪽을 골라주세요!');
      setPhase('WEATHER_CHOICE');
    }
  }

  // ---- 5단계: Weather & Air ----
  function handleOutdoorPreferenceSelect(pref: OutdoorPreference, label: string) {
    pushUser(label);
    setAnswers((a) => ({ ...a, outdoorPreference: pref }));
    pushAi(buildBudgetAck());
    setPhase('BUDGET');
  }

  // ---- 6단계: Budget ----
  function handleBudgetSelect(budget: Budget, label: string) {
    pushUser(label);
    setAnswers((a) => ({ ...a, budget }));
    pushAi(buildKidsAck());
    setPhase('KIDS_COUNT');
  }

  // ---- 7단계: Kids ----
  function handleKidsCountSelect(count: number) {
    setKidsCountDraft(count);
    pushUser(count >= 3 ? '3명 이상' : `${count}명`);
    setPhase('KIDS_AGE');
  }

  function handleKidsAgeSelect(age: KidsAgeGroup, label: string) {
    pushUser(label);
    setAnswers((a) => ({ ...a, kidsCount: kidsCountDraft ?? 1, kidsAgeGroup: age }));
    pushAi(buildVibeAck());
    setPhase('VIBE');
  }

  // ---- 8단계: Purpose/Vibe → 최종 검색 ----
  async function handleVibeSelect(vibe: Vibe, label: string) {
    pushUser(label);
    const finalAnswers = { ...answers, vibe, vibeLabel: label };
    setAnswers(finalAnswers);
    setPhase('SEARCH_LOADING');

    try {
      const res = await fetch('/api/ai-chat/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers: {
            transportRadiusMeters: finalAnswers.transportRadiusMeters,
            outdoorPreference: finalAnswers.outdoorPreference ?? 'EITHER',
            budget: finalAnswers.budget ?? 'ANY',
            kidsCount: finalAnswers.kidsCount ?? 0,
            kidsAgeGroup: finalAnswers.kidsAgeGroup ?? null,
            vibe: finalAnswers.vibe,
          },
          lat: center.lat,
          lng: center.lng,
          whenLabel: finalAnswers.whenLabel,
          vibeLabel: finalAnswers.vibeLabel,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'AI 추천 검색 실패');

      if (data.exhausted) {
        setExhaustedMessage(data.message);
        pushAi(data.message);
        setPhase('EXHAUSTED');
        return;
      }

      pushAi(data.summaryText);
      setResults(data.results);
      setPhase('RESULTS');
    } catch {
      pushAi('앗, 검색 중 문제가 생겼어요. 잠시 후 다시 시도해주세요.');
      setPhase('ERROR');
    }
  }

  async function loadNearbyRestaurants() {
    setRestaurantsOpen(true);
    if (restaurants != null) return; // 이번 시트 인스턴스에서 이미 불러왔으면 재요청하지 않는다.
    setRestaurantsLoading(true);
    try {
      // [코드 점검 및 성능 안정화](2026-09-01 사용자 지시) 항목 4: 시트를 닫았다 다시
      // 열어도(컴포넌트 리마운트로 위 restaurants state는 초기화됨) 같은 좌표를 서버에
      // 다시 요청하지 않도록 모듈 스코프 캐시를 거친다.
      const data = await getCachedNearbyRestaurants(center.lat, center.lng, async () => {
        const res = await fetch(`/api/ai-chat/nearby-restaurants?lat=${center.lat}&lng=${center.lng}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? '키즈친화 맛집 조회 실패');
        return { items: json.items, radiusMeters: json.radiusMeters };
      });
      setRestaurants(data.items);
    } catch {
      setRestaurants([]);
    } finally {
      setRestaurantsLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center" onClick={onClose}>
      <div
        className="flex h-[85vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl md:h-[80vh] md:w-[480px] md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 p-4">
          <h2 className="text-sm font-semibold text-gray-900">🤖 AI 맞춤 추천</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="shrink-0 text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex flex-col gap-2">
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.from === 'USER' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                    m.from === 'USER' ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}

            {(phase === 'WEATHER_LOADING' || phase === 'SEARCH_LOADING') && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl bg-gray-100 px-3 py-2 text-sm text-gray-400">생각 중...</div>
              </div>
            )}
          </div>

          {phase === 'RESULTS' && (
            <div className="mt-4 flex flex-col gap-2">
              {results.map((r, idx) =>
                r.kind === 'SPOT' ? (
                  <button
                    key={r.item.id}
                    type="button"
                    onClick={() => setSelectedItem(r.item)}
                    className="flex items-center justify-between rounded-xl border border-gray-100 p-3 text-left hover:bg-gray-50"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {idx + 1}. {r.item.name}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {r.item.category_min ?? r.item.category} · {formatDistance(r.item.distance_meters)}
                        {r.item.is_free ? ' · 무료' : ''}
                      </p>
                    </div>
                  </button>
                ) : (
                  <a
                    key={r.item.id}
                    href={r.item.booking_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 p-3 text-left hover:bg-amber-100"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {idx + 1}. {r.item.title}
                      </p>
                      <p className="mt-0.5 text-xs text-amber-700">🎟️ 제휴 특가 · 온라인 예매</p>
                    </div>
                  </a>
                )
              )}

              {answers.wantsMeal && (
                <div className="mt-2 rounded-xl border border-dashed border-gray-200 p-3">
                  {!restaurantsOpen ? (
                    <button type="button" onClick={loadNearbyRestaurants} className="text-sm text-indigo-600 hover:underline">
                      🍽 근처 키즈친화 맛집 보기
                    </button>
                  ) : restaurantsLoading ? (
                    <p className="text-sm text-gray-400">근처 맛집을 찾는 중...</p>
                  ) : restaurants && restaurants.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      {restaurants.map((rest) => (
                        <button
                          key={rest.id}
                          type="button"
                          onClick={() => setSelectedItem(rest)}
                          className="text-left text-sm text-gray-800 hover:underline"
                        >
                          🍽 {rest.name} · {formatDistance(rest.distance_meters)}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400">근처에서 키즈친화 맛집을 찾지 못했어요.</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {phase !== 'RESULTS' && phase !== 'EXHAUSTED' && phase !== 'ERROR' && (
          <div className="border-t border-gray-100 p-3">
            <ChipOptions
              phase={phase}
              onWhenSelect={handleWhenSelect}
              onTimeSelect={handleTimeSelect}
              onMealSelect={handleMealSelect}
              onTransportSelect={handleTransportSelect}
              onOutdoorPreferenceSelect={handleOutdoorPreferenceSelect}
              onBudgetSelect={handleBudgetSelect}
              onKidsCountSelect={handleKidsCountSelect}
              onKidsAgeSelect={handleKidsAgeSelect}
              onVibeSelect={handleVibeSelect}
              customDateInput={customDateInput}
              onCustomDateInputChange={setCustomDateInput}
              onCustomDateConfirm={handleCustomDateConfirm}
            />
          </div>
        )}

        {(phase === 'EXHAUSTED' || phase === 'ERROR') && exhaustedMessage == null && (
          <div className="border-t border-gray-100 p-3 text-center text-xs text-gray-400">대화를 닫고 다시 시도해보세요.</div>
        )}
      </div>

      {selectedItem && <DetailModal item={selectedItem} onClose={() => setSelectedItem(null)} />}
    </div>
  );
}

function ChipButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm text-indigo-700 hover:bg-indigo-100"
    >
      {children}
    </button>
  );
}

function ChipOptions({
  phase,
  onWhenSelect,
  onTimeSelect,
  onMealSelect,
  onTransportSelect,
  onOutdoorPreferenceSelect,
  onBudgetSelect,
  onKidsCountSelect,
  onKidsAgeSelect,
  onVibeSelect,
  customDateInput,
  onCustomDateInputChange,
  onCustomDateConfirm,
}: {
  phase: Phase;
  onWhenSelect: (choice: WhenChoice, label: string) => void;
  onTimeSelect: (hour: number, label: string) => void;
  onMealSelect: (wantsMeal: boolean) => void;
  onTransportSelect: (radiusMeters: number, label: string) => void;
  onOutdoorPreferenceSelect: (pref: OutdoorPreference, label: string) => void;
  onBudgetSelect: (budget: Budget, label: string) => void;
  onKidsCountSelect: (count: number) => void;
  onKidsAgeSelect: (age: KidsAgeGroup, label: string) => void;
  onVibeSelect: (vibe: Vibe, label: string) => void;
  customDateInput: string;
  onCustomDateInputChange: (v: string) => void;
  onCustomDateConfirm: () => void;
}) {
  switch (phase) {
    case 'WHEN':
      return (
        <div className="flex flex-wrap gap-2">
          {WHEN_OPTIONS.map((o) => (
            <ChipButton key={o.id} onClick={() => onWhenSelect(o.id, o.label)}>
              {o.label}
            </ChipButton>
          ))}
        </div>
      );
    case 'WHEN_CUSTOM_DATE':
      return (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={customDateInput}
            onChange={(e) => onCustomDateInputChange(e.target.value)}
            className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
          />
          <ChipButton onClick={onCustomDateConfirm}>확인</ChipButton>
        </div>
      );
    case 'TIME':
      return (
        <div className="flex flex-wrap gap-2">
          {TIME_OPTIONS.map((o) => (
            <ChipButton key={o.id} onClick={() => onTimeSelect(o.hour, o.label)}>
              {o.label}
            </ChipButton>
          ))}
        </div>
      );
    case 'MEAL':
      return (
        <div className="flex flex-wrap gap-2">
          <ChipButton onClick={() => onMealSelect(true)}>네, 밖에서 먹을래요</ChipButton>
          <ChipButton onClick={() => onMealSelect(false)}>아니요, 괜찮아요</ChipButton>
        </div>
      );
    case 'TRANSPORT':
      return (
        <div className="flex flex-wrap gap-2">
          {TRANSPORT_OPTIONS.map((o) => (
            <ChipButton key={o.id} onClick={() => onTransportSelect(o.radiusMeters, o.label)}>
              {o.label}
            </ChipButton>
          ))}
        </div>
      );
    case 'WEATHER_CHOICE':
      return (
        <div className="flex flex-wrap gap-2">
          {OUTDOOR_PREFERENCE_OPTIONS.map((o) => (
            <ChipButton key={o.id} onClick={() => onOutdoorPreferenceSelect(o.id, o.label)}>
              {o.label}
            </ChipButton>
          ))}
        </div>
      );
    case 'BUDGET':
      return (
        <div className="flex flex-wrap gap-2">
          {BUDGET_OPTIONS.map((o) => (
            <ChipButton key={o.id} onClick={() => onBudgetSelect(o.id, o.label)}>
              {o.label}
            </ChipButton>
          ))}
        </div>
      );
    case 'KIDS_COUNT':
      return (
        <div className="flex flex-wrap gap-2">
          {KIDS_COUNT_OPTIONS.map((count) => (
            <ChipButton key={count} onClick={() => onKidsCountSelect(count)}>
              {count >= 3 ? '3명 이상' : `${count}명`}
            </ChipButton>
          ))}
        </div>
      );
    case 'KIDS_AGE':
      return (
        <div className="flex flex-wrap gap-2">
          {KIDS_AGE_OPTIONS.map((o) => (
            <ChipButton key={o.id} onClick={() => onKidsAgeSelect(o.id, o.label)}>
              {o.label}
            </ChipButton>
          ))}
        </div>
      );
    case 'VIBE':
      return (
        <div className="flex flex-wrap gap-2">
          {VIBE_OPTIONS.map((o) => (
            <ChipButton key={o.id} onClick={() => onVibeSelect(o.id, `${o.emoji} ${o.label}`)}>
              {o.emoji} {o.label}
            </ChipButton>
          ))}
        </div>
      );
    default:
      return null;
  }
}
