'use client';

import { useEffect, useState } from 'react';
import { NearbyItem } from '@/lib/spaces/get-nearby';
import { formatDistance } from '@/lib/spaces/format';
import { DetailModal } from '@/components/map/detail-modal';
import { getCachedNearbyRestaurants } from '@/lib/ai-chat/nearby-restaurants-cache';
import { hasConsumedAnonymousFreeUse, markAnonymousFreeUseConsumed } from '@/lib/ai-chat/free-trial';
import { useUser } from '@/hooks/use-user';
import { useUserLocation } from '@/hooks/use-user-location';
import { getMyProfile, Profile } from '@/lib/auth/profile';
import { calculateAgesFromBirthYears, deriveKidsAgeGroup, buildPersonalizedGreeting } from '@/lib/ai-chat/personalization';
import { LocationOnboardingModal } from '@/components/map/location-onboarding-modal';
import { UserLocation } from '@/lib/location/user-location-storage';
import { isToday, resolveWhenChoice, WhenChoice } from '@/lib/ai-chat/date-resolver';
import { OutdoorRecommendation } from '@/lib/ai-chat/weather-reaction';
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
  buildRegionQuestion,
  buildTimeAck,
  buildTransportAck,
  buildVibeAck,
  KIDS_AGE_OPTIONS,
  KIDS_COUNT_OPTIONS,
  OUTDOOR_PREFERENCE_OPTIONS,
  REGION_OPTIONS,
  TIME_OPTIONS,
  TRANSPORT_OPTIONS,
  VIBE_OPTIONS,
  WEATHER_INTRO_CHOICE_OPTIONS,
  WeatherIntroChoice,
  WHEN_OPTIONS,
} from '@/lib/ai-chat/step-options';

// [AI 챗봇 맞춤 추천 상세 구현(초개인화 고도화)](2026-09-02 사용자 지시): 기존 8단계
// 인터뷰(2026-09-01)를 아래 순서로 재편했다.
//   1. WEATHER_INTRO: 실행 즉시 오늘 날씨를 체크해 "구체적인 제안"을 먼저 던진다(Step 1).
//   2. WHEN: 오늘 바로 vs 다른 날 — 다른 날을 고르면 그 날짜 예보로 1번을 다시 수행한다.
//   3. REGION: 프로필 기본 지역(우리 동네)을 원클릭 기본값으로 제안한다(Step 1).
//   4. TIME → MEAL(조건부 꼬리질문) → TRANSPORT → BUDGET.
//   5. 로그인 유저의 profiles.birth_years(Decision 018)로 나이를 자동 환산할 수 있으면
//      KIDS_COUNT/KIDS_AGE를 건너뛴다(Step 2 "나이 묻는 스텝 절대 금지").
//   6. VIBE → 최종 검색(찜/방문 이력 반영은 search-engine.ts/서버 라우트가 담당, Step 3).
// 여전히 LLM은 최종 요약(summary.ts) 1회에만 쓴다(요구사항 2-①, 기존 원칙 유지).
type Phase =
  | 'WEATHER_INTRO_LOADING'
  | 'WEATHER_INTRO_CHOICE'
  | 'WEATHER_MANUAL_CHOICE'
  | 'WHEN'
  | 'WHEN_CUSTOM_DATE'
  | 'REGION'
  | 'TIME'
  | 'MEAL'
  | 'TRANSPORT'
  | 'BUDGET'
  | 'KIDS_COUNT'
  | 'KIDS_AGE'
  | 'VIBE'
  | 'SEARCH_LOADING'
  | 'RESULTS'
  | 'EXHAUSTED'
  | 'LIMIT_REACHED'
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

// 시간(TIME) 질문 이전에 날씨를 미리 확인해야 해서(Step 1) 아직 정확한 출발 시각을 모른다
// — 하루의 대표 시각(정오)으로 그날의 전반적인 날씨 개요를 보여준다(구현 판단, 기록에 명시).
const REPRESENTATIVE_WEATHER_HOUR = 12;
// [최종 출력 UX 감성 완성도] "제출 직후 바로 답이 나오지 않고 1~1.5초의 '생각 중...' 텀을
// 부여" — 실제 네트워크가 더 빨리 응답해도 최소 체감 로딩을 보장한다.
const MIN_SEARCH_LOADING_MS = 1300;

