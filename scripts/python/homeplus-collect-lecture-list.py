"""홈플러스 문화센터 강좌 리스트를 2차례 검색(전국 지점을 10개 조건 제한
때문에 지역 2그룹으로 나눔)으로 수집해 Supabase `homeplus_lecture_list`
테이블에 저장하는 스크립트(LectureMasterID 추출 전단계 — 관리자 화면
(`/admin/data-grid`의 "🏫 홈플러스 강좌 리스트" 탭)에서 결과를 확인할 수
있게 한다).

[검색 조건](2026-10-02 사용자 지시)
- 1차: 대상/강좌군 Kids 전체·Baby 전체 + 지점 서울/인천,부천/수원,화성/경기/
  대전,세종/충청/광주,전라/강원 각 전체(지역 8개 + 대상 2개 = 10개 조건)
- 2차: 대상/강좌군 Kids 전체·Baby 전체 + 지점 대구/울산/경북/경남/부산 각 전체
  (지역 5개 + 대상 2개 = 7개 조건)
- 정렬: "개강임박순"(사용자 실측 확인상 최신 날짜가 가장 위로 오는 정렬) —
  로그인 세션 없이는 이 정렬 선택이 실제 결과 재로딩까지 트리거하는지
  확인할 방법이 없었다. 실행 로그에 선택된 라벨을 출력하니, 실제 화면에서
  정렬이 제대로 바뀌었는지 한 번 확인해 주는 게 안전하다.

[페이지네이션 종료 조건 — 사용자 지시 그대로]
"페이지네이션 다음페이지 검색에 대한 선제조건은 마감항목이 있느냐 없느냐야":
새로 로드된 묶음(스크롤/더보기 1회분)에 마감 항목이 **하나라도** 있으면
그 묶음까지는 저장하고 다음 묶음(페이지)으로는 넘어가지 않는다. 반대로
새 묶음에 마감 항목이 **전혀 없으면**(전부 신청가능) 다음 페이지에도
신청가능 항목이 더 있을 수 있으니 계속 진행한다. (현재 사이트 상황이 전
강좌가 마감이라면 1차/2차 각각 첫 묶음에서 바로 멈춰 최대 40건 수준일
것으로 사용자가 직접 예상한 바 있음.)

[마감 판정 — 사용자 실측 확인] 카드의 장바구니 버튼이 마감 시:
    <button type="button" class="btn_class_cart" disabled="">...<span>마감</span></button>

[구조화 추출] store_name은 실제 카드 마크업(`<span class="office_name">`,
2026-10-02 로그인 세션으로 직접 확인)에서 추출하고(마크업이 없는 예외
케이스만 "카드 텍스트 첫 줄" 휴리스틱으로 폴백), date_range_text는
YYYY.MM.DD ~ YYYY.MM.DD 정규식으로 뽑는다. 나머지는 raw_text(카드 전체
텍스트)로 항상 함께 보존해 관리자 화면에서 원본으로 대조할 수 있다.

[Supabase 저장] 이 프로젝트 최초의 Python→Supabase 직접 연동이다(기존
수집기는 전부 Node.js). NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY는
먼저 OS 환경변수(GitHub Actions secrets로 주입)에서 찾고, 없으면 로컬 개발용
.env.local로 폴백한다.

실행 전: homeplus-save-login-session.py로 state.json을 먼저 만들어 둘 것.

실행:
    python homeplus-collect-lecture-list.py

결과 확인: /admin/data-grid "🏫 홈플러스 강좌 리스트" 탭

[일일 배치 자동화](2026-10-02 사용자 지시: "매일 배치 돌려서 하루에 한번
확인은 못하는구조야?") GitHub Actions 워크플로
(.github/workflows/homeplus-lecture-list-batch.yml)에서 매일 headless로
실행된다. state.json은 API 키가 아니라 사용자의 실제 카카오 로그인 세션
쿠키라 영구적이지 않다 — 만료되면 이 스크립트가 검색을 시도하기도 전에
세션 유효성을 먼저 확인해 pipeline_logs에 FAILED(세션 만료) 상태를
남기고 조용히 종료한다. 관리자 화면(홈플러스 강좌 리스트 탭)이 이 상태를
읽어 "세션 만료 — 재로그인 필요" 배너를 보여주면, 사용자가 로컬에서
homeplus-save-login-session.py를 다시 실행해 새 state.json을 만들고 그
내용을 GitHub Actions secret(HOMEPLUS_STATE_JSON)에 업데이트해야 배치가
재개된다 — "평소엔 자동, 세션 만료 시에만 수동 갱신" 구조다.
"""

