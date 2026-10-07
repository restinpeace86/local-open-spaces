-- [이마트 접수시작 사전 알림](2026-10-08 사용자 지시): "신청시작전 혹은
-- 신청시작하자마자 뜨는게 중요한데" + "10분전 괜찮겠지" — register_start_at
-- 10분 전에 찜한 유저에게 푸시를 보내는 신규 배치가 5분 주기로 돌면서 같은
-- 강좌에 중복 발송하지 않도록 발송 여부를 표시해 둔다. register_start_at이
-- 없는 롯데마트/현대백화점 행에는 항상 null로 남는다(해당 없음).
alter table public.culture_club_classes
  add column if not exists register_reminder_sent_at timestamptz;
