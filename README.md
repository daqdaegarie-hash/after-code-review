# AFTER — AI 기반 교사 업무 도우미

> **A**ssistant **F**or **T**eachers' **E**ducational **R**equirements  
> 경상남도 중·고등학교 교감 선생님의 행정 업무를 Gemini AI가 지원하는 웹 시스템

**버전**: v3.9.1 | **최종 업데이트**: 2026-04-24

---

## 🌐 주요 페이지 경로

| 경로 | 설명 |
|---|---|
| `/index.html` | 메인 앱 (AI 질문, 자료실, 히스토리, 게시판) |
| `/manual_user.html` | 사용자 매뉴얼 (PDF 저장 버튼 포함) |
| `/manual_admin.html` | 관리자 매뉴얼 (PDF 저장 버튼 포함) |
| `/restore.html` | 데이터 복원 페이지 (관리자 전용) |
| `/diag.html` | 시스템 진단 페이지 |

> ⚠️ `bulk_replace.html`, `upload.html`은 v3.8에서 삭제됨. 서식 업로드는 관리자 패널 또는 자료실 내 업로드 버튼 사용.

---

## ✅ 완료된 기능

### 핵심 기능
- **AI 질문/답변**: 부서 선택 → 자연어 질문 → Gemini 답변 (마크다운, 관련 서식 버튼 포함)
- **대화 이어가기**: 이전 대화 문맥 유지, 파일 첨부 분석
- **서식 자료실**: 8개 부서별 lazy loading (처음엔 건수만, 클릭 시 로드), 검색, 다운로드 (청크 병합)
- **질문 히스토리**: DB 저장 (최근 100건), 부서·키워드 필터, "다시 질문" 기능
  - 본인 기록: 전체 표시 / 타인 기록: 제목+부서만 표시

### 회원 관리
- **2단계 가입 프로세스**: `signup_requests` → 관리자 승인 → `users` 이동
  - 401 오류 해결: 비로그인 사용자의 `users` 직접 쓰기 방지
- **회원 승인**: 관리자 패널 → 회원 관리 탭 상단에 대기 신청 목록 우선 표시
- **VIP·포인트**: 초기 1,000P 자동 지급, 서식 다운로드 -10P, AI 질문 -5P, VIP 무료
- **접속 회원**: 1분마다 자동 갱신, 새로고침 후에도 상태 유지

### 게시판
- **검색**: 제목·내용·관리자 답변 통합 검색 + 하이라이트
- **비밀글**: 작성자·관리자만 본문 열람, 목록엔 제목만 표시
- **관리자 답변**: 파란색 박스로 강조, 답변완료 배지 표시, 수정·삭제 지원
- **카테고리**: 일반, 제안, 문의, 자료요청, 파일오류신고

### 관리자 기능
- 회원 승인·거부·강제탈퇴·VIP 설정
- Gemini API 키 설정 및 연결 테스트
- 서식 단건/다중 업로드, 수정, 삭제
- 공지사항 작성·수정·삭제
- 전체 백업 (JSON + 클라우드 저장), 최근 30건 이력 조회
- 복원 (비우고 복구 / 추가 복구)
- **관리자 패널 닫기 시 홈 화면 자동 이동**

### 서식 업로드 (사용자)
- **중복 파일 감지**: 업로드 전 제목 유사도(85% 이상) 또는 (70% 이상 + 파일 크기 동일) 조건으로 자동 감지
  - 중복 감지 시 경고 다이얼로그 표시 → 취소 또는 강제 업로드 선택 가능
- **실시간 클라우드 저장**: `user_forms` 테이블에 Base64 파일 데이터 포함 저장 (`has_file: true`)
- 업로드 완료 즉시 DB 캐시 무효화 → AI 질문 및 자료실에 즉시 반영
- AI 질문 시 업로드 파일 자동 분석 · 관련 파일 다운로드 버튼 답변에 삽입

### 매뉴얼
- **관리자 매뉴얼** (`/manual_admin.html`): v3.2 — signup_requests 프로세스, 게시판 검색/비밀글/답변 정책 반영
- **사용자 매뉴얼** (`/manual_user.html`): v3.2 — lazy loading 방식, 비밀글 정책, 히스토리 타인 기록 정책 반영
- 두 매뉴얼 모두 🖨️ PDF 저장 버튼 포함

