"""홈플러스 문화센터(mschool.homeplus.co.kr) 최초 로그인 세션 저장 스크립트.

카카오 로그인을 수동으로 한 번 완료하면 쿠키/스토리지 상태를 state.json으로
저장해, 이후 크롤링 스크립트가 로그인 없이 이 파일을 재사용할 수 있게 한다.

실행 전 설치:
    pip install playwright
    playwright install chromium

실행:
    python homeplus-save-login-session.py
"""

import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

# [2026-10-02 실측] 윈도우 콘솔 기본 인코딩(cp949)에서는 이모지(✅) print가
# UnicodeEncodeError로 죽는다 — stdout/stderr을 UTF-8로 강제한다.
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8")

# [2026-10-01 실측] STATE_FILE을 상대경로("state.json")로 두니, 터미널의
# 현재 디렉터리가 어디냐에 따라 저장 위치가 달라져(BetterLiving에서
# 실행했더니 거기에 저장됨) 혼란이 있었다 — 스크립트 파일 위치 기준으로
# 프로젝트 루트(scripts/python/ 상위 두 단계)를 절대경로로 고정한다.
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

# [2026-10-01 실측] mschool.homeplus.co.kr에서 로그인 아이콘을 눌러도
# sso.homeplus.co.kr/login(소문자, 파라미터 없음)으로 가서 405 Whitelabel
# Error Page가 떴다 — 브라우저 주소창에 직접 쳐도 동일하게 재현됨(curl
# 확인 결과도 400이라 애초에 GET으로 바로 열 수 있는 경로가 아님). 실제
# 페이지 HTML을 확인해보니 로그인 링크는 대문자 "Login"에 `gurl`(로그인 후
# 돌아올 주소) 쿼리파라미터가 붙은 `/Login?gurl=...` 형태였다 — Spring
# 계열 앱에서 흔한 패턴으로, 소문자 `/login`은 폼 제출만 받는 내부 처리
# 경로(POST 전용)이고 실제 로그인 페이지는 대문자 `/Login`인 경우다. 이
# 정확한 경로+파라미터로 시작한다.
START_URL = "https://mschool.homeplus.co.kr/Login?gurl=https%3a%2f%2fmschool.homeplus.co.kr%2f"
STATE_FILE = PROJECT_ROOT / "state.json"


def main() -> None:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()

        try:
            page.goto(START_URL)

            print("브라우저 창에서 로그인 버튼을 눌러 카카오 로그인 등 수동 로그인을 완료한 뒤 터미널에서 Enter 키를 눌러주세요.")
            input()

            context.storage_state(path=str(STATE_FILE))
            print(f"✅ 로그인 세션 저장 완료: {STATE_FILE}")
        finally:
            browser.close()


if __name__ == "__main__":
    main()
