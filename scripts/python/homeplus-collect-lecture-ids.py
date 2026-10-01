"""홈플러스 문화센터 강좌 검색(지점: 서울/인천,부천/수원,화성/경기/대전,세종
각 전체, 대상: Kids/Baby 각 전체) 후 LectureMasterID 목록을 수집하는
2단계 스크립트.

저장된 로그인 세션(state.json)을 재사용해 /Lecture/Search 페이지에서 실제
UI를 클릭해 필터 칩들을 쌓은 뒤 "강좌검색"으로 /Lecture/SearchResult로
이동하고, 결과 페이지를 스크롤/"더보기"로 반복 로드한다. 결과가 더 없거나
새로 로드된 묶음이 전부 마감 상태면 거기서 멈추고, 그때까지 로드된
LectureMasterID를 중복 없이 추출해 lecture_ids.json으로 저장한다.

[실측 확인](2026-10-02, 로그인 불필요한 /Lecture/Search 페이지와
/Scripts/Views/Lecture.Search.js를 직접 받아 확인):
- "지점" 탭은 기본으로 열려 있다(`.tree_menu_1.on`). 각 지역 버튼
  (`.btn_tree_dpt2`, 예: "서울")을 클릭하면 하위 목록이 펼쳐지고, 그 안의
  "{지역명} 전체" 버튼(`.btn_filter_add`)은 페이지 로드 시 JS가 동적으로
  추가한다(서버 렌더링 HTML엔 비어있음) — 그래서 클릭 전에 페이지가 완전히
  로드될 시간을 준다. 여러 지역을 순서대로 클릭하면 선택이 전부 누적된다
  (화면 하단 필터 칩 영역에 계속 쌓이는 구조).
- "대상·강좌군"은 별도 탭(`.btn_depth_1`)을 먼저 눌러야 그 안의 "Kids"/
  "Baby" 버튼이 보인다. "Kids 전체"/"Baby 전체"는 각각
  `data-lecture-target="MH|EL|IF"` / `data-lecture-target="BB"` 속성을
  가진 버튼으로 서버 렌더링 HTML에 이미 고정되어 있다.
- "강좌검색" 버튼(`.btn_reuslt_search`)은 `sendSearchModel()`을 호출해
  지금까지 선택된 필터 칩들을 모아 `/Lecture/SearchResult`로 POST
  리다이렉트한다(실제 페이지 이동 — Playwright가 클릭 후 페이지 로드를
  기다리면 되고, POST 바디를 직접 조립할 필요 없음).
- `/Lecture/SearchResult` 페이지에선 Lecture.Search.js가 도착 직후(setTimeout
  100ms) 자동으로 1페이지(20건)를 AJAX로 불러온다. 이후 "더보기" 버튼
  (`a[group='more_button']`)을 누를 때마다 `BtnMoreClick()`이 페이지 번호를
  올려 다음 20건을 `#lecture_textlist ul`에 계속 append한다 — 서버가 20건
  미만을 돌려주면(마지막 페이지) 이 버튼이 자동으로 숨겨진다. 6,604건이면
  약 330번 눌러야 한다.
- [2026-10-02 사용자 실측] 사용자는 실제 화면에서 "아래로 내리면 자동으로
  추가되는" 것처럼 보인다고 했다 — JS 코드상으로는 버튼 클릭(`BtnMoreClick`)
  방식만 확인했지만(스크롤 트리거 코드는 로그인 세션이 없어 직접 확인 못함),
  둘 중 뭐가 실제 트리거인지 단정하지 않고 **스크롤 + 버튼 클릭을 모두
  시도**하도록 방어적으로 짰다(둘 다 안전 — 스크롤만으로 이미 로드됐으면
  버튼은 안 보이거나 눌러도 아무 일 없음).

[마감(수강 불가) 판정 — 사용자 실측 확인] 각 강좌 카드의 장바구니 버튼이
마감 시 아래처럼 바뀐다:
    <button type="button" class="btn_class_cart" disabled="">...<span>마감</span></button>
"더보기"(또는 스크롤)로 새로 로드된 항목들을 확인해, **새로 추가된 항목
전부가 마감 상태면 더 이상 다음 페이지로 넘어가지 않고 멈춘다**(사용자 지시:
"해당 페이지의 리스트들이 전부 마감일 경우는 그 다음 페이지로 넘어갈
필요가없어" — 현재 정렬 기준이 최신 날짜가 위로 오는 역순이라, 한 페이지가
통째로 마감이면 그 뒤로도 마감만 이어진다는 전제).

[LectureMasterID 추출 방식에 대한 주의] 로그인 세션 없이는 실제 강좌 카드
마크업에서 LectureMasterID가 정확히 어디(href, data속성 등) 있는지까지는
확인할 수 없었다. 그래서 정확한 CSS 선택자 하나를 하드코딩하는 대신,
`#lecture_textlist` 영역 HTML에서 "LectureMasterID"(대소문자/하이픈 표기
무관)가 등장하는 모든 곳의 값을 정규식으로 긁어오는 범용 방식을 썼다 —
href의 쿼리스트링, data-* 속성, onclick 인라인 스크립트 어디에 있든 잡힌다.
실행 결과 0건이 나오면 터미널에 출력되는 영역 HTML 일부를 보고 패턴을
조정해야 한다.

실행 전: homeplus-save-login-session.py로 state.json을 먼저 만들어 둘 것.

실행:
    python homeplus-collect-lecture-ids.py
"""

