# Notification Settings & Storage Specification

## 1. Overview
주말 나들이 및 아이와 함께하는 이벤트를 위한 광역 범위 맞춤 알림 조건 설정 UI 및 LocalStorage 알림함 스펙.

## 2. Feature Flag
- Status: ENABLED (`spec/common/feature-flags.md` 연동)

## 3. LocalStorage Schema

### 3.1 `user_notification_settings`
- `enabled` (boolean): 알림 활성화 여부
- `radius` (string): '10km' | '20km' | '30km' | 'all'
- `target_ages` (string[]): 선택된 연령대 태그 (예: ['infant', 'child'])
- `d_minus_one_alert` (boolean): 예약 마감 D-1 임박 알림 수신 여부

### 3.2 `user_notifications` (Array of Notification Items)
- `id` (string): 알림 고유 ID
- `title` (string): 알림 제목
- `message` (string): 알림 본문 내용
- `created_at` (string): ISO 날짜 문자열
- `is_read` (boolean): 읽음 여부
- `link` (string): 관련 장소/행사 상세페이지 URL

## 4. UI/UX Requirements
- Header 내 🔔 알림 아이콘 노출
- 클릭 시 알림함 모달/팝오버 노출 및 설정(⚙️) 아이콘을 통해 조건 변경 가능
- 설정 변경 즉시 `user_notification_settings`에 저장