from __future__ import annotations

import os
import random
import re
import sys
import time
from pathlib import Path

import requests
from playwright.sync_api import Page, sync_playwright

# [2026-10-02 실측] 윈도우 콘솔 기본 인코딩(cp949)에서는 이모지(✅/❌ 등)
# print가 UnicodeEncodeError로 죽는다 — stdout/stderr을 UTF-8로 강제한다.
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8")

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
STATE_FILE = PROJECT_ROOT / "state.json"
ENV_FILE = PROJECT_ROOT / ".env.local"

# [2026-10-02 일일 배치 자동화] 이 프로젝트의 다른 GitHub Actions 워크플로
# (e2e.yml 등)와 동일하게 CI 환경에서는 env:CI=true가 설정된다 — 이 값으로
# headless 여부와 input() 대기 스킵 여부를 함께 결정한다.
IS_CI = os.environ.get("CI", "").lower() == "true"

SEARCH_URL = "https://mschool.homeplus.co.kr/Lecture/Search"
# [세션 유효성 선제 확인] homeplus-check-session.py와 동일한 판정 기준 —
# 로그아웃 상태면 이 경로가 로그인 페이지로 리다이렉트되거나 "로그인해주세요"
# 문구가 뜬다.
SESSION_CHECK_URL = "https://mschool.homeplus.co.kr/MyCultureCenter/MyOwn"
LOGGED_OUT_TEXT = "로그인해주세요"

SUPABASE_TABLE = "homeplus_lecture_list"
SUPABASE_INSERT_CHUNK_SIZE = 200

# [파이프라인 로그 DB화 연동](2026-10-02): 기존 Node.js 배치와 동일한
# pipeline_logs 테이블에 같은 스키마로 기록해 관리자 현황판에서 다른 소스와
# 동일하게 보이게 한다(scripts/ingest/lib/pipeline-agent-registry.mjs에
# 설명 등록 — Python이라 그 레지스트리를 직접 import하지 못해 설명 문구를
# 여기 그대로 복제해둔다. 바꿀 때 두 곳을 함께 바꿔야 한다).
PIPELINE_AGENT_NAME = "HOMEPLUS_LECTURE_LIST"
PIPELINE_AGENT_DESCRIPTION = (
    "홈플러스 문화센터 강좌 리스트 수집(Kids/Baby 전체, 전국 2그룹 검색) — "
    "로그인 세션 기반 Python/Playwright 배치"
)
SESSION_EXPIRED_MESSAGE = (
    "세션 만료 — 카카오 로그인 재인증 필요"
    "(로컬에서 homeplus-save-login-session.py 재실행 후 "
    "GitHub Actions secret HOMEPLUS_STATE_JSON 갱신 필요)"
)

TARGETS = ["Kids", "Baby"]
SEARCH_BATCHES = [
    {"batch": 1, "regions": ["서울", "인천, 부천", "수원, 화성", "경기", "대전, 세종", "충청", "광주, 전라", "강원"]},
    {"batch": 2, "regions": ["대구", "울산", "경북", "경남", "부산"]},
]

# 묶음(스크롤/더보기 1회분)에 마감이 하나도 없으면 계속 진행하는데, 혹시
# 모를 무한 루프를 막는 안전장치(정상적으로는 마감 항목을 만나면 그 전에
# 멈춘다).
MAX_ROUNDS_PER_BATCH = 1000