---

## 📦 데이터 모델 (주요 테이블)

| 테이블 | 주요 필드 | 비고 |
|---|---|---|
| `users` | id, user_id, password_hash, full_name, email, school, approved, role, points, vip, expires_at | |
| `signup_requests` | id, user_id, password_hash, full_name, email, school, status(pending/approved/rejected), requested_at | 2단계 가입 |
| `base_forms` | id, dept, title, desc, file_type, file_data (Base64), has_file, sort_order | **v3.9.1 클린 초기화** |
| `chat_history` | id, user_id, dept, question, answer, summary, session_id | |
| `board_posts` | id, author_id, title, content, category, is_secret, admin_reply, admin_reply_at, views | |
| `notices` | id, title, content, active | |
| `user_forms` | id, uploader_id, dept, name, file_data (Base64), file_type, file_size, has_file, approved, base_form_ref | **v3.9.1 클린 초기화** |
| `form_knowledge` | id, form_id, dept, title, summary, keywords, use_cases, extracted_at | **v3.9.1 클린 초기화** |
| `ai_feedback` | id, user_id, hist_id, vote | |
| `app_config` | id, config_key, config_value | |
| `cloud_backups` | id, backup_at, device, data_size, backup_json | |

> ✅ **v3.9.1 서식 자료실 클린 초기화 완료**  
> `base_forms`, `user_forms`, `form_knowledge` 테이블이 모두 비워진 상태로 배포됩니다.  
> 배포 후 관리자 패널 → 서식 DB 탭에서 수동으로 파일을 업로드하세요.

---

## 🔧 알려진 경고 (무시 가능)

| 경고 | 설명 |
|---|---|
| EmailJS Public Key 미설정 | 관리자 알림 이메일 비활성 — 기능에는 영향 없음 |
| Password field not in form | 브라우저 경고 — 무시 가능 |
| 로컬 미리보기 422 오류 | 배포 환경에서는 정상 |

---

## 🚀 배포 방법

### ✅ 정상 배포 (코드만 업데이트, 데이터 유지)
1. GenSpark **Publish 탭** 클릭
2. `Rebuild DB` **체크 안 함** (기존 데이터 유지)
3. **Publish** 클릭 → 완료 후 URL 확인

### ⚠️ 배포 실패 시 ("Database exists but could not retrieve ID" 에러)
> 자세한 해결 방법은 `DEPLOY_FIX.md` 참조

```
1. Publish 탭 → "리소스 관리" → 모든 항목 삭제
2. 페이지 새로고침 (F5)
3. ☑ Rebuild DB + ☑ Rebuild Worker 체크 후 Publish
4. 배포 완료 후 /restore.html 에서 백업 데이터 복원
```

### 배포 후 초기 설정 체크리스트
- [ ] 관리자 로그인 (`daqdaegarie` / `admin`)
- [ ] 관리자 패널 → AI 설정 → Gemini API 키 입력 및 연결 테스트
- [ ] `/restore.html` → 백업 JSON 업로드 → 비우고 복구 (시스템 데이터만, 서식은 수동 업로드)
- [ ] 관리자 패널 → 서식 DB 탭 → 부서 선택 → 파일 업로드 (중복 자동 제외됨)
- [ ] 자료실·AI 질문 정상 동작 확인
- [ ] 회원가입 테스트 (다른 브라우저/기기)
- [ ] 전체 백업 실행

---

## 🚀 v3.9.1 변경사항 (2026-04-24) — 클린 배포 준비

| 항목 | 내용 |
|---|---|
| **서식 자료실 전체 초기화** | `base_forms`, `user_forms`, `form_knowledge` 3개 테이블 데이터 완전 삭제 (스키마 유지) |
| **빈 자료실 화면 개선** | 데이터 0건일 때 안내 메시지 + 로그인 유도 버튼 통합 표시 |
| **DB 유지보수 플래그 v2로 갱신** | `after_maint_v2_*` 키 사용 → 배포 후 첫 접속 시 새 기준으로 유지보수 재실행 |
| **중복 `totalCount===0` 블록 제거** | `renderFormsPage` 내 동일 조건 블록 중복 제거 |

