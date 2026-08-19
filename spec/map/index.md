# Map Specification (`spec/map/`)

본 디렉토리는 `local-open-spaces` 서비스의 핵심 인터페이스인 **Kakao Map SDK 연동, 마커 클러스터링/렌더링, 그리고 PostGIS 공간 연산 기반의 위치 탐색 스펙**을 관리한다.

모든 지도 인터랙션은 사용자의 동네 생활권 탐색 경험(당근마켓 벤치마킹)을 극대화하는 방향으로 설계되었다.

---

## 하위 스펙 문서 목록

- **`kakao-map.md`**: Kakao Maps SDK 초기화, 반응형 뷰포트 리사이징 대응, 마커 및 인포윈도우 렌더링 규칙
- **`spatial-search.md`**: 반경 선택 필터(`1km`, `5km`, `10km`) 정책, 지도 줌 방어 가이드, PostGIS RPC (`ST_DWithin`) 연동 스펙