DATE_RANGE_PATTERN = re.compile(r"\d{4}\.\d{2}\.\d{2}\s*~\s*\d{4}\.\d{2}\.\d{2}")


REQUIRED_ENV_KEYS = ("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY")


def load_env() -> dict:
    """[2026-10-02 일일 배치 자동화] GitHub Actions에서는 secrets가 OS
    환경변수로 주입되므로 그걸 먼저 쓰고, 로컬 개발 환경(.env.local만 있고
    OS 환경변수는 없는 경우)에서만 파일을 읽어 폴백한다."""
    env = {key: os.environ[key] for key in REQUIRED_ENV_KEYS if os.environ.get(key)}
    if all(key in env for key in REQUIRED_ENV_KEYS):
        return env

    if ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            if "=" not in line or line.strip().startswith("#"):
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            if key not in env:
                env[key] = value.strip().strip('"').strip("'")
    return env


def check_session_valid(page: Page) -> bool:
    # [2026-10-02 GitHub Actions 실측 수정] CI(헤드리스) 환경에서
    # "Timeout 30000ms exceeded"로 재현됨 — Playwright 공식 문서도 "networkidle은
    # 광고/트래커/폴링이 있는 실제 사이트에서는 신뢰할 수 없다"고 명시한다.
    # page.goto()는 기본적으로 이미 'load' 이벤트까지 기다리므로 이 추가 대기는
    # 애초에 불필요했다 — 제거.
    page.goto(SESSION_CHECK_URL)
    final_url = page.url
    page_text = page.content()
    redirected_to_login = "login" in final_url.lower()
    shows_logged_out_text = LOGGED_OUT_TEXT in page_text
    return not (redirected_to_login or shows_logged_out_text)


