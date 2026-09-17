'use client';

import { NearbyItem } from '@/lib/spaces/get-nearby';
import { getCategoryMeta } from '@/lib/spaces/category-meta';
import { formatDateRange, formatDistance, formatVenueLine } from '@/lib/spaces/format';

// spec/event/event-card.md 준용 신규 카드 (Task 9-1) — 기존에는 이벤트 전용 카드가 없었고
// ItemListPanel의 리스트 행으로만 표현됐다. 썸네일/상태 뱃지/예약 마감 경고를 갖춘
// 독립 카드 형태가 필요해 새로 만든다(기존 SpaceGridCard는 공간 전용 필드 구성이라 그대로 못 씀).
// [카드 뱃지 문구 정리](2026-08-27 사용자 지시): "현재 이용 가능"/"예약 가능" 슬라이더에서는
// 키즈/어린이 뱃지를 빼 달라는 요청 — EventCard는 카테고리 그리드/검색/무료 피드 등 여러
// 화면에서 공유하는 컴포넌트라(제5장 제4조 기존 구조 우선) 전역으로 뺄 수 없다. 특정 배지
// key만 선택적으로 숨기는 옵션을 추가해 호출부(ReservationOpenSlider)에서만 적용한다.
// [이벤트 카드 텍스트 영역 뱃지 정리](2026-09-04 사용자 지시): 위 hideBadgeKeys는 오직
// 'kids' 뱃지 하나만 숨기는 데 쓰였는데, parental-badges.ts에서 그 뱃지 자체를 아예
// 만들지 않게 바꿔 더 이상 숨길 대상이 없다 — 이 prop과 필터 로직을 완전히 제거한다
// (실제로 unused가 된 코드, 제거가 맞다).
// [이벤트픽 UX/UI 개선](2026-08-29 사용자 지시): 가로 슬라이드에서 뱃지 유무/타이틀 줄바꿈에
// 따라 카드 높이가 제각각이라 스와이프 시 흔들려 보였다 — 버튼에 h-full을 추가해 부모가
// 정한 높이(그리드/플렉스 기본 stretch 정렬로 이미 형제 중 가장 큰 높이만큼 늘어난 래퍼)를
// 그대로 채우게 하고, 타이틀에는 min-h로 2줄 분량을 항상 예약해 1줄짜리 제목도 흔들리지
// 않게 한다. 부모가 높이를 지정하지 않는 기존 화면(그리드/오늘 전체보기 등)에서는 h-full이
// height:auto와 동일하게 동작해 기존 모습에 영향이 없다.
// [EventCard 이미지:텍스트 포션 고정](2026-08-29 사용자 지시, 2026-09-03 비율 조정):
// 기존에는 이미지 영역을 aspect-[16/9](가로세로 비율 기반)로 잡아 카드 실제 높이
// (h-64 등)와 무관하게 이미지 자체 비율로 높이가 정해졌다 — 이제 이미지/텍스트 두
// 영역을 flex-[N]으로 명시해 카드의 고정 높이를 정확한 비율로 나눈다. 텍스트 영역에
// min-h-0 + overflow-hidden을 준 것은 flex 아이템의 기본값(min-height:auto)이 내용물
// 크기만큼은 줄어들지 않으려는 것을 막기 위함이다 — 이게 없으면 제목+장소+날짜가
// 많은 카드에서 텍스트 영역이 비율을 넘겨 버튼 전체 높이가 카드 높이보다 커져 버릴 수
// 있다.
// [비율 5:5로 조정](2026-09-03 사용자 지시): 원래 4:6이었으나, 당시 텍스트 영역에
// 있던 뱃지들을 이미지 오버레이로 옮기면서 텍스트 영역에 필요한 공간이 줄어든 만큼,
// 상대적으로 커진 이미지 영역이 잘 활용되도록 flex-[4]/flex-[6] → flex-[5]/flex-[5]로
// 바꿨다(그 뱃지들 자체는 2026-09-17 Decision 025로 전부 제거됐지만, 비율 자체는
// 여전히 적정해 그대로 둔다).
// [카드 내 이미지/텍스트 영역 비율 불일치 수정 1차 시도](2026-08-30): dateBanner(오늘
// 한정/오늘 마감, 당일 종료 이벤트에만 뜸)를 flex-col의 별도 행에서 이미지 영역 위
// 절대 위치 오버레이로 옮겼다 — 이 자체는 유효한 개선이라 유지하지만, Playwright로
// 실제 렌더링 높이를 실측해 보니 진짜 원인이 아니었다(배너 유무와 무관하게 여전히
// 카드마다 이미지 높이가 92px~224px로 제각각이었음, 아래 2차 원인 참고).
//
// [카드 내 이미지/텍스트 영역 비율 불일치 진짜 원인 및 수정 2차](2026-08-30 사용자 재확인):
// 이미지 영역 div(flex-[4])에 min-h-0이 빠져 있었다 — flex 아이템의 기본값
// min-height:auto는 내용물의 min-content 크기 밑으로는 줄어들지 않으려 하는데,
// <img>(교체 요소)의 min-content 크기는 그 이미지의 **실제 원본 가로세로 비율**을
// 폭(w-full, w-40 카드 기준 고정폭)에 대입한 높이다. 즉 원본 이미지 비율이 제각각인
// 썸네일마다 이미지 영역이 flex-[4]가 지정한 40%가 아니라 "그 이미지의 실제 비율이
// 요구하는 높이"로 늘어나 버렸고, 텍스트 영역(flex-[6], 이쪽은 이미 min-h-0이 있어
// 정상)은 남은 공간만큼만 줄어들어 카드 전체 높이(h-64)는 항상 256px로 같아도 내부
// 이미지:텍스트 분할은 카드마다 완전히 달랐다(실측: 92:162, 223:31, 224:30 등). 이미지
// 영역에도 min-h-0을 추가해 flex-[4]/flex-[6] 비율이 이미지 내용물과 무관하게 항상
// 정확히 지켜지도록 고쳤다(Playwright로 실제 브라우저 렌더링 높이를 재측정해 8장 카드
// 전부 102px:154px로 고정됨을 확인 — 상세 검증 로그는 구현 기록 참고).
// [메인 피드 카드 뱃지를 상세/전체보기로 이동](2026-09-17 사용자 지시, Decision 025 —
// Decision 012·013 개정): "메인 이벤트픽 화면에선 노출 안 할거야, 전체보기했을 때
// 프리뷰카드나 프리뷰카드 눌렀을 때 상세카드 쪽에서만 보이도록 해줘" — 접수 상태
// (booking_status/getEventStatus), 오늘 마감/오늘 한정 배너, 무료/유료, 실내/야외
// 뱃지를 이 메인 피드 카드에서 전부 제거하고 카테고리 뱃지만 남긴다. 제거된 정보는
// 삭제가 아니라 이동이다 — "전체보기" 목록(EventListRow)은 이미 그대로 다 보여주고
// 있고, 상세(DetailModal)에는 이번에 새로 추가했다(정보 손실 없음, 결정 이유는
// project/decision-log.md Decision 025 참고).
export function EventCard({
  item,
  onSelect,
}: {
  item: NearbyItem;
  onSelect: (item: NearbyItem) => void;
}) {
  const meta = getCategoryMeta(item.category);
  const period = formatDateRange(item.start_date, item.end_date);
  // Task 9-1-3: "[장소명] · [시/군/구]" (예: "율동공원 야외무대 · 성남시 분당구")
  const venueLine = formatVenueLine(item.address, item.sigungu_name);
  // [이미지 없는 카드 텍스트 잘림 수정](2026-09-05 사용자 지시): "체험학습장같은경우
  // 이미지 없을때 카드가 텍스트영역이랑 5:5하려고 해서 그런지.. 텍스트 있어도
  // 짤리더라." — 위 5:5 비율은 실제 썸네일이 있는 카드를 기준으로 정한 값인데,
  // open_spaces 연동 카드(체험학습장/캠핑장 등, get-home-feed.ts toSpaceItem 참고)는
  // thumbnail_url이 항상 null이라 이미지 영역에 아무 정보 없는 placeholder
  // 이모지(🖼️)만 뜨면서도 카드 높이의 절반을 그대로 차지해, 남은 절반(텍스트 영역)에
  // 제목+장소+거리+기간까지 다 넣기엔 좁아 잘렸다. 실제 이미지가 없을 때는 이미지
  // 영역을 훨씬 작게(2:8) 줄이고 텍스트 영역에 더 많은 공간을 준다 — 중분류 뱃지는
  // 여전히 이 축소된 이미지 영역 안에 오버레이로 남는다.
  const hasThumbnail = Boolean(item.thumbnail_url);

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className="h-full text-left rounded-2xl border border-gray-200 bg-white overflow-hidden hover:shadow-md transition-shadow flex flex-col"
    >
      <div className={`relative min-h-0 bg-gray-100 ${hasThumbnail ? 'flex-[5]' : 'flex-[2]'}`}>
        {item.thumbnail_url ? (
          // Task 9-3-1(2026-08-22): 이 카드는 항상 하단 피드(가성비 행복/무료·공공)에서만 쓰여
          // 뷰포트 아래에 있으므로 항상 지연 로드한다.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.thumbnail_url} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center text-3xl"
            style={{ backgroundColor: `${meta.color}22` }}
            aria-hidden
          >
            🖼️
          </div>
        )}
        {/* [카드 표준 중분류 표시](2026-08-27 사용자 지시): 5대 UI 카테고리(event_type 기반,
            예: "체험·클래스") 대신 실제 표준 중분류(category_min, 예: "도시농업")를 보여준다.
            색상은 기존처럼 meta.color(5대 카테고리 색 코딩)를 그대로 쓴다 — 중분류 자체는
            색이 없어 상위 대분류 색으로 시각적 구분을 유지한다. category_min이 없으면(이론상
            이벤트픽 3대 조건상 발생하지 않지만 방어적으로) 기존 라벨로 폴백한다. */}
        <span
          className="absolute top-2 left-2 text-[11px] font-semibold px-2 py-0.5 rounded-full text-white"
          style={{ backgroundColor: meta.color }}
        >
          {item.category_min ?? meta.label}
        </span>
      </div>

      <div className={`p-3 min-h-0 overflow-hidden flex flex-col gap-1.5 ${hasThumbnail ? 'flex-[5]' : 'flex-[8]'}`}>
        <p className="text-sm font-medium text-gray-900 line-clamp-2 min-h-[2.5rem]">{item.name}</p>
        {venueLine && <p className="text-xs text-gray-400 line-clamp-1">{venueLine}</p>}
        {/* [개선사항1](2026-09-04 사용자 지시): 상세 페이지를 열지 않고도 목록 카드 단계에서
            바로 거리를 알 수 있도록 상시 노출한다(DetailModal의 "현재 위치에서 X km"와
            동일한 문구/포맷). distance_meters는 이미 서버에서 한 번만 계산돼(get-home-
            feed.ts sortByDistanceIfKnown) NearbyItem에 담겨 오므로, 여기서는 그 값을
            그대로 포맷팅만 한다 — 카드 렌더링마다 다시 계산하지 않는다(성능 최적화
            요건은 이미 서버 사전 계산 구조로 충족돼 있어 추가 작업이 필요 없었다).
            -1은 "위치 미상"을 뜻하는 sentinel이라 숨긴다. */}
        {item.distance_meters >= 0 && (
          <p className="text-xs text-gray-400 line-clamp-1">현재 위치에서 {formatDistance(item.distance_meters)}</p>
        )}
        {period && <p className="text-xs text-gray-400 line-clamp-1">{period}</p>}
      </div>
    </button>
  );
}
