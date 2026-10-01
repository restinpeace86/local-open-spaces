"""저장된 홈플러스 문화센터 로그인 세션(state.json)이 아직 유효한지 확인하는
스크립트.

평소 쓰는 브라우저로 로그인하기 전/후에 각각 실행해서 결과를 비교하면,
홈플러스가 "동시 로그인 1개만 허용"(단일 세션 강제) 정책을 쓰는지 실측으로
확인할 수 있다 — 로그인 전용 페이지(나의 강의실)에 state.json만으로
접근해서 로그인 상태가 유지되는지를 본다.

실행:
    python homeplus-check-session.py
"""

import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

# [2026-10-02 실측] 윈도우 콘솔 기본 인코딩(cp949)에서는 이모지(✅/❌) print가
# UnicodeEncodeError로 죽는다 — stdout/stderr을 UTF-8로 강제한다.
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8")

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
STATE_FILE = PROJECT_ROOT / "state.json"

# [2026-10-01] 로그아웃 상태면 이 경로가 /Login?gurl=...로 리다이렉트되거나
# "로그인해주세요" 문구가 뜬다(mschool.homeplus.co.kr 페이지 구조 실측 확인).
MY_PAGE_URL = "https://mschool.homeplus.co.kr/MyCultureCenter/MyOwn"
LOGGED_OUT_TEXT = "로그인해주세요"


def main() -> None:
    if not STATE_FILE.exists():
        print(f"❌ {STATE_FILE} 파일이 없습니다 — 먼저 homeplus-save-login-session.py를 실행해 세션을 저장해주세요.")
        return

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=False)
        context = browser.new_context(storage_state=str(STATE_FILE))
        page = context.new_page()

        try:
            page.goto(MY_PAGE_URL)
            page.wait_for_load_state("networkidle")

            final_url = page.url
            page_text = page.content()

            redirected_to_login = "login" in final_url.lower()
            shows_logged_out_text = LOGGED_OUT_TEXT in page_text

            if redirected_to_login or shows_logged_out_text:
                print("❌ 로그인 세션이 더 이상 유효하지 않습니다(로그인 페이지로 리다이렉트됨 또는 로그인 안내 문구 발견).")
                print(f"   최종 URL: {final_url}")
            else:
                print("✅ 로그인 세션이 아직 유효합니다 — '나의 강의실' 페이지에 로그인 상태로 접근했습니다.")
                print(f"   최종 URL: {final_url}")

            print("\n확인 후 Enter를 누르면 브라우저가 닫힙니다.")
            input()
        finally:
            browser.close()


if __name__ == "__main__":
    main()