def post_pipeline_log(env: dict, status: str, error_message: str | None = None, meta_data: dict | None = None) -> None:
    supabase_url = env.get("NEXT_PUBLIC_SUPABASE_URL")
    service_role_key = env.get("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_role_key:
        print("⚠️ pipeline_logs 기록 스킵(Supabase 환경변수 없음) — 배치 자체 결과에는 영향 없음.")
        return

    url = f"{supabase_url}/rest/v1/pipeline_logs"
    headers = {
        "apikey": service_role_key,
        "Authorization": f"Bearer {service_role_key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    payload = {
        "agent_name": PIPELINE_AGENT_NAME,
        "status": status,
        "error_message": error_message,
        "meta_data": meta_data,
        "description": PIPELINE_AGENT_DESCRIPTION,
        "period": "daily",
    }
    try:
        res = requests.post(url, headers=headers, json=payload, timeout=30)
        if res.status_code >= 300:
            print(f"⚠️ pipeline_logs 기록 실패(HTTP {res.status_code}): {res.text[:300]} — 배치 자체 결과에는 영향 없음.")
    except requests.RequestException as exc:
        print(f"⚠️ pipeline_logs 기록 중 예외(배치 자체 결과에는 영향 없음): {exc}")


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
    # [2026-10-02 GitHub Actions 실측 수정] "networkidle"은 CI 환경에서
    # 타임아웃으로 재현됐다(check_session_valid와 동일 원인) — 클릭이
    # 네비게이션을 유발하는 건 맞아서 대기 자체는 필요하지만, 'load'가 더
    # 안정적이다.
    page.click("button.btn_reuslt_search:has-text('강좌검색')")
    page.wait_for_load_state("load")


def apply_sort_order(page: Page) -> None:
    """정렬을 '개강임박순'(최신 날짜가 먼저 나오는 순서, 사용자 실측 확인)으로
    바꾼다. 선택 후 실제로 반영된 라벨을 출력하니, 처음 실행할 때는 터미널
    로그와 실제 화면을 같이 보고 정상적으로 재정렬됐는지 확인하는 걸 권한다.

    [2026-10-02 실측 수정] 셀렉터 id는 `sel_sort`가 아니라 `selSort`였다
    (언더스코어 없음) — 실제 결과 페이지 HTML을 직접 덤프해 확인했다.
    실측 화면상 이 드롭다운은 기본값이 이미 '개강임박순'이었지만, 명시적으로
    재선택해 의도를 코드에 남긴다."""
    page.wait_for_selector("#selSort", timeout=15000)
    page.select_option("#selSort", label="개강임박순")
    page.wait_for_timeout(500)
    selected_label = page.locator("#selSort option:checked").inner_text()
    print(f"  정렬 적용: '{selected_label}' 선택됨")
    random_delay()


def is_item_closed(item) -> bool:
    cart_button = item.locator("button.btn_class_cart")
    if cart_button.count() == 0:
        return False
    return "마감" in cart_button.first.inner_text()


def extract_store_name(item, item_text: str) -> str | None:
    """[2026-10-02 실측 수정] 실제 카드 마크업(`<span class="office_name">`)을
    확인해 정확한 선택자로 추출하도록 바꿨다(기존에는 로그인 세션 없이
    구조를 볼 수 없어 '카드 텍스트 첫 줄' 휴리스틱만 썼었다). 혹시 마크업이
    없는 카드가 있을 경우를 대비해 첫 줄 휴리스틱을 폴백으로 남겨둔다."""
    office_name = item.locator("span.office_name")
    if office_name.count() > 0:
        return office_name.first.inner_text().strip()
    lines = [line.strip() for line in item_text.splitlines() if line.strip()]
    return lines[0] if lines else None


def extract_date_range(item_text: str) -> str | None:
    match = DATE_RANGE_PATTERN.search(item_text)
    return match.group(0) if match else None


def trigger_more_load(page: Page) -> None:
    """스크롤 자동로딩/버튼 클릭 중 뭐가 실제 트리거인지 확실치 않아 둘 다
    시도한다(homeplus-collect-lecture-ids.py와 동일한 방어적 처리)."""
    page.mouse.wheel(0, 4000)
    page.wait_for_timeout(500)
    more_button = page.locator("a[group='more_button']")
    if more_button.count() > 0 and more_button.is_visible():
        more_button.click()


def collect_batch_rows(page: Page, batch_number: int) -> list[dict]:
    """현재 적용된 필터+정렬 기준으로 결과를 스크롤/더보기로 반복 로드한다.
    새로 로드된 묶음에 마감 항목이 하나라도 있으면 그 묶음까지 기록하고
    멈춘다. 전부 신청가능이면 다음 묶음으로 계속 진행한다."""
    # [2026-10-02 실측 수정] 컨테이너는 `#lecture_textlist`가 아니라
    # `div.search_result_list`였다 — 실제 검색 결과 페이지 HTML을 직접
    # 덤프해 확인했다. 카드는 `<li id="liLecture_{LectureMasterID}">`.
    items = page.locator("div.search_result_list ul li")
    page.wait_for_selector("div.search_result_list ul li", timeout=20000)

    collected: list[dict] = []
    prev_count = 0
    rounds = 0

    while rounds < MAX_ROUNDS_PER_BATCH:
        if rounds > 0:
            trigger_more_load(page)
            random_delay()

        count = items.count()
        if rounds > 0 and count == prev_count:
            print(f"  {rounds}회차 — 더 이상 새 항목이 로드되지 않음(누적 {count}건). 종료.")
            break

        any_closed = False
        for i in range(prev_count, count):
            item = items.nth(i)
            text = item.inner_text()
            closed = is_item_closed(item)
            any_closed = any_closed or closed
            collected.append(
                {
                    "search_batch": batch_number,
                    "store_name": extract_store_name(item, text),
                    "date_range_text": extract_date_range(text),
                    "is_closed": closed,
                    "raw_text": text,
                }
            )

        rounds += 1
        print(f"  {rounds}회차 — 누적 {count}건(신규 {count - prev_count}건, 신규 묶음에 마감 포함={any_closed})")
        prev_count = count

        if any_closed:
            print("  신규 묶음에 마감 항목이 있어 다음 페이지로 넘어가지 않고 종료합니다.")
            break

    return collected


def insert_rows(env: dict, rows: list[dict]) -> None:
    if not rows:
        print("저장할 행이 없습니다.")
        return

    supabase_url = env.get("NEXT_PUBLIC_SUPABASE_URL")
    service_role_key = env.get("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_role_key:
        raise RuntimeError("NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY를 환경변수나 .env.local에서 찾지 못했습니다.")

    url = f"{supabase_url}/rest/v1/{SUPABASE_TABLE}"
    headers = {
        "apikey": service_role_key,
        "Authorization": f"Bearer {service_role_key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }

    for i in range(0, len(rows), SUPABASE_INSERT_CHUNK_SIZE):
        chunk = rows[i : i + SUPABASE_INSERT_CHUNK_SIZE]
        res = requests.post(url, headers=headers, json=chunk, timeout=30)
        if res.status_code >= 300:
            raise RuntimeError(f"Supabase insert 실패(HTTP {res.status_code}): {res.text[:500]}")

    print(f"✅ Supabase({SUPABASE_TABLE})에 {len(rows)}건 저장 완료")


def main() -> None:
    if not STATE_FILE.exists():
        print(f"❌ {STATE_FILE} 파일이 없습니다 — 먼저 homeplus-save-login-session.py를 실행해 세션을 저장해주세요.")
        return

    env = load_env()

    all_rows: list[dict] = []

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=IS_CI)
        context = browser.new_context(storage_state=str(STATE_FILE))
        page = context.new_page()

        try:
            # [2026-10-02 일일 배치 자동화] 검색을 시도하기 전에 세션이 아직
            # 유효한지 먼저 확인한다 — 세션이 만료된 채로 검색 단계까지 들어가면
            # "강좌검색 버튼을 못 찾음" 같은 원인 불명의 에러로 보여 디버깅이
            # 어렵고, 관리자 화면에 보여줄 "재로그인 필요" 메시지도 애매해진다.
            if not check_session_valid(page):
                print(f"❌ {SESSION_EXPIRED_MESSAGE}")
                post_pipeline_log(env, "FAILED", error_message=SESSION_EXPIRED_MESSAGE, meta_data={"reason": "session_expired"})
                return

            for batch_config in SEARCH_BATCHES:
                batch_number = batch_config["batch"]
                regions = batch_config["regions"]
                print(f"\n=== {batch_number}차 검색 시작(지역 {len(regions)}개 + Kids/Baby 전체) ===")

                # [2026-10-02 GitHub Actions 실측 수정] check_session_valid와 동일한
                # 이유로 "networkidle" 추가 대기를 제거(page.goto()가 이미 'load'까지
                # 기다림).
                page.goto(SEARCH_URL)
                random_delay()

                select_regions(page, regions)
                select_targets(page, TARGETS)

                print("강좌검색 버튼 클릭 → 결과 페이지 이동")
                run_search(page)
                random_delay()

                apply_sort_order(page)

                batch_rows = collect_batch_rows(page, batch_number)
                print(f"{batch_number}차 검색 완료 — {len(batch_rows)}건 수집")
                all_rows.extend(batch_rows)

            insert_rows(env, all_rows)

            closed_count = sum(1 for r in all_rows if r["is_closed"])
            print(f"\n총 {len(all_rows)}건 수집(마감 {closed_count}건 / 신청가능 {len(all_rows) - closed_count}건)")
            print("/admin/data-grid '🏫 홈플러스 강좌 리스트' 탭에서 확인할 수 있습니다.")
            post_pipeline_log(env, "OK", meta_data={"collected": len(all_rows), "closed": closed_count})

            if not IS_CI:
                print("\n확인 후 Enter를 누르면 브라우저가 닫힙니다.")
                input()
        except Exception as exc:
            post_pipeline_log(env, "FAILED", error_message=str(exc)[:500])
            raise
        finally:
            browser.close()


if __name__ == "__main__":
    main()
