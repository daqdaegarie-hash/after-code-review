# AFTER – AI 코드 리뷰 요청

## 프로젝트 개요
**AFTER** (Assistant For Teachers' Educational Requirements)  
학교 교직원을 위한 행정 서식 자료실 + AI 질의응답 웹앱

## 기술 스택
| 구분 | 기술 |
|------|------|
| Frontend | 순수 HTML/CSS/JavaScript (프레임워크 없음) |
| Database | Genspark Tables API (RESTful, 서버리스) |
| 파일 스토리지 | GitHub REST API (base64 업로드) |
| AI | Google Gemini API |
| 인증 | 자체 구현 (bcrypt 없음, 해시 저장) |
| 배포 | Genspark 정적 호스팅 |

## 파일 구조
```
index.html          메인 UI (약 156KB)
js/
  app.js            메인 로직 – 자료실 렌더링, 캐시, 페이징 (약 320KB)
  auth.js           인증 + 관리자 패널 (약 197KB)
  github.js         GitHub 파일 스토리지 모듈 (약 11KB)
  knowledge.js      AI 지식베이스 추출/검색 (약 64KB)
  gemini.js         Gemini API 연동 (약 12KB)
  seed_data.js      초기 데이터 시드 (약 34KB)
css/
  style.css         전체 스타일
restore.html        백업/복원 전용 페이지
```

## 핵심 기능
1. **서식 자료실**: 부서별 서식 파일 업로드/다운로드 (GitHub 저장)
2. **AI 질의응답**: Gemini 기반 학교 행정 Q&A
3. **회원 관리**: 승인제 회원가입, 관리자 패널
4. **백업/복원**: JSON 전체 백업, 테이블별 복원

## AI 리뷰 요청 사항

### 🔴 우선순위 높음
1. **보안 취약점**
   - GitHub Personal Access Token이 DB(평문)와 localStorage에 저장됨
   - 관리자 비밀번호 해시 방식 (bcrypt 미사용)
   - XSS 가능성 (innerHTML 다수 사용)
   - CSRF 보호 없음

2. **성능 문제**
   - 2000개+ 데이터를 200개씩 순차 페이징 (13페이지 × API 호출)
   - 메모리 캐시 TTL 2분 → 업로드 후 반영 지연
   - localStorage 캐시 충돌 (미리보기/배포 환경)

3. **GitHub API 안정성**
   - Rate Limit (인증된 요청 5000/시간) 미처리
   - 대용량 파일(100MB+) 처리 미구현
   - 레포 용량 1GB 한계 대응 없음

### 🟡 우선순위 중간
4. **코드 구조**
   - app.js 단일 파일 320KB → 모듈 분리 필요
   - auth.js 197KB → 기능별 파일 분리 필요
   - 전역 변수 남용

5. **사용자 경험**
   - 초기 로드 14초 (2000개 데이터 전체 로드)
   - 에러 메시지 일관성 부족
   - 모바일 최적화 미흡

### 🟢 우선순위 낮음
6. 테스트 코드 없음
7. 타입 안정성 없음 (TypeScript 미사용)
8. 접근성(a11y) 개선 여지

## 개선 방향 제안 요청
- 위 문제들에 대한 구체적인 해결 방법
- 현재 아키텍처에서 가장 위험한 부분 우선순위 지정
- 서버리스 환경에서 보안을 강화할 수 있는 현실적인 방법
- 성능 개선을 위한 가상화/지연로딩 적용 방안