## 🚀 v3.9 변경사항 (2026-04-24) — 파일 수 변동 근본 버그 수정

| 항목 | 내용 |
|---|---|
| **핵심 버그 수정** | `runDbMaintenance`가 목록 API의 `file_data` 누락을 파일 없음으로 오판 → 정상 파일 삭제하던 문제 수정 |
| **다운로드 불가 판단 기준 변경** | `file_data.length > 50` → `file_name 존재 여부`로 변경 (목록 API는 file_data를 잘라서 반환함) |
| **중복 판단 기준 강화** | `file_name`과 `file_size` 모두 있을 때만 중복 비교 (둘 중 하나 없으면 스킵 → 구버전 데이터 오삭제 방지) |
| **UI 필터 기준 통일** | 자료실 렌더링 시 `has_file` 플래그 대신 `file_name` 존재 여부로 표시 여부 결정 |
| **ZIP 다운로드 카운트 기준 통일** | user_forms ZIP 카운트도 `file_name` 기준으로 통일 |

## 🚀 v3.8 변경사항 (2026-04-24)

| 항목 | 내용 |
|---|---|
| **bulk_replace.html 삭제** | 혼란을 야기하던 대량 매칭 업로드 페이지 완전 제거 |
| **upload.html 삭제** | 별도 업로드 페이지 제거 (관리자 패널 + 자료실 내 업로드로 통합) |
| **DB 자동 유지보수 (`runDbMaintenance`)** | 앱 시작 3초 후 자동 실행: ① 부서명 전체 정규화 ② 다운로드 불가 항목 삭제 ③ 파일명+크기 동일한 중복 파일 1개만 남기고 삭제 |
| **관리자 다중업로드 중복 감지** | 업로드 전 기존 DB와 파일명·제목 비교 → 중복 건 자동 제외 + "~~외 ~~건 중복 제외" 메시지 표시 |
| **다운로드 불가 항목 UI 숨김** | 실제 파일·URL 없는 항목은 일반 사용자에게 표시 안 함 (관리자는 계속 표시) |
| **Gemini 지식 추출 (`extractAndSaveFormKnowledge`)** | 업로드 직후 비동기로 Gemini API 호출 → 파일 요약·키워드·활용사례 추출 → `form_knowledge` 테이블 저장 |
| **AI 답변에 사전 지식 반영** | `buildSystemPrompt`에서 `form_knowledge` 테이블 조회 → AI 답변 품질·속도 개선 |
| **단건 업로드 `has_file` 플래그** | 단건 업로드 payload에 `has_file` 추가 (유지보수 시 정확한 삭제 판단) |
| **form_knowledge 테이블 추가** | `form_id`, `dept`, `title`, `summary`, `keywords`, `use_cases`, `extracted_at` 필드 |

## 🚀 v3.7 변경사항 (2026-04-24)

| 항목 | 내용 |
|---|---|
| **bulk_replace.html `_normDept` 버그 수정** | ALIAS 맵이 반대 방향(새→구)으로 잘못 작성되어 있던 것을 정방향(구→표준)으로 수정 |
| **bulk_replace.html DEPTS 배열 표준화** | `과정&평가부`→`과정평가부`, `체육&안전부`→`체육안전부`로 통일 |
| **upload.html 부서 select 표준화** | 관리자 전용 대량업로드 페이지의 부서 드롭다운 값 표준명으로 수정 |
| **user_forms 필터 정규화** | `renderFormsPage`의 user_forms 부서 필터에 `_normalizeDeptName` 적용 |
| **renderDeptSection 정규화** | 자료실 렌더링 시 base/user 모두 정규화된 dept로 비교하여 부서 미표시 문제 해결 |
| **groupBaseForms 정규화** | 그룹핑 key에 정규화된 dept 사용 → 부서명 오타/공백 차이로 인한 중복 그룹 방지 |
| **ZIP 다운로드 정규화** | `downloadDeptAsZip`에서도 `_normalizeDeptName`으로 필터링 |
| **user_forms DB 자동 패치** | 배포 후 user_forms 구버전 부서명 자동 PATCH (base_forms와 동일하게) |
| **DB 패치 플래그 v5** | `after_dept_fix_v5_<hostname>`으로 키 변경 → 이전 v4 패치가 잘못된 경우에도 재실행 |
| **deptFixes 맵 확장** | 공백 포함 부서명, 추가 별칭 전부 커버하도록 보강 |
| **카운트에 user_forms 합산** | 부서 카드 건수에 승인된 user_forms도 포함하여 더 정확한 수치 표시 |

