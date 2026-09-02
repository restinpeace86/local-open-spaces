# Spec: 소셜 로그인 및 유저 프로필
- **인증 Provider:** Supabase Auth (KaKao, Google)
- **데이터베이스 연동:** 
  - 로그인 시 `auth.users`와 연동된 `public.profiles` 테이블 생성
  - `birth_years` (자녀 출생년도 배열) 필드 포함
- **보안(RLS):** 인증된 사용자 본인의 프로필, 북마크, 히스토리만 CRUD 가능하도록 RLS 정책 적용