import json
import random
import re
import sys
import time
from pathlib import Path

from playwright.sync_api import Page, sync_playwright

# [2026-10-02 실측] 윈도우 콘솔 기본 인코딩(cp949)에서는 이모지(✅/❌/⚠️) print가
# UnicodeEncodeError로 죽는다 — stdout/stderr을 UTF-8로 강제한다.
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8")

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
STATE_FILE = PROJECT_ROOT / "state.json"
OUTPUT_FILE = PROJECT_ROOT / "lecture_ids.json"

SEARCH_URL = "https://mschool.homeplus.co.kr/Lecture/Search"

# 지점(지역) — "{지역명} 전체" 버튼을 순서대로 선택한다.
REGIONS = ["서울", "인천, 부천", "수원, 화성", "경기", "대전, 세종"]
# 대상/강좌군 — "{대상명} 전체" 버튼을 순서대로 선택한다.
TARGETS = ["Kids", "Baby"]

# "더보기"를 눌러도 결과가 더 안 나오면 멈춘다. 이 값은 만약을 대비한
# 안전장치(무한 루프 방지)일 뿐, 정상적으로는 결과 건수에 따라 그 전에
# more_button이 사라져서 멈춘다(6,604건 기준 약 330회 예상).
MAX_MORE_CLICKS = 1000

LECTURE_MASTER_ID_PATTERN = re.compile(r"lecture[-_]?master[-_]?id[\"']?\s*[:=]\s*[\"']?(\w+)", re.IGNORECASE)


def random_delay() -> None:
    time.sleep(random.uniform(2, 3))


def select_regions(page: Page, regions: list[str]) -> None:
    for region in regions:
        print(f"  지점 선택: {region} 전체")
        page.click(f"ul.tree_menu_1 button.btn_tree_dpt2:has-text('{region}')")
        page.click(f"ul.tree_menu_1 button.btn_filter_add:has-text('{region} 전체')")
        random_delay()


def select_targets(page: Page, targets: list[str]) -> None:
    page.click("div.menu_depth_1_wrap button.btn_depth_1:has-text('대상·강좌군')")
    for target in targets:
        print(f"  대상/강좌군 선택: {target} 전체")
        page.click(f"ul.tree_menu_2 button.btn_tree_dpt2:has-text('{target}')")
        page.click(f"ul.tree_menu_2 button.btn_filter_add:has-text('{target} 전체')")
        random_delay()


def run_search(page: Page) -> None:
    page.click("button.btn_reuslt_search:has-text('강좌검색')")
    page.wait_for_load_state("networkidle")