## 🚀 v3.6 변경사항 (2026-04-24)

| 항목 | 내용 |
|---|---|
| **부서명 완전 표준화** | `과정&평가부`→`과정평가부`, `체육&안전부`→`체육안전부` - UI, DB, 코드 전체 통일 |
| **upload.html 수정** | 부서 select option 값 표준 부서명으로 통일 |
| **bulk_replace.html 수정** | `_normDept()` ALIAS 맵 방향 교정 (구→표준 방향으로 수정), DEPTS 배열 표준명으로 변경 |
| **user_forms 정규화 필터** | `renderFormsPage`에서 user_forms dept 비교 시 `_normalizeDeptName` 적용 |
| **user_forms 자동 패치** | 배포 후 user_forms의 구버전 부서명을 표준명으로 DB 자동 보정 (환경당 1회) |
| **캐시 키 환경 분리** | localStorage 캐시 키에 hostname 포함 → 미리보기/배포 캐시 충돌 방지 |
| **캐시 TTL 단축** | localStorage 캐시 TTL 30분 → 5분 (배포 후 빠른 갱신 보장) |

## 🚀 v3.5 변경사항 (2026-04-22)

| 항목 | 내용 |
|---|---|
| **자료실 로딩 버그 수정** | `hasCachedBase` 미선언 변수 참조 오류 수정 → 자료 목록 미표시 문제 해결 |
| **부서 개요 카드 그리드** | 자료실 진입 시 8개 부서 카드에 실제 자료 건수 표시 (클릭 → 해당 부서 로드) |
| **정확한 카운트 집계** | `search=부서명` 방식 제거 → 전체 데이터 메모리 로드 후 집계 (정확도 100%) |
| **로딩 막대바 정상화** | 부서 클릭 시 진행률 바 정상 작동 (캐시 미스 시만 표시, 캐시 히트 시 즉시) |
| **clickDeptFilter 함수** | 부서 카드 클릭 시 상단 필터 버튼 active 연동 및 검색어 초기화 |
| **캐시 2중화** | 전체 데이터 메모리 로드 후 localStorage 캐시 저장 → 다음 방문 시 즉시 표시 |
| **매뉴얼 중복 id 버그 수정** | `manual-tab-admin` id 중복 → `manual-tab-admin-btn`으로 통일 |

## 🚀 v3.4 변경사항 (2026-04-21)

| 항목 | 내용 |
|---|---|
| 자료실 완전 초기화 | `base_forms` · `user_forms` 전체 삭제 (메타데이터 포함 클라우드 완전 리셋) |
| 시드 자동 주입 비활성화 | `seedBaseFormsIfEmpty()` 호출 제거 → DB 빈 상태 영구 유지, 팀이 직접 업로드 |
| 캐시 강제 초기화 | 앱 시작 시 localStorage + 메모리 캐시 전체 초기화 → 구 데이터 잔존 방지 |
| 빈 자료실 UI | 자료 0건일 때도 8개 부서 카드 항상 표시 + 부서 선택 시 업로드 버튼 표시 |
| 중복 파일 감지 | 업로드 전 제목 유사도 85% / (70%+크기일치) 조건 자동 감지 + 경고 UI |
| `has_file` 플래그 | 업로드 시 `has_file: true` 저장 → 백업·검색·AI 포함 여부 명확화 |
| 캐시 즉시 무효화 | 업로드 완료 후 `user_forms` 캐시 초기화 → AI·자료실 즉시 반영 |
| 관리자 패널 닫기 | 패널 닫기/로그아웃 시 홈 화면으로 자동 이동 |

---

## 📋 미완료/개선 예정

- 관리자 비밀번호 변경 UI (현재는 코드 수정 필요)
- 다중 관리자 지원
- 포인트 사용 내역 로그
- 자동 백업 스케줄러
- HWP 파일 내용 텍스트 추출 (현재 PDF·TXT만 내용 파싱)

---

*AFTER v3.5 | 2026-04-22*
