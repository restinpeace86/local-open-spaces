# 이메일 회원가입 확인 절차 생략 (mailer_autoconfirm)

## 배경
직전 작업(파트너 이메일/비밀번호 로그인·회원가입, 개선사항 5)에서 실제
회원가입을 테스트하다 "email rate limit exceeded"를 재현했다 — 이 Supabase
프로젝트는 커스텀 SMTP가 없어(smtp_host=null) 기본 메일 발송 한도(실측
시간당 2건)로 회원가입 확인 이메일이 쉽게 막힐 수 있다는 걸 사용자에게
알렸다.

사용자 질문: "이메일로 회원가입하는데.. 가입 확인 이메일을 자동으로 안보내면
안돼?" → 두 가지 선택지(확인 없이 즉시 가입 vs 커스텀 SMTP 연결)를
제시했고, **"확인 없이 즉시 가입(지금 규모에는 충분)"**으로 결정.

## 변경 사항
Supabase Management API로 프로젝트의 Auth 설정
`mailer_autoconfirm: false → true`로 변경(코드가 아니라 Supabase 프로젝트
설정 — `node`로 `PATCH https://api.supabase.com/v1/projects/{ref}/config/auth`
직접 호출, 적용 후 재조회로 `true` 확인).

`src/components/partner/email-auth-form.tsx`는 **코드 수정이 필요 없었다**
— `signUp()` 결과의 `data.session` 유무로 분기하도록 이미 방어적으로
짜여 있어서(세션이 있으면 즉시 이동, 없으면 이메일 확인 안내), 이 설정
변경만으로 자동으로 "가입 즉시 로그인" 경로를 타게 된다. 이후 설정이 다시
바뀌어도(예: 커스텀 SMTP 연결 후 확인 절차를 다시 요구하는 방향으로)
코드 수정 없이 그대로 동작한다. 주석만 새 결정 내용에 맞게 갱신했다.

## 트레이드오프 (사용자에게 고지 후 결정됨)
본인이 소유하지 않은 이메일 주소로도 가입이 가능해진다(이메일 소유 확인
절차가 없음) — 지금 규모(초기 파트너 온보딩)에서는 실제 악용 피해가 크지
않을 것으로 판단해 감수하기로 함.

## 검증
- `npx tsc --noEmit` / `npm run test`(198개 파일 2280개) / `npm run build`
  모두 통과.
- Management API로 `mailer_autoconfirm: true` 반영 확인.
- **실제 브라우저 + 실제 Supabase Auth 재검증**: 회원가입 폼으로 실제
  가입 시도 → 이메일 확인 절차 없이 즉시 `/partner/onboarding`으로 이동,
  생성된 계정의 `email_confirmed_at`이 가입 시각으로 자동 채워짐을 확인.
  테스트 계정은 삭제.