let messageIdSeq = 0;
function nextMessageId(): string {
  messageIdSeq += 1;
  return `m${messageIdSeq}`;
}

export function AiChatSheet({ center, onClose }: { center: { lat: number; lng: number }; onClose: () => void }) {
  const { user } = useUser();
  const { sigunguName } = useUserLocation();
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: nextMessageId(), from: 'AI', text: '안녕하세요! 오늘 아이와 함께할 나들이 장소를 찾아드릴게요 😊 먼저 오늘 날씨부터 확인해볼게요...' },
  ]);
  const [phase, setPhase] = useState<Phase>('WEATHER_INTRO_LOADING');
  const [answers, setAnswers] = useState<Answers>({});
  const [customDateInput, setCustomDateInput] = useState('');
  const [kidsCountDraft, setKidsCountDraft] = useState<number | null>(null);
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [exhaustedMessage, setExhaustedMessage] = useState<string | null>(null);
  const [limitReachedMessage, setLimitReachedMessage] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<NearbyItem | null>(null);
  const [restaurantsOpen, setRestaurantsOpen] = useState(false);
  const [restaurantsLoading, setRestaurantsLoading] = useState(false);
  const [restaurants, setRestaurants] = useState<NearbyItem[] | null>(null);

  // [Step 1 지역 선택] "다른 지역으로 바꿀래요"를 고르면 이 세션(챗봇 인터뷰) 한정으로만
  // 검색 중심 좌표를 바꾼다 — 앱 전역 위치(useUserLocation의 localStorage)는 건드리지
  // 않는다(챗봇 질문 하나 때문에 전체 앱 위치가 조용히 바뀌면 사용자가 놀랄 수 있다).
  const [searchCenter, setSearchCenter] = useState(center);
  const [showRegionPicker, setShowRegionPicker] = useState(false);

  // [Step 1 선제적 제안] 처음(오늘 날씨)인지, WHEN에서 다른 날짜를 고른 뒤 재확인 중인지에
  // 따라 3지 선다 응답 후 다음 단계(WHEN vs REGION)가 달라진다.
  const [weatherStage, setWeatherStage] = useState<'INITIAL' | 'AFTER_DATE'>('INITIAL');
  const [lastWeatherMode, setLastWeatherMode] = useState<OutdoorRecommendation>('EITHER');

  // [Step 2 프로필 자동 연동] 로그인 사용자의 birth_years로 나이를 자동 환산해 KIDS_COUNT/
  // KIDS_AGE 질문을 건너뛴다. 아직 로딩 전이거나 데이터가 없으면 null → 기존처럼 직접 묻는다.
  const [profile, setProfile] = useState<Profile | null>(null);
  const [derivedKidsCount, setDerivedKidsCount] = useState<number | null>(null);
  const [derivedKidsAgeGroup, setDerivedKidsAgeGroup] = useState<KidsAgeGroup | null>(null);

  function pushUser(text: string) {
    setMessages((prev) => [...prev, { id: nextMessageId(), from: 'USER', text }]);
  }
  function pushAi(text: string) {
    if (!text) return;
    setMessages((prev) => [...prev, { id: nextMessageId(), from: 'AI', text }]);
  }

  // ---- 0단계(신규): 마운트 시 오늘 날씨 선제 제안 + (로그인 시) 프로필 자동 연동 ----
  useEffect(() => {
    fetchWeatherIntro(resolveWhenChoice('TODAY', null)!, '오늘', 'INITIAL');

    if (user) {
      getMyProfile()
        .then((p) => {
          setProfile(p);
          if (!p) return;
          const ages = calculateAgesFromBirthYears(p.birth_years);
          const ageGroup = deriveKidsAgeGroup(ages);
          if (ageGroup) {
            setDerivedKidsCount(p.birth_years.length);
            setDerivedKidsAgeGroup(ageGroup);
            // Supabase Auth 제공자(Kakao/Google)가 내려주는 표시 이름 필드명이 서로 달라
            // (추측 금지) 흔히 쓰이는 후보만 순서대로 시도하고, 전부 없으면 이름 없이
            // 인사한다(personalization.ts가 그 경우를 자연스럽게 처리).
            const metadata = user?.user_metadata as Record<string, unknown> | undefined;
            const displayName =
              (metadata?.name as string | undefined) ??
              (metadata?.full_name as string | undefined) ??
              (metadata?.nickname as string | undefined) ??
              null;
            pushAi(buildPersonalizedGreeting(ages, displayName));
          }
        })
        .catch(() => {
          // 프로필 조회 실패해도 인터뷰는 계속 진행(기존 수동 KIDS 단계로 자연 폴백).
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- 1단계(신규): Weather Intro — 오늘(또는 재확인 날짜)의 날씨로 먼저 제안한다 ----
  async function fetchWeatherIntro(isoDate: string, label: string, stage: 'INITIAL' | 'AFTER_DATE') {
    setWeatherStage(stage);
    setPhase('WEATHER_INTRO_LOADING');
    try {
      const res = await fetch('/api/ai-chat/weather', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isoDate, hour: REPRESENTATIVE_WEATHER_HOUR, lat: searchCenter.lat, lng: searchCenter.lng }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '날씨 조회 실패');
      setLastWeatherMode(data.recommendedMode as OutdoorRecommendation);
      pushAi(data.reactionText);
      setPhase('WEATHER_INTRO_CHOICE');
    } catch {
      setLastWeatherMode('EITHER');
      pushAi(`${label} 날씨 정보를 불러오는 데 문제가 생겼어요. 야외/실내 중 편하신 쪽을 골라주세요!`);
      setPhase('WEATHER_INTRO_CHOICE');
    }
  }

  function handleWeatherIntroChoice(choice: WeatherIntroChoice, label: string) {
    pushUser(label);
    if (choice === 'CUSTOM') {
      pushAi('어떤 스타일이 좋으세요?');
      setPhase('WEATHER_MANUAL_CHOICE');
      return;
    }
    commitOutdoorPreference(choice === 'ACCEPT' ? lastWeatherMode : 'EITHER');
  }

  function handleManualOutdoorPreference(pref: OutdoorPreference, label: string) {
    pushUser(label);
    commitOutdoorPreference(pref);
  }

  function commitOutdoorPreference(pref: OutdoorPreference) {
    setAnswers((a) => ({ ...a, outdoorPreference: pref }));
    if (weatherStage === 'INITIAL') {
      pushAi('오늘 바로 아이와 나들이 다녀오실 계획이신가요, 아니면 다른 날 갈 예정인가요?');
      setPhase('WHEN');
    } else {
      proceedToRegion();
    }
  }

  // ---- 2단계: When ----
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
    if (isToday(iso)) {
      proceedToRegion();
    } else {
      // Step 1: "날짜 선택 시 해당일 예보 기반 제안 멘트 동적 출력" — 같은 흐름을 그 날짜로
      // 한 번 더 태운다.
      fetchWeatherIntro(iso, label, 'AFTER_DATE');
    }
  }

  // ---- 3단계(신규): Region ----
  function proceedToRegion() {
    pushAi(buildRegionQuestion(sigunguName));
    setPhase('REGION');
  }

  function handleRegionSelect(id: 'DEFAULT' | 'OTHER', label: string) {
    pushUser(label);
    if (id === 'DEFAULT') {
      proceedToTime();
    } else {
      setShowRegionPicker(true);
    }
  }

  function handleRegionConfirm(location: UserLocation) {
    setSearchCenter({ lat: location.lat, lng: location.lng });
    setShowRegionPicker(false);
    pushAi(`${location.address_name} 근처로 알아봐드릴게요!`);
    proceedToTime();
  }

  function proceedToTime() {
    pushAi(buildTimeAck());
    setPhase('TIME');
  }

  // ---- 4단계: Time ----
  function handleTimeSelect(hour: number, label: string) {
    pushUser(label);
    setAnswers((a) => ({ ...a, timeHour: hour, timeLabel: label }));
    pushAi(buildMealQuestion(label));
    setPhase('MEAL');
  }

  // ---- 5단계: Meal(Contextual) ----
  function handleMealSelect(wantsMeal: boolean) {
    pushUser(wantsMeal ? '네, 밖에서 맛있는 거 먹을래요 🍲' : '아니요, 도시락 싸가거나 따로 먹어요 🍱');
    setAnswers((a) => ({ ...a, wantsMeal }));
    pushAi(buildTransportAck());
    setPhase('TRANSPORT');
  }

  // ---- 6단계: Transport & Distance ----
  function handleTransportSelect(radiusMeters: number, label: string) {
    pushUser(label);
    setAnswers((a) => ({ ...a, transportRadiusMeters: radiusMeters }));
    pushAi(buildBudgetAck());
    setPhase('BUDGET');
  }

  // ---- 7단계: Budget → (프로필에 나이 정보가 있으면 Kids 건너뛰고 바로 Vibe) ----
  function handleBudgetSelect(budget: Budget, label: string) {
    pushUser(label);
    setAnswers((a) => ({ ...a, budget }));

    if (derivedKidsAgeGroup && derivedKidsCount != null) {
      setAnswers((a) => ({ ...a, budget, kidsCount: derivedKidsCount, kidsAgeGroup: derivedKidsAgeGroup }));
      pushAi(buildVibeAck());
      setPhase('VIBE');
      return;
    }

    pushAi(buildKidsAck());
    setPhase('KIDS_COUNT');
  }

  // ---- 8단계: Kids(프로필에 나이 정보가 없는 사용자 전용 폴백) ----
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

  // ---- 9단계: Purpose/Vibe → 최종 검색 ----
  async function handleVibeSelect(vibe: Vibe, label: string) {
    pushUser(label);
    const finalAnswers = { ...answers, vibe, vibeLabel: label };
    setAnswers(finalAnswers);

    // [Decision 019](2026-09-02): 비로그인 사용자는 서버가 식별할 수 없어 여기서 미리
    // localStorage 소진 여부를 확인한다(로그인 사용자는 서버가 profiles.
    // ai_chat_free_uses_used로 확정 판단하므로 아래 API 응답의 limitReached만 본다).
    if (!user && hasConsumedAnonymousFreeUse()) {
      const message = '무료 체험을 이미 사용하셨어요. 로그인 후 맘스픽에 첫 후기나 체크리스트를 남기면 챗봇을 무제한으로 이용할 수 있어요!';
      setLimitReachedMessage(message);
      pushAi(message);
      setPhase('LIMIT_REACHED');
      return;
    }

    setPhase('SEARCH_LOADING');
    const minLoadingDelay = new Promise((resolve) => setTimeout(resolve, MIN_SEARCH_LOADING_MS));

    try {
      const [res] = await Promise.all([
        fetch('/api/ai-chat/search', {
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
            lat: searchCenter.lat,
            lng: searchCenter.lng,
            whenLabel: finalAnswers.whenLabel,
            vibeLabel: finalAnswers.vibeLabel,
          }),
        }),
        minLoadingDelay,
      ]);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'AI 추천 검색 실패');

      if (data.limitReached) {
        setLimitReachedMessage(data.message);
        pushAi(data.message);
        setPhase('LIMIT_REACHED');
        return;
      }

      if (data.exhausted) {
        if (!user) markAnonymousFreeUseConsumed();
        setExhaustedMessage(data.message);
        pushAi(data.message);
        setPhase('EXHAUSTED');
        return;
      }

      if (!user) markAnonymousFreeUseConsumed();
      pushAi(data.summaryText);
      // [Step 3-①] 찜한 장소가 결과에 포함돼 있으면 별도 하이라이트 멘트를 덧붙인다(서버가
      // 실제 조회한 이름을 그대로 쓰므로 LLM 환각 위험이 없다).
      if (data.bookmarkedSpotName) {
        pushAi(`아, 그리고 엄마가 전에 찜해두셨던 [${data.bookmarkedSpotName}]이 마침 오늘 조건에 딱 맞네요! 여기도 같이 챙겨둘게요.`);
      }
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
      const data = await getCachedNearbyRestaurants(searchCenter.lat, searchCenter.lng, async () => {
        const res = await fetch(`/api/ai-chat/nearby-restaurants?lat=${searchCenter.lat}&lng=${searchCenter.lng}`);
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

            {(phase === 'WEATHER_INTRO_LOADING' || phase === 'SEARCH_LOADING') && (
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
                    className={`flex items-center justify-between rounded-xl border p-3 text-left hover:bg-gray-50 ${
                      r.isBookmarked ? 'border-rose-200 bg-rose-50' : 'border-gray-100'
                    }`}
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {idx + 1}. {r.item.name} {r.isBookmarked && <span className="text-rose-500">❤️ 찜한 곳</span>}
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

        {phase !== 'RESULTS' && phase !== 'EXHAUSTED' && phase !== 'ERROR' && phase !== 'LIMIT_REACHED' && (
          <div className="border-t border-gray-100 p-3">
            <ChipOptions
              phase={phase}
              onWeatherIntroChoice={handleWeatherIntroChoice}
              onManualOutdoorPreference={handleManualOutdoorPreference}
              onWhenSelect={handleWhenSelect}
              onRegionSelect={handleRegionSelect}
              onTimeSelect={handleTimeSelect}
              onMealSelect={handleMealSelect}
              onTransportSelect={handleTransportSelect}
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

        {phase === 'LIMIT_REACHED' && limitReachedMessage != null && (
          <div className="border-t border-gray-100 p-3 text-center">
            <a
              href="/my"
              className="inline-block rounded-full bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              {user ? '맘스픽에 첫 후기 남기러 가기' : '로그인하러 가기'}
            </a>
          </div>
        )}
      </div>

      {selectedItem && <DetailModal item={selectedItem} onClose={() => setSelectedItem(null)} />}
      {showRegionPicker && (
        <LocationOnboardingModal onConfirm={handleRegionConfirm} onClose={() => setShowRegionPicker(false)} />
      )}
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
  onWeatherIntroChoice,
  onManualOutdoorPreference,
  onWhenSelect,
  onRegionSelect,
  onTimeSelect,
  onMealSelect,
  onTransportSelect,
  onBudgetSelect,
  onKidsCountSelect,
  onKidsAgeSelect,
  onVibeSelect,
  customDateInput,
  onCustomDateInputChange,
  onCustomDateConfirm,
}: {
  phase: Phase;
  onWeatherIntroChoice: (choice: WeatherIntroChoice, label: string) => void;
  onManualOutdoorPreference: (pref: OutdoorPreference, label: string) => void;
  onWhenSelect: (choice: WhenChoice, label: string) => void;
  onRegionSelect: (id: 'DEFAULT' | 'OTHER', label: string) => void;
  onTimeSelect: (hour: number, label: string) => void;
  onMealSelect: (wantsMeal: boolean) => void;
  onTransportSelect: (radiusMeters: number, label: string) => void;
  onBudgetSelect: (budget: Budget, label: string) => void;
  onKidsCountSelect: (count: number) => void;
  onKidsAgeSelect: (age: KidsAgeGroup, label: string) => void;
  onVibeSelect: (vibe: Vibe, label: string) => void;
  customDateInput: string;
  onCustomDateInputChange: (v: string) => void;
  onCustomDateConfirm: () => void;
}) {
  switch (phase) {
    case 'WEATHER_INTRO_CHOICE':
      return (
        <div className="flex flex-wrap gap-2">
          {WEATHER_INTRO_CHOICE_OPTIONS.map((o) => (
            <ChipButton key={o.id} onClick={() => onWeatherIntroChoice(o.id, o.label)}>
              {o.label}
            </ChipButton>
          ))}
        </div>
      );
    case 'WEATHER_MANUAL_CHOICE':
      return (
        <div className="flex flex-wrap gap-2">
          {OUTDOOR_PREFERENCE_OPTIONS.map((o) => (
            <ChipButton key={o.id} onClick={() => onManualOutdoorPreference(o.id, o.label)}>
              {o.label}
            </ChipButton>
          ))}
        </div>
      );
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
    case 'REGION':
      return (
        <div className="flex flex-wrap gap-2">
          {REGION_OPTIONS.map((o) => (
            <ChipButton key={o.id} onClick={() => onRegionSelect(o.id, o.label)}>
              {o.label}
            </ChipButton>
          ))}
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
          <ChipButton onClick={() => onMealSelect(true)}>네, 밖에서 맛있는 거 먹을래요 🍲</ChipButton>
          <ChipButton onClick={() => onMealSelect(false)}>아니요, 도시락 싸가거나 따로 먹어요 🍱</ChipButton>
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