def is_item_closed(item) -> bool:
    """카드 하나(<li>)의 장바구니 버튼이 마감 상태인지 확인한다. 버튼을
    못 찾는 비정상 케이스는 '마감 아님'으로 안전하게 처리해 조기 종료를
    막는다(섣불리 멈추는 것보다 한 페이지 더 도는 게 안전)."""
    cart_button = item.locator("button.btn_class_cart")
    if cart_button.count() == 0:
        return False
    return "마감" in cart_button.first.inner_text()


def all_new_items_closed(page: Page, start_index: int, end_index: int) -> bool:
    items = page.locator("#lecture_textlist ul li")
    return all(is_item_closed(items.nth(i)) for i in range(start_index, end_index))


def trigger_more_load(page: Page) -> None:
    """스크롤로 자동 로드되는지, '더보기' 버튼을 눌러야 하는지 실제로는
    확실치 않아(위 모듈 docstring 참고) 둘 다 시도한다."""
    page.mouse.wheel(0, 4000)
    page.wait_for_timeout(500)

    more_button = page.locator("a[group='more_button']")
    if more_button.count() > 0 and more_button.is_visible():
        more_button.click()


def load_all_results(page: Page) -> int:
    """스크롤/더보기로 결과가 더 없거나, 새로 로드된 페이지가 전부 마감일
    때까지 반복해서 전체 목록을 로드한다. 로드된 강좌 카드(<li>) 총 개수를
    반환한다."""
    items = page.locator("#lecture_textlist ul li")

    # 첫 페이지(20건)가 자동으로 로드될 때까지 대기.
    page.wait_for_selector("#lecture_textlist ul li", timeout=20000)

    rounds = 0
    while rounds < MAX_MORE_CLICKS:
        count_before = items.count()

        trigger_more_load(page)
        random_delay()

        count_after = items.count()
        rounds += 1

        if count_after == count_before:
            print(f"  {rounds}회차 — 더 이상 새 항목이 로드되지 않음(누적 {count_after}건). 종료.")
            break

        print(f"  {rounds}회차 — 누적 {count_after}건(신규 {count_after - count_before}건)")

        if all_new_items_closed(page, count_before, count_after):
            print("  신규 항목이 전부 마감 상태라 다음 페이지로 넘어가지 않고 종료합니다.")
            break

    return items.count()


def extract_lecture_master_ids(page: Page) -> list[str]:
    html = page.locator("#lecture_textlist").inner_html()
    ids = LECTURE_MASTER_ID_PATTERN.findall(html)
    # dict.fromkeys로 순서를 유지한 채 중복 제거.
    return list(dict.fromkeys(ids))


def main() -> None:
    if not STATE_FILE.exists():
        print(f"❌ {STATE_FILE} 파일이 없습니다 — 먼저 homeplus-save-login-session.py를 실행해 세션을 저장해주세요.")
        return

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=False)
        context = browser.new_context(storage_state=str(STATE_FILE))
        page = context.new_page()

        try:
            print(f"1단계: 강좌 검색 페이지로 이동 ({SEARCH_URL})")
            page.goto(SEARCH_URL)
            page.wait_for_load_state("networkidle")
            random_delay()

            select_regions(page, REGIONS)
            select_targets(page, TARGETS)

            print("2단계: 강좌검색 버튼 클릭 → 검색 결과 페이지로 이동")
            run_search(page)
            random_delay()

            print(f"현재 페이지: {page.url}")

            print("3단계: '더보기'를 반복 클릭해 전체 결과 로드")
            total_cards = load_all_results(page)
            print(f"  강좌 카드 총 {total_cards}건 로드 완료")

            lecture_ids = extract_lecture_master_ids(page)

            if not lecture_ids:
                print("⚠️ LectureMasterID를 하나도 찾지 못했습니다. 아래는 결과 영역 HTML 앞부분입니다(패턴 조정용):")
                print(page.locator("#lecture_textlist").inner_html()[:2000])
            else:
                OUTPUT_FILE.write_text(json.dumps(lecture_ids, ensure_ascii=False, indent=2), encoding="utf-8")
                print(f"✅ LectureMasterID {len(lecture_ids)}건 수집 완료 → {OUTPUT_FILE}")

            print("\n확인 후 Enter를 누르면 브라우저가 닫힙니다.")
            input()
        finally:
            browser.close()


if __name__ == "__main__":
    main()
