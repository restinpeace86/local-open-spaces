# Data & Ingestion Specification (`spec/data/`)

본 디렉토리는 `local-open-spaces` 서비스에서 활용하는 공공 데이터의 출처, 수집 주기, AI 정제 규칙, 그리고 데이터 간 관계 정의 등 데이터 파이프라인 전반의 명세를 관리한다.

모든 데이터 수집 및 처리 과정은 **Zero-Cost 인프라 원칙(Decision 001)**과 **PostGIS 공간 연산 최적화(Decision 002)**를 기반으로 동작한다.

---

## 하위 스펙 문서 목록

- **`data_sources.md`**: 7대 공공 API 출처 및 데이터 유형별 수집 사양 (공간형 데이터 3종 월 1회 동기화 / 행사·이벤트형 데이터 4종 매일 1회 동기화, 예약 마감일 포함)
- **`ai-rule.md`**: 공공 API의 비정형 텍스트를 정제하고 카테고리를 자동 태깅하는 AI 파이프라인 규칙 (Decision 005)
- **`data-relation.md`**: 열린 공간(`open_spaces`)과 시한성 이벤트(`events`) 간의 데이터 모델 관계 및 PostGIS 공간 연동 구조 정의
