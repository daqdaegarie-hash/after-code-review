// ============================================================
// 나와라 만능 교감! - 지식 베이스 (AI 컨텍스트용)
// 실제 데이터 업로드 전까지 사용하는 핵심 지식 데이터
// 실제 파일 업로드 시 이 내용을 해당 부서별로 채워주세요
// ============================================================

const DEPT_INFO = {
    '교감업무': { icon: '🏫', color: 'bg-blue', desc: '학교 운영 · 교직원 관리 · 행정 총괄' },
    '교무부':   { icon: '📚', color: 'bg-green', desc: '수업 · 시간표 · 성적 · 학적 관리' },
    '과정&평가부': { icon: '📝', color: 'bg-purple', desc: '교육과정 운영 · 평가계획 수립' },
    '연구부':   { icon: '🔬', color: 'bg-orange', desc: '교원 연수 · 장학 활동 · 컨설팅' },
    '인성부':   { icon: '💛', color: 'bg-pink', desc: '생활지도 · 상담 · 학교폭력 예방' },
    '정보부':   { icon: '💻', color: 'bg-cyan', desc: '정보보안 · 개인정보보호 · 전산 관리' },
    '과학영재수학환경부': { icon: '🧪', color: 'bg-teal', desc: '과학교육 · 영재교육 · 수학교육 · 환경교육' },
    '체육&안전부': { icon: '⚽', color: 'bg-red', desc: '체육행사 · 스포츠클럽 · 안전교육' }
};

// ============================================================
// 부서별 지식 베이스 (AI가 참고할 상세 내용)
// 실제 데이터 파일이 업로드되면 해당 내용으로 교체
// ============================================================
const KNOWLEDGE_BASE = {

    '교감업무': `
※ 출처: 2026 경상남도 중등 교감업무도움자료 (2026.3.1. 기준, 간행물번호 2026-39)
※ 구성: 제1장 교원의 복무 / 제2장 휴직·복직·퇴직·면직 / 제3장 휴직·복직 관련 서식 / 제4장 호봉 / 제5장 정원·현원 / 제6장 계약제교원 / 제7장 기타

[제1장 교원의 복무]

▶ 연가
- 재직기간별 연가일수: 1개월 미만 없음 / 1개월 이상~1년 미만 11일 / 1년 이상~2년 미만 12일 / 2년 이상~3년 미만 14일 / 3년 이상~4년 미만 15일 / 4년 이상~5년 미만 17일 / 5년 이상~6년 미만 20일 / 6년 이상 21일
- 연가 사전 승인: 연가는 사전에 학교장(교감)의 승인 필요
- 연가 미사용 보상: 저축연가 가능 (연간 최대 10일 한도 이월, 이후 연가보상비 지급)
- 수업일 연가: 수업결손 방지 위한 보결 수업 계획 수립 필요
- 연가 분할 사용: 시간 단위 연가 가능 (1시간=연가 0.1일)
- 법정공휴일, 토·일요일은 연가일수 산정 제외
- 연가 승인 거부: 학교 운영상 특별한 필요 시 시기 변경 요구 가능 (교원의 지위 향상 및 교육활동 보호를 위한 특별법)

▶ 병가
- 질병·부상 시 연 60일 이내 유급 병가
- 60일 초과 시 연가 일수 우선 사용 후 무급 병가
- 연속 7일 이상 병가: 의사 진단서 제출 의무
- 공무상 병가: 공무로 인한 부상·질병은 별도 공무상 병가 적용 (180일 이내)
- 정신건강 병가: 정신건강 의료기관 진료 확인서로 신청 가능
- 병가 중 연가 전환: 병가 사유 소멸 시 잔여일 연가 전환 불가

▶ 출장
- 공무 출장: 출장 명령서 사전 발령 원칙
- 출장 여비: 국내 출장비 지급 기준에 따라 지급 (교통비·숙박비·식비)
- 원격지 출장: 귀임일 다음 날까지 출장으로 처리
- 시간외 출장: 퇴근 후 출장은 초과근무수당 별도 지급 여부 검토

▶ 조퇴·외출·지각
- 조퇴: 근무시간 중 퇴근, 연가에서 차감 (0.5일 미만 → 시간 단위 차감)
- 외출: 근무 중 일시적 이석, 누계 4시간 초과 시 연가 0.5일 차감
- 지각: 공가 사유가 없는 지각은 연가에서 차감

▶ 공가
- 공가 해당: 병역 검사·소집 / 증인·감정인·참고인 출석 / 선거권 행사 / 헌혈 (연 3일 이내) / 천재지변·재해 등
- 공가는 연가 일수에서 차감하지 않음
- 공가 증빙서류 제출 필수

▶ 특별휴가
- 결혼: 본인 5일, 자녀 1일
- 배우자 출산: 10일 (유급, 출산일부터 90일 이내 사용, 분할 사용 가능)
- 사망: 배우자·본인부모·자녀 5일 / 조부모·외조부모·배우자부모 3일 / 형제자매 1일
- 입양: 20일
- 임신검진: 임신 중 정기검진 (횟수 제한 없음, 1회 2시간 이내)
- 난임치료: 연 3일 (유급) – 인공수정 또는 체외수정 시술
- 포상휴가: 국가 또는 기관 표창 수상 시 1~3일

▶ 육아시간
- 생후 1년 미만 유아 있는 교원: 1일 1시간 육아시간 부여 (무급)
- 만 5세 이하 자녀 있는 교원: 육아시간 확대 적용 (경남 지침 따름)

▶ 모성보호시간
- 임신 중 여교원: 1일 2시간 모성보호시간 (유급)
- 임신 12주 이내 또는 36주 이후: 1일 2시간 보장

[제2장 휴직·복직·퇴직·면직]

▶ 휴직의 종류 및 요건
1. 질병휴직
   - 요건: 신체·정신상의 장애로 장기요양 필요
   - 기간: 1년 이내 (재임용 1년, 총 3년 초과 불가)
   - 봉급: 70% 지급 (1년 초과 시 50%)
   - 복직: 휴직 사유 소멸 즉시 신청
   - 서류: 의사 진단서(소견서) 제출

2. 육아휴직
   - 요건: 만 8세 이하 또는 초등학교 2학년 이하 자녀 양육
   - 기간: 자녀 1명당 최대 3년 (분할 사용 3회까지)
   - 봉급: 무급 (육아휴직급여는 고용보험에서 지급)
   - 육아휴직급여: 통상임금 80% (상한 150만원, 하한 70만원) → 2024년 이후 개선된 기준 적용
   - 아빠 육아휴직 보너스: 같은 자녀에 대해 두 번째 육아휴직자는 첫 3개월 통상임금 100% 지급
   - 경력 인정: 첫 1년은 경력 전체 인정, 이후는 50% 인정
   - 복직 후 동일 학교 복귀 원칙 (인사 이동 제한)

3. 간호휴직
   - 요건: 부모·배우자·자녀·배우자 부모의 질병·사고·노령으로 간호 필요
   - 기간: 1년 이내 (재직 중 총 3년 이내)
   - 봉급: 무급

4. 자율연수휴직
   - 요건: 학위취득·연구·저술·봉사 등 자기계발 목적
   - 기간: 1년 이내 (재직 중 1회에 한함)
   - 봉급: 무급
   - 복직 시: 자율연수보고서 제출 (A4 3쪽 이내, 글자크기 13, 줄간 160)
   - 보고서 포함내용: 연수과정, 연수소감, 개선점, 실행방안, 자체평가표

5. 가족돌봄휴직 (국가공무원법 제71조 제2항 제5호)
   - 요건: 부·모·자녀·조부모·손자녀의 돌봄 필요
   - 기간: 연간 90일 이내 (분할 최대 3회, 회당 30일 이상)
   - 봉급: 무급
   - 신청서류: 가족돌봄휴직 신청서 (공무원임용규칙 별지 제42호서식)
   - 신청서 작성: 돌봄필요성·휴직필요성·돌봄계획 기재 필수
   - 조부모·손자녀인 경우: 공무원임용령 제57조의8 각 호 해당 사유 추가 기재

6. 동반휴직
   - 요건: 배우자의 국외 근무·파견·유학·연수 동반
   - 기간: 3년 이내 (재직 중 총 5년 이내)
   - 봉급: 무급

7. 연수휴직
   - 요건: 국내외 연구기관·교육기관에서 연수
   - 기간: 3년 이내
   - 봉급: 무급 (국비유학 시 예외)

▶ 복직
- 복직 신청: 휴직 사유 소멸 즉시 또는 만료 전 30일 이내 신청 원칙
- 복직 시 제출서류: 복직원서 + 휴직 종류별 증빙서류
- 복직 불허: 원래 직위 결원 없어도 의무적으로 복직 발령 (교육공무원법)
- 질병휴직 복직: 의사 진단서(복직 가능 소견) 제출

▶ 퇴직
- 정년퇴직: 교원 정년 62세 (교장·교감 포함)
- 명예퇴직: 20년 이상 근속 공무원, 정년 1년 이상 남은 자 신청 가능
  * 명예퇴직수당: (잔여근무월수 × 월봉급액 × 50%) ÷ 12
- 의원면직: 스스로 사직, 수리일로부터 효력 발생
- 당연퇴직: 금고 이상 형 선고 등 결격사유 발생 시 자동 퇴직

▶ 면직
- 직권면직: 직제 폐지, 정원 감축, 휴직기간 만료 후 복직 불가 등
- 당연면직: 결격사유(국적 상실, 금치산자 선고 등)

[제4장 호봉 획정 및 승급]

▶ 초임호봉 획정
- 임용 전 경력 환산율 적용하여 초임호봉 결정
- 주요 경력 환산율:
  * 교육공무원 경력: 100%
  * 사립학교 교원 경력: 100%
  * 군 복무 경력: 100% (의무복무 기간)
  * 강사·기간제교사 경력: 80% (일부 50%)
  * 민간 기업 경력: 일부 인정 (직종별 상이)
- 환산 경력이 1년 미만이면 초임호봉(1호봉)에서 시작
- 경력증명서 반드시 제출하여 호봉심사위원회 심의

▶ 호봉 승급
- 승급 기간: 매년 1회 (다음 호봉으로 자동 승급)
- 승급 기준일: 임용일 기준 (매년 동일 월일)
- 승급 제한: 직위해제, 정직, 감봉 기간은 승급 제한
- 승급 특례: 업무 성과 우수자 특별승급 가능 (연 1회)

▶ 호봉 재획정
- 호봉 재획정 사유: 임용 후 누락 경력 발견, 착오 등
- 재획정은 소급 적용 (단, 5년 이전 경력은 소급 제한)
- 재획정 절차: 교원 신청 → 호봉심사위원회 심의 → 임용권자 결정

[제5장 정원·현원 관리]

▶ 교원 정원
- 교원 정원: 교육부 장관이 결정, 시·도 교육청별 배정
- 경남 중·고교 교원 배치 기준: 학급당 교원 수 기준 적용
- 과목별 필요 교원 수: 교육과정 편제에 따라 산정

▶ 현원 관리
- 현원 = 재직 교원 수 (휴직자 포함, 파견자 제외)
- 정원 초과 불가 원칙 (임시 배치 시 교육청 승인 필요)
- 결원 보충: 기간제교사 채용으로 결원 보충 가능
- NEIS 정원·현원 현황 수시 관리 의무

[제6장 계약제교원]

▶ 기간제교사
- 채용 사유: 교원의 휴직·파견·연수 등으로 인한 결원 보충
- 채용 기간: 1년 이내 (필요 시 3년까지 연장, 단 총 4년 초과 불가)
- 채용 절차:
  1) 채용 계획 수립 → 공고 (학교 홈페이지 + 교육청 홈페이지)
  2) 서류 심사 → 면접 심사
  3) 합격자 결정 → 채용 계약 체결
  4) NEIS 발령 입력
- 자격 요건: 해당 과목 2급 이상 교원 자격증 소지자
- 보수: 경력에 따른 호봉 적용 (정규 교원과 동일 기준)
- 4대 보험: 1개월 이상 계약 시 의무 가입

▶ 영어회화전문강사
- 채용 기준: 영어 원어민 또는 영어 능통자
- 1차 서면심사 합격: 선발 예정 인원의 2배수
- 최종합격: 1차(70점) + 2차(30점) 합산, 소수점 이하 절상
- 동점자 처리 우선순위: ①영어회화 전문강사 경력 고득점자 ②자격점수 고득점자 ③영어공인인증시험 점수 고득점자
- 취업취약계층 우선 선발 가능 (동점자 시): ①저소득층(최저생계비 150% 이하) ②6개월 이상 장기실업자 ③여성실업자 중 가족부양책임자 ④고령자(만 55세 이상) ⑤장애인 ⑥북한이탈주민·결혼이주자
- 합격 취소: 최종합격 후라도 결격사유 해당 시 합격 취소

▶ 스포츠강사
- 배치 기준: 학교스포츠클럽 운영 학교
- 자격: 체육 관련 학과 졸업 또는 스포츠 관련 자격증 소지자

[제3장 주요 서식 목록]
1. 연가 신청서
2. 병가 신청서 (7일 이상 시 진단서 첨부)
3. 출장 명령서
4. 조퇴·외출 신청서
5. 공가 신청서
6. 특별휴가 신청서 (결혼·사망·출산 등)
7. 질병휴직 신청서 + 진단서
8. 육아휴직 신청서
9. 간호휴직 신청서
10. 자율연수휴직 신청서 + 연수계획서
11. 자율연수 보고서 (복직 시 제출, A4 3쪽 이내)
12. 가족돌봄휴직 신청서 (공무원임용규칙 별지 제42호서식)
13. 복직원서
14. 명예퇴직 신청서
15. 의원면직 신청서
16. 호봉 획정 신청서 + 경력증명서
17. 기간제교사 채용 공고문
18. 기간제교사 채용 계약서

[법적 근거]
- 국가공무원법 제71조 (휴직)
- 교육공무원법 제44조~제45조 (휴직·복직)
- 공무원임용령 제57조의8 (가족돌봄휴직)
- 공무원임용규칙 별지 제42호서식 (가족돌봄휴직 신청서)
- 교원의 지위 향상 및 교육활동 보호를 위한 특별법
- 초·중등교육법 제20조 (교원의 임무)
- 남녀고용평등과 일·가정 양립 지원에 관한 법률 (육아휴직급여)
- 경상남도교육청 교육공무원 인사관리 기준 (수시 개정)
`,

    '교무부': `
[교무부 주요 업무]
- 학교 교무행정 전반: 학적관리, 출결관리, 시간표 편성, 성적처리, 학교생활기록부 관리
- 교무부장은 교감의 지시에 따라 교무 행정 실무 총괄

[학교생활기록부(학생부) 관리]
- 기재 항목: 인적사항, 학적사항, 출결상황, 수상경력, 자격증, 진로희망, 창체활동, 교과학습발달상황, 독서활동, 행동특성 및 종합의견
- 기재 금지 사항: 병명, 가족관계, 종교, 학부모 직업·학력, 특기사항에 부정적 내용
- 마감 일정: 1학기 8월 말, 2학기 2월 중 (학교별 자체 일정 수립)
- 교감 확인 결재: NEIS→학교생활기록부→확인 결재 메뉴
- 마감 후 정정: 교장 허가 후 사유 명기하여 정정, NEIS에 정정 이력 자동 기록
- 학폭 가해학생 조치사항: 심의위 결정에 따라 기재 여부 결정

[시간표 편성]
- 교육과정 편성 기준에 따라 교과별 수업시수 배정
- 교원 수업시수 기준: 정교사 주당 20시간 내외 (학교급별 상이)
- 시간표 소프트웨어(컴피닷넷 등) 활용
- 확정 후 교직원·학생·학부모 공지

[출결 관리]
- 결석 유형: 질병결석, 무단결석, 기타결석, 인정결석
- 무단결석 3일 이상: 교육청 보고 의무
- 장기결석(7일 이상): 가정방문 또는 전화 상담 기록
- 학교폭력 피해로 인한 출석 인정: 교감 결재 필요

[수업일수·수업시수 관리]
- 법정 수업일수: 중학교 190일 이상, 고등학교 190일 이상
- 천재지변·감염병 등으로 수업일수 감축 시 교육청 승인 필요
- 수업일수 부족 시 보강 실시 또는 수업일수 조정 신청

[학적 관리]
- 전입·전출 처리: NEIS 학적시스템 처리 + 학교생활기록부 이송
- 휴학: 질병 등 부득이한 사유, 교장 허가
- 자퇴: 학생·학부모 신청, 교장 허가
- 유예·면제: 취학 유예·면제 신청 접수 및 교육청 보고
`,

    '과정&평가부': `
[교육과정 편성·운영]
- 법적 근거: 초중등교육법 제23조, 교육부 고시 교육과정
- 학교 교육과정 편성: 교육부 기준 + 경남교육청 지침 + 학교 실정 반영
- 편성 절차: 교육과정위원회 구성→학교교육과정 편성→학교운영위원회 심의→교장 확정
- 교감 역할: 교육과정위원회 위원장(또는 교장), 실무 총괄

[고교학점제(고등학교)]
- 2025년 전면 도입 (현재 단계적 적용 중)
- 학생이 과목 선택하여 이수학점 취득
- 최소 이수기준: 192학점 이상 이수 시 졸업
- 교감은 선택과목 개설 계획, 교원 확보 계획 수립 지원

[평가 계획 수립]
- 매 학년도 초 교과별 평가계획 수립 및 학생·학부모 공지
- 지필평가: 중간·기말고사 (서술형 포함 비율 준수)
- 수행평가: 교과별 수행평가 영역·기준 사전 공지 의무
- 성취평가제(절대평가): 중학교 전 과목, 고등학교 일부 과목

[성적 처리]
- NEIS 성적 처리: 교과 담당교사 입력→부장 확인→교감 확인→교장 결재
- 성적 정정: 교장 허가 후 정정 사유 기록
- 성적 이의제기: 학생·학부모 성적 이의제기 처리 절차 구비
- 성적 비공개: 개인 성적은 당사자 외 공개 금지

[학업성적관리규정]
- 각 학교 자체 학업성적관리규정 제정·운영
- 교육청 표준안 기준으로 학교 실정에 맞게 수정
- 매년 교직원 협의회 검토 후 학교운영위원회 심의
`,

    '연구부': `
[연구부 주요 업무]
- 교원 연수 관리, 교내 장학, 수업 컨설팅, 교원학습공동체, 학교 자체평가

[교원 연수 관리]
- 연수 종류: 자격연수, 직무연수, 자율연수, 원격연수
- 법정 이수 시간: 교사 연간 60시간 이상 (경남교육청 기준)
- 법정 의무 연수: 성희롱 예방, 개인정보보호, 학교폭력 예방 (각 1시간 이상)
- NEIS 연수 이력 관리: 교원 연수 이수 결과 입력 확인
- 교내 자율연수 운영: 연구부 주관, 학기당 1회 이상 권장

[교내 자율장학]
- 수업 공개: 교사 1인 연 1회 이상 수업 공개 권장
- 수업 컨설팅: 희망 교원 대상 전문적 수업 피드백
- 동료 장학: 교원 간 상호 수업 참관·협의
- 교감의 역할: 수업 관찰 후 개별 면담, 피드백 제공 (지적이 아닌 지원 중심)

[교원학습공동체]
- 같은 교과 또는 관심사 교원들의 자발적 학습 모임
- 운영 지원: 시간 확보, 예산 지원, 결과 공유 기회 제공
- 경남교육청 교원학습공동체 지원사업 연계 가능

[학교 자체평가]
- 매년 학교 교육활동 전반에 대한 자체평가 실시
- 평가 영역: 교육과정, 교수학습, 교육성과, 교육환경
- 결과 공개: 학교 홈페이지 게시 의무
- 차년도 학교 교육과정 개선에 반영

[강사 초빙 및 예산]
- 외부 강사 초빙 시: 품의서 작성→교장 결재→강사 계약→강사료 지급
- 강사료 기준: 경남교육청 강사 수당 지급 기준 준수
- 영수증 등 증빙 서류 철저히 보관
`,

    '인성부': `
[학교폭력 예방 및 대책]
- 근거법: 학교폭력예방 및 대책에 관한 법률
- 학교폭력 유형: 신체폭력, 언어폭력, 사이버폭력, 따돌림, 성폭력, 금품갈취, 강요

[학교폭력 사안 처리 절차]
1단계: 신고·접수 → 즉시 문서화 (일시, 장소, 관계자, 내용)
2단계: 피해학생 즉각 보호 → 피해·가해 분리, 심리 안정 지원
3단계: 학교장·교육청 보고 → 중대사안(성폭력, 신체적 피해 등)은 즉시 보고
4단계: 학부모 통보 → 피해·가해 학부모 모두에게 24시간 이내 통보
5단계: 전담기구 조사 → 7일 이내 사안 조사 완료
6단계: 자체해결 여부 결정 →
  자체해결 4가지 요건: ①2주 미만 진단, ②재발 우려 없음, ③보복 우려 없음, ④피해학생·학부모 동의
7단계: 심의위원회 요청 → 요건 미충족 시 교육지원청 학폭심의위 심의 요청
8단계: 조치 이행 확인 → 결정 조치 이행 여부 확인 및 NEIS 기록

[피해학생 보호 조치 (제16조)]
① 심리상담 및 조언, ② 일시보호, ③ 치료 및 치료를 위한 요양, ④ 학급교체,
⑤ 삭제, ⑥ 그 밖에 피해학생 보호를 위해 필요한 조치

[가해학생 조치 (제17조)]
① 피해학생에 대한 서면사과, ② 접촉·협박·보복행위 금지, ③ 학교봉사,
④ 사회봉사, ⑤ 학내외 전문가에 의한 특별교육이수 또는 심리치료,
⑥ 출석정지, ⑦ 학급교체, ⑧ 전학, ⑨ 퇴학(고교 한정)

[교감의 역할]
- 학교폭력 전담기구 구성·운영 지원 (교감이 위원장인 경우 많음)
- 피해학생 보호 조치의 즉각 실행 보장
- 사안 처리 과정의 중립성·공정성 확보
- 학부모 면담 시 공정한 중재자 역할
- 모든 과정 문서화 및 기록 보관 (5년)

[학교폭력 예방 교육]
- 연 2회 이상 학생 대상 예방 교육 실시 의무
- 교직원 대상 연 1회 이상 예방 교육 실시
- 학부모 대상 연 1회 이상 예방 교육 실시

[생활지도]
- 2023년 개정 교원의 학생생활지도에 관한 고시 시행
- 교원의 정당한 생활지도는 법적 보호
- 교감의 역할: 생활지도 지원 체계 구축, 교원 보호

[학생 상담]
- 학교 상담 체계: 담임→전문상담교사→외부 전문기관 연계
- Wee클래스 운영: 학교 상담실, 전문상담교사 배치
- 위기학생(자해·자살 위험): 즉시 교장·교감 보고, 보호자 연락, Wee센터 연계
`,

    '정보부': `
[개인정보보호]
- 근거법: 개인정보보호법, 교육정보시스템 운영 규정
- 학교 개인정보 보호책임자: 학교장 / 개인정보 관리책임자: 교감(일반적)
- 개인정보 처리방침: 학교 홈페이지 공개 의무, 매년 갱신

[개인정보 연간 관리]
1. 연초: 개인정보 파일 현황 조사, 처리방침 갱신·공개
2. 3월: 교직원 개인정보보호 교육 실시 (연 1회 이상 의무)
3. 분기별: 개인정보 관리 실태 점검 (PC 보안, 잠금 등)
4. 수시: 개인정보 파기 (보유기간 만료 시)
5. 연말: 관리 현황 교육청 보고

[유출 사고 대응]
- 발견 즉시 교장·교육청 보고
- 72시간 이내 개인정보보호위원회 및 정보주체 신고 의무
- 피해 최소화 조치 즉시 시행

[정보보안]
- 보안 USB 사용 원칙, 개인 저장장치 업무망 연결 금지
- 학생 명단·성적 등 외부 반출 시 암호화 필수
- 퇴직 교원 시스템 접근 권한 즉시 삭제
- NEIS 권한 관리: 필요한 권한만 부여, 정기 점검

[CCTV 운영]
- 운영 규정 제정, 학교운영위원회 심의
- 영상 보관기간: 30일 이상
- 열람 요청: 관리책임자(교감) 허가 후 열람
- 운영 일지 작성 의무

[SW·AI 교육]
- 정보 교과 교육과정 운영
- SW·AI 교육 관련 예산 편성 지원
- 교원 연수 기회 제공
`,

    '과학영재수학환경부': `
[과학교육]
- 과학실 안전 관리: 연 1회 이상 안전점검, 위험 약품 관리 대장 작성
- 탐구·실험 활동: 사전 안전교육 필수, 교원 동행 원칙
- 과학발명품 대회: 학교 대표 선발→교육청 대회 참가
- 과학의 날(4월 21일) 행사 운영

[영재교육]
- 영재학급 운영: 교육청 지정 또는 학교 자체 운영
- 영재학생 선발: 지필+관찰추천제 병행
- 영재교육 이수 시 학생부 기재 가능
- 영재학급 강사: 외부 전문가 또는 교내 교원

[수학교육]
- 수포자 예방: 기초학력 지원 프로그램 연계
- 수학올림피아드·수학경시대회 참가 지원
- 수학 체험 활동(수학 체험전 등) 운영

[환경교육]
- 환경교육법에 따른 환경교육 계획 수립
- 연간 환경교육 시수 확보
- 환경교육주간(6월) 운영
- 학교 환경 동아리 운영 지원
`,

    '체육&안전부': `
[체육교육]
- 체육 교육과정 운영: 교과 체육 + 창체 체육활동
- 학교스포츠클럽: 정규 수업 외 자율 참여, 학생부 기재 가능
- 체육대회: 연 1회 이상 전교 체육대회 권장

[학교안전교육]
- 7대 안전교육: 생활안전, 교통안전, 폭력·신변안전, 약물·사이버중독, 재난안전, 직업안전, 응급처치
- 법정 이수시간: 학년별 51시간 이상 (유치원 기준 상이)
- 안전교육 실시 기록: NEIS 또는 학교 자체 서식에 기록

[재난 대피 훈련]
- 연 2회 이상 실시 의무 (화재·지진 등)
- 훈련 계획 수립→실시→결과 보고→개선사항 반영
- 훈련 결과 교육청 보고 (훈련 후 2주 이내)

[학교안전공제회]
- 교육활동 중 학생 안전사고 발생 시 공제급여 청구
- 청구 절차: 사고 발생→담임 보고→교감 확인→학교안전공제회 청구
- 청구 기한: 사고 발생일로부터 3년 이내

[스포츠강사]
- 초등학교 스포츠강사 배치 사업
- 강사 복무 관리: 교감이 직접 관리·감독 책임

[체육시설 관리]
- 정기 안전점검: 연 2회 이상
- 파손·위험 시설 즉시 사용 중지 후 수리
- 외부 시설 사용 허가: 학교운영위원회 심의 또는 학교장 허가
`
};

// ============================================================
// 이미 로드된 base_forms 배열에서 파일 컨텍스트 문자열 생성 (fetch 없음)
// ============================================================
function buildFileContextFromRows(rows, dept, isFastMode = true) {
    try {
        if (!rows || rows.length === 0) return '';

        // 빠른 검색: 부서 필터, 정밀 검색: 전체
        const filtered = isFastMode
            ? rows.filter(r => (r.dept || '') === dept)
            : rows;

        // 청크 중복 제거
        const mainRows = filtered.filter(r =>
            r.is_chunked !== 'true' || (r.chunk_index === 0 || r.chunk_index === '0')
        );
        if (mainRows.length === 0) return '';

        const fileListText = mainRows.map((r, i) => {
            const ext = (r.file_type || 'pdf').toUpperCase();
            const deptTag = isFastMode ? '' : ` [${r.dept || ''}]`;
            return `  ${i + 1}. [${ext}]${deptTag} ${r.title}`;
        }).join('\n');

        const TEXT_PER_FILE = 3000;
        const TOTAL_MAX     = 20000;
        let contentSections = [];
        let totalLen = 0;

        const sortedRows = isFastMode
            ? mainRows
            : [...mainRows].sort((a, b) => {
                const aMatch = (a.dept || '') === dept ? 0 : 1;
                const bMatch = (b.dept || '') === dept ? 0 : 1;
                return aMatch - bMatch;
            });

        for (const r of sortedRows) {
            if (!r.desc || r.desc.length < 10) continue;
            const cleanDesc = r.desc.trim();
            const snippet = cleanDesc.length > TEXT_PER_FILE
                ? cleanDesc.substring(0, TEXT_PER_FILE) + '...(이하 생략)'
                : cleanDesc;
            const deptLabel = isFastMode ? '' : ` (${r.dept || ''})`;
            contentSections.push(`▶ [${r.title}${deptLabel}]\n${snippet}`);
            totalLen += snippet.length;
            if (totalLen > TOTAL_MAX) break;
        }

        const modeLabel = isFastMode
            ? `${dept} 부서 (총 ${mainRows.length}개)`
            : `전체 부서 (총 ${mainRows.length}개, 선택 부서: ${dept})`;

        let result = `\n[자료실 등록 파일 목록 - ${modeLabel}]\n` +
                     `※ 아래 파일이 자료실에 등록되어 있습니다. 관련 질문 시 파일명을 언급하여 안내하세요.\n` +
                     fileListText;

        if (contentSections.length > 0) {
            result += `\n\n[자료실 파일 내용 분석 - ${dept} (Gemini 답변 근거로 최우선 활용)]\n` +
                      `※ 아래는 자료실에 등록된 각 파일의 실제 내용 분석입니다. 반드시 이 내용을 근거로 구체적으로 답변하세요.\n\n` +
                      contentSections.join('\n\n─────────────────────\n\n');
        }
        return result;
    } catch(e) {
        console.warn('[AFTER] buildFileContextFromRows 오류:', e.message);
        return '';
    }
}

// ============================================================
// DB 자료실에서 해당 부서의 파일 목록을 가져와 컨텍스트로 구성
// isFastMode=true : 선택 부서만 조회 (빠른 검색)
// isFastMode=false: 전체 부서 조회 (정밀 검색, 부서 태그 포함)
// ============================================================
async function fetchDeptFileContext(dept, isFastMode = true) {
    try {
        // base_forms에서 파일 목록 전체 조회 (페이지네이션)
        // ★ GenSpark API 최대 200개 제한 → limit=200, total 기반 종료
        let allRows = [];
        let page = 1;
        let totalKnow = null;
        while (true) {
            const res = await fetch(apiUrl(`tables/base_forms?page=${page}&limit=200`));
            if (!res.ok) break;
            const data = await res.json();
            if (totalKnow === null) totalKnow = data.total || 0;
            const chunk = data.data || [];
            // 빠른 검색: 선택 부서만 / 정밀 검색: 전체
            const rows = isFastMode
                ? chunk.filter(r => r.dept === dept)
                : chunk;
            allRows = allRows.concat(rows);
            if (chunk.length === 0 || allRows.length >= totalKnow) break;
            page++;
        }
        if (allRows.length === 0) return '';

        // ── 청크 파일 중복 제거: chunk_index=0 또는 is_chunked≠true 인 것만 대표로 사용 ──
        const mainRows = allRows.filter(r =>
            r.is_chunked !== 'true' || (r.chunk_index === 0 || r.chunk_index === '0')
        );

        // ── 파일 목록 섹션 (파일명 안내용) ──
        const fileListText = mainRows.map((r, i) => {
            const ext  = (r.file_type || 'pdf').toUpperCase();
            const deptTag = isFastMode ? '' : ` [${r.dept||''}]`;
            return `  ${i+1}. [${ext}]${deptTag} ${r.title}`;
        }).join('\n');

        // ── desc 내용 섹션 (AI 답변 근거용) ──
        // 정밀 검색 시에는 선택 부서를 우선하되 다른 부서도 포함
        const TEXT_PER_FILE = 3000;
        const TOTAL_MAX     = 20000;
        let contentSections = [];
        let totalLen = 0;

        // 정밀 검색: 선택 부서 먼저 정렬
        const sortedRows = isFastMode
            ? mainRows
            : [...mainRows].sort((a, b) => {
                const aMatch = (a.dept || '') === dept ? 0 : 1;
                const bMatch = (b.dept || '') === dept ? 0 : 1;
                return aMatch - bMatch;
            });

        for (const r of sortedRows) {
            if (!r.desc || r.desc.length < 10) continue;
            const cleanDesc = r.desc.trim();
            if (cleanDesc.length < 10) continue;
            const snippet = cleanDesc.length > TEXT_PER_FILE
                ? cleanDesc.substring(0, TEXT_PER_FILE) + '...(이하 생략)'
                : cleanDesc;
            const deptLabel = isFastMode ? '' : ` (${r.dept||''})`;
            contentSections.push(`▶ [${r.title}${deptLabel}]\n${snippet}`);
            totalLen += snippet.length;
            if (totalLen > TOTAL_MAX) break;
        }

        const modeLabel = isFastMode
            ? `${dept} 부서 (총 ${mainRows.length}개)`
            : `전체 부서 (총 ${mainRows.length}개, 선택 부서: ${dept})`;

        let result = `\n[자료실 등록 파일 목록 - ${modeLabel}]\n` +
                     `※ 아래 파일이 자료실에 등록되어 있습니다. 관련 질문 시 파일명을 언급하여 안내하세요.\n` +
                     fileListText;

        if (contentSections.length > 0) {
            result += `\n\n[자료실 파일 내용 분석 - ${dept} (Gemini 답변 근거로 최우선 활용)]\n` +
                      `※ 아래는 자료실에 등록된 각 파일의 실제 내용 분석입니다. 반드시 이 내용을 근거로 구체적으로 답변하세요.\n\n` +
                      contentSections.join('\n\n─────────────────────\n\n');
        }

        return result;
    } catch(e) {
        console.warn('[AFTER] fetchDeptFileContext 오류:', e.message);
        return '';
    }
}

// ============================================================
// AI에게 전달할 시스템 프롬프트 생성
// cachedRows: startAiAnswer에서 이미 로드한 base_forms 배열 (재활용으로 DB 이중 fetch 방지)
// isFastMode: true=선택 부서만, false=전체 부서 (정밀)
// ============================================================
async function buildSystemPrompt(dept, isFastMode = true, cachedRows = null) {
    const deptKnowledge = KNOWLEDGE_BASE[dept] || '해당 부서 데이터가 아직 입력되지 않았습니다.';

    // ★ 캐시된 rows를 직접 사용 (이미 fetchAllPages로 가져온 경우 재fetch 없음)
    const dbFileContext = cachedRows
        ? buildFileContextFromRows(cachedRows, dept, isFastMode)
        : await fetchDeptFileContext(dept, isFastMode);

    // ★ 피드백 학습 컨텍스트 로드
    const feedbackContext = await fetchFeedbackContext(dept);

    // ★ form_knowledge 테이블에서 해당 부서 AI 분석 지식 로드
    let knowledgeContext = '';
    try {
        const kRes = await fetch(apiUrl(`tables/form_knowledge?page=1&limit=100&search=${encodeURIComponent(dept)}`));
        if (kRes.ok) {
            const kData = await kRes.json();
            const kRows = (kData.data || []).filter(r => r.dept === dept && r.summary);
            if (kRows.length > 0) {
                knowledgeContext = '\n\n[AI 사전 분석 지식 - 업로드 파일 요약]\n';
                kRows.slice(0, 20).forEach(r => {
                    knowledgeContext += `• [${r.title}] ${r.summary}`;
                    if (r.keywords) knowledgeContext += ` (키워드: ${r.keywords})`;
                    knowledgeContext += '\n';
                });
            }
        }
    } catch(e) { /* 지식 로드 실패 시 무시 */ }

    const searchModeLabel = isFastMode
        ? `⚡ 빠른 검색 모드 (선택 부서: ${dept} 데이터 우선 검토)`
        : `🔬 정밀 검색 모드 (전체 부서 데이터 종합 검토)`;

    return `당신은 "나와라 만능 교감!"이라는 앱의 AI 어시스턴트입니다.
경상남도 중·고등학교에 신규 임용된 교감 선생님의 업무를 도와주는 전문가입니다.

[현재 선택된 부서: ${dept}]
[검색 모드: ${searchModeLabel}]

[참고 자료 우선순위 - 반드시 이 순서로 활용하세요]
1순위: 아래 [자료실 업로드 파일 목록] 및 [로컬 DB 지식 내용] (가장 최신·공식 자료)
2순위: 경상남도교육청 관련 법령·지침·고시
3순위: 교육부 발간 자료 및 훈령
4순위: 일반 교육 법령 및 웹 검색 결과

[로컬 DB 지식 내용 - 핵심 업무 지식]
${deptKnowledge}
${dbFileContext}
${knowledgeContext}
${feedbackContext}

[답변 형식 규칙 - 반드시 준수]
- 각 섹션은 ## 헤더로 구분하고 섹션 사이에 반드시 빈 줄을 넣습니다.
- 문장이 끝나면 반드시 줄바꿈합니다. 여러 문장을 한 줄에 이어 쓰지 마세요.
- 번호 목록(1. 2. 3.)은 각 항목을 별도 줄에 작성합니다.
- 별표(*) 항목은 각 항목을 별도 줄에 작성하고, 하위 항목은 들여쓰기합니다.
- 가나다 항목(가. 나. 다.)은 각 항목을 별도 줄에 작성합니다.
- 하위 항목(-)은 상위 항목보다 2칸 들여씁니다.
- 절대로 여러 항목을 한 문단에 연속으로 붙여 쓰지 마세요.

[답변 구조]

## 📋 질문 요약
(질문의 핵심을 1~2줄로 요약. 줄바꿈 후 작성)

## ✅ 핵심 답변
(가장 중요한 답변을 먼저 제시. 각 포인트는 별도 줄에)

## 📌 상세 내용
(관련 법령, 절차, 기준 등 상세 설명)
(각 항목은 반드시 별도 줄에 작성)

## 🔢 처리 절차
(단계별 처리 방법 - 각 단계를 별도 줄에)
1. 첫 번째 단계
   * 세부 내용은 들여써서 작성
   - 추가 세부사항

2. 두 번째 단계
   * 세부 내용

## ⚠️ 주의사항
(각 주의사항을 별도 줄에 작성)

## 📎 관련 서식 및 자료
자료실에 다음 파일이 등록되어 있습니다 (앱 내 자료실에서 다운로드 가능):
(위 [자료실 업로드 파일 목록]에서 관련 파일명을 직접 인용하여 아래 형식으로 나열하세요)
- [PDF] 파일명.pdf
- [HWP] 파일명.hwp
- [XLSX] 파일명.xlsx
※ 반드시 위 [ ] 형식을 유지해야 앱에서 다운로드 버튼이 자동 생성됩니다.

[답변 원칙]
1. 자료실 업로드 파일 목록에 있는 파일명을 직접 언급하며 "자료실에서 '[파일명]'을 다운로드하시면 됩니다"와 같이 구체적으로 안내합니다.
2. 로컬 DB 지식 내용을 최우선으로 참고하여 답변합니다.
3. 로컬 DB에 없으면 경상남도교육청 지침·고시를 2순위로 참고합니다.
4. 경남교육청 자료에도 없으면 교육부 발간 자료를 참고합니다.
5. 위 자료에도 없으면 일반 교육 법령과 웹 검색 결과를 활용하되, 출처를 명시합니다.
6. 모르거나 확신이 없으면 "경상남도교육청에 직접 문의하시거나 관련 법령을 확인하시기 바랍니다"라고 안내합니다.
7. 답변은 신규 교감 선생님이 바로 실행할 수 있도록 구체적이고 실용적으로 작성합니다.
8. 반드시 한국어(존댓말)로 답변하며, 줄바꿈과 들여쓰기를 철저히 지킵니다.
9. [사용자 피드백 학습] 섹션에 기록된 개선 요청사항을 반드시 반영하여 답변 품질을 높이세요.`;
}

// ============================================================
// 피드백 학습 컨텍스트 로드 (Gemini 시스템 프롬프트용) — 10분 인메모리 캐시
// ============================================================
let _feedbackCache = null;
let _feedbackCacheTs = 0;
const FEEDBACK_TTL = 10 * 60 * 1000; // 10분

async function fetchFeedbackContext(dept) {
    try {
        // ★ 캐시 유효 시 즉시 반환
        if (_feedbackCache && Date.now() - _feedbackCacheTs < FEEDBACK_TTL) {
            return _buildFeedbackCtx(_feedbackCache, dept);
        }
        // ai_feedback 테이블에서 최근 100개 피드백 로드
        const res = await fetch(
            (typeof apiUrl === 'function' ? apiUrl('tables/ai_feedback?limit=100') : 'tables/ai_feedback?limit=100')
        );
        if (!res.ok) return '';
        const data = await res.json();
        const rows = (data.data || []);
        // ★ 캐시 저장
        _feedbackCache = rows;
        _feedbackCacheTs = Date.now();
        if (rows.length === 0) return '';

        return _buildFeedbackCtx(rows, dept);
    } catch(e) {
        return '';
    }
}

// 피드백 rows → 컨텍스트 문자열 변환 (fetch 없음)
function _buildFeedbackCtx(rows, dept) {
    if (!rows || rows.length === 0) return '';

    const badRows = rows
        .filter(r => r.feedback_type === 'bad' && r.feedback_comment && r.feedback_comment.trim().length > 5)
        .sort((a, b) => (b.created_at || '') > (a.created_at || '') ? 1 : -1)
        .slice(0, 10);

    const goodRows = rows
        .filter(r => r.feedback_type === 'good')
        .sort((a, b) => (b.created_at || '') > (a.created_at || '') ? 1 : -1)
        .slice(0, 5);

    if (badRows.length === 0 && goodRows.length === 0) return '';

    let ctx = '\n\n[사용자 피드백 학습 - 이전 답변에 대한 실제 사용자 의견]\n';
    ctx += '※ 아래 개선 요청사항을 반드시 반영하여 더 나은 답변을 제공하세요.\n';

    if (badRows.length > 0) {
        ctx += '\n▶ 개선 요청 (아쉬움 의견):\n';
        badRows.forEach((r, i) => {
            const q = (r.question || '').slice(0, 60);
            const c = (r.feedback_comment || '').slice(0, 150);
            const d = r.dept ? `[${r.dept}]` : '';
            ctx += `${i+1}. ${d} 질문: "${q}..." → 개선요청: "${c}"\n`;
        });
    }

    if (goodRows.length > 0) {
        ctx += '\n▶ 좋은 평가를 받은 답변 패턴 (이 방식을 더 활용하세요):\n';
        goodRows.forEach((r, i) => {
            const q = (r.question || '').slice(0, 60);
            const d = r.dept ? `[${r.dept}]` : '';
            ctx += `${i+1}. ${d} "${q}..." → 사용자가 도움됨으로 평가\n`;
        });
    }

    const totalGood = rows.filter(r => r.feedback_type === 'good').length;
    const totalBad  = rows.filter(r => r.feedback_type === 'bad').length;
    ctx += `\n[피드백 통계] 전체 도움됨: ${totalGood}건 / 아쉬움: ${totalBad}건 (총 ${rows.length}건)\n`;
    return ctx;
}

// ============================================================
// FORMS_DATABASE 제거됨 (v3.0)
// 모든 서식은 사용자가 직접 업로드 (tables/user_forms)
// ============================================================
const FORMS_DATABASE = [
    // (비어 있음 – 모든 서식은 사용자 업로드)
    // 삭제된 f001 ~ f086: 교감업무, 교무부, 과정&평가부, 연구부, 인성부, 정보부, 과학영재수학환경부, 체육&안전부
    /*
    {
        id: 'f001', dept: '교감업무', name: '직무대리 발령 통보서',
        type: 'hwp', size: '약 20KB', desc: '학교장 부재 시 교감 직무대리 발령 관련 공문 서식',
        source: '경상남도교육청',
        searchUrl: 'https://www.gne.go.kr/search/search.do?query=%EC%A7%81%EB%AC%B4%EB%8C%80%EB%A6%AC+%EB%B0%9C%EB%A0%B9+%ED%86%B5%EB%B3%B4%EC%84%9C&siteld='
    },
    {
        id: 'f002', dept: '교감업무', name: '교직원 업무분장 계획서',
        type: 'hwp', size: '약 50KB', desc: '연간 교직원 업무분장 계획 서식',
        source: '경상남도교육청',
        searchUrl: 'https://www.gne.go.kr/search/search.do?query=%EA%B5%90%EC%A7%81%EC%9B%90+%EC%97%85%EB%AC%B4%EB%B6%84%EC%9E%A5'
    },
    {
        id: 'f003', dept: '교감업무', name: '교원 근무성적 평정서',
        type: 'hwp', size: '약 40KB', desc: '교원 근무성적 평정 서식 (법령 별지 제4호 서식)',
        source: '국가법령정보센터',
        url: 'https://www.law.go.kr/LSW/flDownload.do?flSeq=159531903'
    },
    {
        id: 'f011', dept: '교감업무', name: '학교교육계획서(연간)',
        type: 'hwp', size: '약 80KB', desc: '연간 학교교육계획 수립 표준 서식',
        source: '경상남도교육청',
        searchUrl: 'https://www.gne.go.kr/search/search.do?query=%ED%95%99%EA%B5%90%EA%B5%90%EC%9C%A1%EA%B3%84%ED%9A%8D'
    },
    {
        id: 'f012', dept: '교감업무', name: '학교운영위원회 회의록',
        type: 'hwp', size: '약 35KB', desc: '학교운영위원회 심의·의결 회의록 서식',
        source: '에듀넷',
        searchUrl: 'https://www.edunet.net/nedu/search/resultList.do?menu_id=82&searchText=%ED%95%99%EA%B5%90%EC%9A%B4%EC%98%81%EC%9C%84%EC%9B%90%ED%9A%8C+%ED%9A%8C%EC%9D%98%EB%A1%9D'
    },
    {
        id: 'f013', dept: '교감업무', name: '교원 연가·병가 신청서',
        type: 'hwp', size: '약 25KB', desc: '교직원 연가·병가·특별휴가 신청 서식',
        source: '나이스 대국민서비스',
        searchUrl: 'https://www.neis.go.kr/search/search.do?query=%EC%97%B0%EA%B0%80+%EC%8B%A0%EC%B2%AD%EC%84%9C'
    },
    {
        id: 'f014', dept: '교감업무', name: '출장 복명서',
        type: 'hwp', size: '약 20KB', desc: '출장 후 결과 보고 서식',
        source: '경상남도교육청',
        searchUrl: 'https://www.gne.go.kr/search/search.do?query=%EC%B6%9C%EC%9E%A5+%EB%B3%B5%EB%AA%85%EC%84%9C'
    },
    {
        id: 'f015', dept: '교감업무', name: '학교 자체평가 보고서',
        type: 'hwp', size: '약 60KB', desc: '학교 자체평가 결과 보고 표준 서식',
        source: '경상남도교육청',
        searchUrl: 'https://www.gne.go.kr/search/search.do?query=%ED%95%99%EA%B5%90+%EC%9E%90%EC%B2%B4%ED%8F%89%EA%B0%80'
    },
    {
        id: 'f016', dept: '교감업무', name: '교원능력개발평가 다면평가 집계표',
        type: 'hwp', size: '약 40KB', desc: '교원능력개발평가 다면평가 집계 서식',
        source: '교육부',
        searchUrl: 'https://www.moe.go.kr/search/search.do?query=%EA%B5%90%EC%9B%90%EB%8A%A5%EB%A0%A5%EA%B0%9C%EB%B0%9C%ED%8F%89%EA%B0%80+%EC%84%9C%EC%8B%9D'
    },
    {
        id: 'f017', dept: '교감업무', name: '민원 처리 대장',
        type: 'hwp', size: '약 25KB', desc: '학교 민원 접수·처리 기록 서식',
        source: '경상남도교육청',
        searchUrl: 'https://www.gne.go.kr/search/search.do?query=%EB%AF%BC%EC%9B%90+%EC%B2%98%EB%A6%AC+%EB%8C%80%EC%9E%A5'
    },

    // ── 교무부 ──────────────────────────────────────────────────────────
    {
        id: 'f006', dept: '교무부', name: '학교생활기록부 점검 체크리스트',
        type: 'hwp', size: '약 40KB', desc: '학기말 학생부 점검용 체크리스트',
        source: '교육부',
        url: 'https://edunet.net/nedu/search/resultList.do?menu_id=82&searchText=%ED%95%99%EA%B5%90%EC%83%9D%ED%99%9C%EA%B8%B0%EB%A1%9D%EB%B6%80+%EC%A0%90%EA%B2%80',
        searchUrl: 'https://www.edunet.net/nedu/search/resultList.do?menu_id=82&searchText=%ED%95%99%EA%B5%90%EC%83%9D%ED%99%9C%EA%B8%B0%EB%A1%9D%EB%B6%80+%EC%A0%90%EA%B2%80'
    },
    {
        id: 'f021', dept: '교무부', name: '시간표 편성 기준표',
        type: 'hwp', size: '약 45KB', desc: '학기별 시간표 편성 기준 및 현황 서식',
        source: '경상남도교육청',
        searchUrl: 'https://www.gne.go.kr/search/search.do?query=%EC%8B%9C%EA%B0%84%ED%91%9C+%ED%8E%B8%EC%84%B1'
    },
    {
        id: 'f022', dept: '교무부', name: '학적 변동 통보서',
        type: 'hwp', size: '약 30KB', desc: '전입·전출·유예 등 학적 변동 서식',
        source: '국가법령정보센터',
        url: 'https://www.law.go.kr/LSW/flDownload.do?flSeq=162756001'
    },
    {
        id: 'f023', dept: '교무부', name: '성적 이의신청 처리 대장',
        type: 'hwp', size: '약 30KB', desc: '학생 성적 이의신청 접수·처리 기록',
        source: '경상남도교육청',
        searchUrl: 'https://www.gne.go.kr/search/search.do?query=%EC%84%B1%EC%A0%81+%EC%9D%B4%EC%9D%98%EC%8B%A0%EC%B2%AD'
    },
    {
        id: 'f024', dept: '교무부', name: '수업일수·수업시수 현황표',
        type: 'hwp', size: '약 35KB', desc: '학기별 수업일수 및 교과별 시수 현황',
        source: '경상남도교육청',
        searchUrl: 'https://www.gne.go.kr/search/search.do?query=%EC%88%98%EC%97%85%EC%9D%BC%EC%88%98+%EC%8B%9C%EC%88%98+%ED%98%84%ED%99%A9'
    },
    {
        id: 'f025', dept: '교무부', name: '교과서 수급 신청서',
        type: 'hwp', size: '약 28KB', desc: '학년도 교과서 수급 및 반납 신청 서식',
        source: '경상남도교육청',
        searchUrl: 'https://www.gne.go.kr/search/search.do?query=%EA%B5%90%EA%B3%BC%EC%84%9C+%EC%88%98%EA%B8%89'
    },
    {
        id: 'f026', dept: '교무부', name: '졸업대장 정리 체크리스트',
        type: 'hwp', size: '약 32KB', desc: '졸업 처리 전 확인 사항 체크리스트',
        source: '경상남도교육청',
        searchUrl: 'https://www.gne.go.kr/search/search.do?query=%EC%A1%B8%EC%97%85+%EC%B2%B4%ED%81%AC%EB%A6%AC%EC%8A%A4%ED%8A%B8'
    },
    {
        id: 'f027', dept: '교무부', name: '학교장허가 교외체험학습 신청서',
        type: 'hwp', size: '약 25KB', desc: '교외체험학습 신청·결과보고 서식',
        source: '에듀넷',
        searchUrl: 'https://www.edunet.net/nedu/search/resultList.do?menu_id=82&searchText=%EA%B5%90%EC%99%B8%EC%B2%B4%ED%97%98%ED%95%99%EC%8A%B5+%EC%8B%A0%EC%B2%AD%EC%84%9C'
    },

    // ── 과정&평가부 ────────────────────────────────────────────────────
    {
        id: 'f010', dept: '과정&평가부', name: '학업성적관리규정',
        type: 'hwp', size: '약 70KB', desc: '학교 자체 학업성적관리규정 표준안',
        source: '경상남도교육청',
        searchUrl: 'https://www.gne.go.kr/search/search.do?query=%ED%95%99%EC%97%85%EC%84%B1%EC%A0%81%EA%B4%80%EB%A6%AC%EA%B7%9C%EC%A0%95'
    },
    {
        id: 'f031', dept: '과정&평가부', name: '교육과정 편성·운영 계획서',
        type: 'hwp', size: '약 90KB', desc: '학교 교육과정 편성·운영 기본 계획',
        source: '경상남도교육청',
        searchUrl: 'https://www.gne.go.kr/search/search.do?query=%EA%B5%90%EC%9C%A1%EA%B3%BC%EC%A0%95+%ED%8E%B8%EC%84%B1+%EC%9A%B4%EC%98%81+%EA%B3%84%ED%9A%8D%EC%84%9C'
    },
    {
        id: 'f032', dept: '과정&평가부', name: '수행평가 계획서',
        type: 'hwp', size: '약 45KB', desc: '교과별 수행평가 영역·기준·비율 계획',
        source: '경상남도교육청',
        searchUrl: 'https://www.gne.go.kr/search/search.do?query=%EC%88%98%ED%96%89%ED%8F%89%EA%B0%80+%EA%B3%84%ED%9A%8D%EC%84%9C'
    },
    {
        id: 'f033', dept: '과정&평가부', name: '지필평가 출제 계획서',
        type: 'hwp', size: '약 40KB', desc: '중간·기말고사 출제 계획 및 이의신청 절차',
        source: '경상남도교육청',
        searchUrl: 'https://www.gne.go.kr/search/search.do?query=%EC%A7%80%ED%95%84%ED%8F%89%EA%B0%80+%EC%B6%9C%EC%A0%9C'
    },
    {
        id: 'f034', dept: '과정&평가부', name: '성취기준 및 평가기준 목록',
        type: 'hwp', size: '약 60KB', desc: '교과별 성취기준 및 평가 기준 정리 서식',
        source: '한국교육과정평가원(KICE)',
        url: 'https://www.kice.re.kr/sub/info.do?m=0203&s=kice'
    },
    {
        id: 'f035', dept: '과정&평가부', name: '교육과정 운영 자체평가서',
        type: 'hwp', size: '약 50KB', desc: '학기말 교육과정 운영 결과 자체평가 서식',
        source: '경상남도교육청',
        searchUrl: 'https://www.gne.go.kr/search/search.do?query=%EA%B5%90%EC%9C%A1%EA%B3%BC%EC%A0%95+%EC%9E%90%EC%B2%B4%ED%8F%89%EA%B0%80'
    },
    {
        id: 'f036', dept: '과정&평가부', name: '창의적체험활동 운영 계획',
        type: 'hwp', size: '약 50KB', desc: '자율·동아리·봉사·진로 활동 운영 계획',
        source: '에듀넷',
        searchUrl: 'https://www.edunet.net/nedu/search/resultList.do?menu_id=82&searchText=%EC%B0%BD%EC%9D%98%EC%A0%81%EC%B2%B4%ED%97%98%ED%99%9C%EB%8F%99+%EC%84%9C%EC%8B%9D'
    },

    // ── 연구부 ──────────────────────────────────────────────────────────
    {
        id: 'f007', dept: '연구부', name: '교내 자율연수 계획서',
        type: 'hwp', size: '약 40KB', desc: '교내 자율연수 운영 계획 서식',
        source: '경상남도교육청',
        searchUrl: 'https://www.gne.go.kr/search/search.do?query=%EC%9E%90%EC%9C%A8%EC%97%B0%EC%88%98+%EA%B3%84%ED%9A%8D%EC%84%9C'
    },
    {
        id: 'f041', dept: '연구부', name: '수업 컨설팅 신청·결과서',
        type: 'hwp', size: '약 40KB', desc: '동료 장학·컨설팅 장학 신청 및 결과 서식',
        source: '경상남도교육청',
        searchUrl: 'https://www.gne.go.kr/search/search.do?query=%EC%BB%A8%EC%84%A4%ED%8C%85+%EC%9E%A5%ED%95%99+%EC%84%9C%EC%8B%9D'
    },
    {
        id: 'f042', dept: '연구부', name: '교원학습공동체 운영 계획서',
        type: 'hwp', size: '약 50KB', desc: '전문적 학습공동체 구성·운영 계획 서식',
        source: '경상남도교육청',
        searchUrl: 'https://www.gne.go.kr/search/search.do?query=%EC%A0%84%EB%AC%B8%EC%A0%81+%ED%95%99%EC%8A%B5%EA%B3%B5%EB%8F%99%EC%B2%B4'
    },
    {
        id: 'f043', dept: '연구부', name: '수업 관찰 체크리스트',
        type: 'hwp', size: '약 30KB', desc: '수업 참관 시 활용하는 관찰 체크리스트',
        source: '에듀넷',
        searchUrl: 'https://www.edunet.net/nedu/search/resultList.do?menu_id=82&searchText=%EC%88%98%EC%97%85+%EA%B4%80%EC%B0%B0+%EC%B2%B4%ED%81%AC%EB%A6%AC%EC%8A%A4%ED%8A%B8'
    },
    {
        id: 'f044', dept: '연구부', name: '연구대회 참가 신청서',
        type: 'hwp', size: '약 35KB', desc: '각종 교육 연구대회 참가 신청 서식',
        source: '경상남도교육청',
        searchUrl: 'https://www.gne.go.kr/search/search.do?query=%EC%97%B0%EA%B5%AC%EB%8C%80%ED%9A%8C+%EC%8B%A0%EC%B2%AD%EC%84%9C'
    },
    {
        id: 'f045', dept: '연구부', name: '교원 직무연수 이수 현황표',
        type: 'hwp', size: '약 30KB', desc: '교원별 직무·자격연수 이수 현황 집계',
        source: '경상남도교육청',
        searchUrl: 'https://www.gne.go.kr/search/search.do?query=%EC%A7%81%EB%AC%B4%EC%97%B0%EC%88%98+%EC%9D%B4%EC%88%98+%ED%98%84%ED%99%A9'
    },
    {
        id: 'f046', dept: '연구부', name: '학교 장학 계획서',
        type: 'hwp', size: '약 55KB', desc: '연간 교내·외 장학 활동 계획 서식',
        source: '경상남도교육청',
        searchUrl: 'https://www.gne.go.kr/search/search.do?query=%EC%9E%A5%ED%95%99+%EA%B3%84%ED%9A%8D%EC%84%9C'
    },

    // ── 인성부 ──────────────────────────────────────────────────────────
    {
        id: 'f004', dept: '인성부', name: '학교폭력 사안 접수 처리 대장',
        type: 'hwp', size: '약 50KB', desc: '학교폭력 접수 및 처리 기록 서식',
        source: '교육부',
        url: 'https://www.moe.go.kr/boardCnts/fileDown.do?m=0101&s=moe&fileSeq=e1f3a3b1e1e5a3b1e1e5'
    },
    {
        id: 'f005', dept: '인성부', name: '피해학생 긴급보호 조치 신청서',
        type: 'hwp', size: '약 30KB', desc: '피해학생 즉각 보호 조치 신청 서식',
        source: '교육부 학교폭력예방 자료',
        searchUrl: 'https://www.moe.go.kr/search/search.do?query=%ED%94%BC%ED%95%B4%ED%95%99%EC%83%9D+%EA%B8%B4%EA%B8%89%EB%B3%B4%ED%98%B8+%EC%84%9C%EC%8B%9D'
    },
    {
        id: 'f051', dept: '인성부', name: '학교폭력 전담기구 회의록',
        type: 'hwp', size: '약 40KB', desc: '학교폭력 전담기구 심의 회의록 서식',
        source: '교육부',
        searchUrl: 'https://www.moe.go.kr/search/search.do?query=%ED%95%99%EA%B5%90%ED%8F%AD%EB%A0%A5+%EC%A0%84%EB%8B%B4%EA%B8%B0%EA%B5%AC+%ED%9A%8C%EC%9D%98%EB%A1%9D'
    },
    {
        id: 'f052', dept: '인성부', name: '위기학생 상담일지',
        type: 'hwp', size: '약 30KB', desc: '위기(자살·자해·비행 등) 학생 상담 기록',
        source: '경상남도교육청 Wee센터',
        searchUrl: 'https://www.gne.go.kr/search/search.do?query=%EC%9C%84%EA%B8%B0%ED%95%99%EC%83%9D+%EC%83%81%EB%8B%B4'
    },
    {
        id: 'f053', dept: '인성부', name: '학생 생활지도 상담 기록부',
        type: 'hwp', size: '약 28KB', desc: '학생 개별 상담 및 생활지도 기록 서식',
        source: '경상남도교육청',
        searchUrl: 'https://www.gne.go.kr/search/search.do?query=%EC%83%9D%ED%99%9C%EC%A7%80%EB%8F%84+%EC%83%81%EB%8B%B4+%EA%B8%B0%EB%A1%9D'
    },
    {
        id: 'f054', dept: '인성부', name: '학교폭력예방 교육 실적 보고서',
        type: 'hwp', size: '약 40KB', desc: '학기별 학교폭력예방 교육 실시 결과 보고',
        source: '교육부',
        searchUrl: 'https://www.moe.go.kr/search/search.do?query=%ED%95%99%EA%B5%90%ED%8F%AD%EB%A0%A5%EC%98%88%EB%B0%A9+%EA%B5%90%EC%9C%A1+%EC%8B%A4%EC%A0%81'
    },
    {
        id: 'f055', dept: '인성부', name: '선도위원회 심의 결과 통보서',
        type: 'hwp', size: '약 32KB', desc: '학생 선도·징계 결과 학부모 통보 서식',
        source: '국가법령정보센터',
        url: 'https://www.law.go.kr/LSW/flDownload.do?flSeq=116888502'
    },
    {
        id: 'f056', dept: '인성부', name: '학부모 상담 신청서',
        type: 'hwp', size: '약 22KB', desc: '학부모-교사 상담 신청 및 기록 서식',
        source: '에듀넷',
        searchUrl: 'https://www.edunet.net/nedu/search/resultList.do?menu_id=82&searchText=%ED%95%99%EB%B6%80%EB%AA%A8+%EC%83%81%EB%8B%B4+%EC%8B%A0%EC%B2%AD'
    },

    // ── 정보부 ──────────────────────────────────────────────────────────
    {
        id: 'f008', dept: '정보부', name: '개인정보 처리방침 (학교용)',
        type: 'hwp', size: '약 50KB', desc: '학교 홈페이지 게시용 개인정보 처리방침 표준안',
        source: '교육부·한국교육학술정보원(KERIS)',
        url: 'https://www.riss.kr/search/Search.do?queryText=%EA%B0%9C%EC%9D%B8%EC%A0%95%EB%B3%B4+%EC%B2%98%EB%A6%AC%EB%B0%A9%EC%B9%A8+%ED%95%99%EA%B5%90'
    },
    {
        id: 'f061', dept: '정보부', name: '개인정보 수집·이용 동의서',
        type: 'hwp', size: '약 28KB', desc: '학생·학부모 개인정보 수집 동의 서식',
        source: '개인정보보호위원회',
        url: 'https://www.pipc.go.kr/np/cop/bbs/selectBoardList.do?bbsId=BS074&mCode=D010030000'
    },
    {
        id: 'f062', dept: '정보부', name: '정보보안 취약점 점검표',
        type: 'hwp', size: '약 40KB', desc: '학교 정보시스템 보안 점검 체크리스트',
        source: '경상남도교육청',
        searchUrl: 'https://www.gne.go.kr/search/search.do?query=%EC%A0%95%EB%B3%B4%EB%B3%B4%EC%95%88+%EC%A0%90%EA%B2%80%ED%91%9C'
    },
    {
        id: 'f063', dept: '정보부', name: '정보화기기 관리 대장',
        type: 'hwp', size: '약 32KB', desc: '컴퓨터·태블릿 등 정보화기기 현황 관리',
        source: '경상남도교육청',
        searchUrl: 'https://www.gne.go.kr/search/search.do?query=%EC%A0%95%EB%B3%B4%ED%99%94%EA%B8%B0%EA%B8%B0+%EA%B4%80%EB%A6%AC'
    },
    {
        id: 'f064', dept: '정보부', name: 'CCTV 운영·관리 규정',
        type: 'hwp', size: '약 45KB', desc: '학교 CCTV 설치·운영·열람 관련 규정',
        source: '개인정보보호위원회',
        url: 'https://www.pipc.go.kr/np/cop/bbs/selectBoardList.do?bbsId=BS074&mCode=D010030000'
    },
    {
        id: 'f065', dept: '정보부', name: '정보통신 윤리교육 실적표',
        type: 'hwp', size: '약 30KB', desc: '학기별 사이버폭력 예방 등 정보윤리 교육 실적',
        source: '경상남도교육청',
        searchUrl: 'https://www.gne.go.kr/search/search.do?query=%EC%A0%95%EB%B3%B4%ED%86%B5%EC%8B%A0+%EC%9C%A4%EB%A6%AC%EA%B5%90%EC%9C%A1'
    },

    // ── 과학영재수학환경부 ─────────────────────────────────────────
    {
        id: 'f071', dept: '과학영재수학환경부', name: '과학실 안전점검표',
        type: 'hwp', size: '약 35KB', desc: '실험실 안전관리 자체점검 체크리스트',
        source: '한국과학창의재단',
        url: 'https://www.kofac.re.kr/brd/board/775/L/menu/243?brdType=R&thisPage=1'
    },
    {
        id: 'f072', dept: '과학영재수학환경부', name: '영재학급 운영 계획서',
        type: 'hwp', size: '약 55KB', desc: '교내 영재학급 편성·운영 기본 계획',
        source: '경상남도교육청',
        searchUrl: 'https://www.gne.go.kr/search/search.do?query=%EC%98%81%EC%9E%AC%ED%95%99%EA%B8%89+%EC%9A%B4%EC%98%81+%EA%B3%84%ED%9A%8D'
    },
    {
        id: 'f073', dept: '과학영재수학환경부', name: '영재 선발 평가 결과 보고서',
        type: 'hwp', size: '약 45KB', desc: '영재학급 학생 선발 결과 보고 서식',
        source: '경상남도교육청',
        searchUrl: 'https://www.gne.go.kr/search/search.do?query=%EC%98%81%EC%9E%AC+%EC%84%A0%EB%B0%9C+%ED%8F%89%EA%B0%80'
    },
    {
        id: 'f074', dept: '과학영재수학환경부', name: '현장체험학습 안전계획서',
        type: 'hwp', size: '약 55KB', desc: '현장체험학습 안전 사전 점검 계획 서식',
        source: '경상남도교육청',
        searchUrl: 'https://www.gne.go.kr/search/search.do?query=%ED%98%84%EC%9E%A5%EC%B2%B4%ED%97%98%ED%95%99%EC%8A%B5+%EC%95%88%EC%A0%84%EA%B3%84%ED%9A%8D'
    },
    {
        id: 'f075', dept: '과학영재수학환경부', name: '환경교육 운영 계획서',
        type: 'hwp', size: '약 40KB', desc: '환경교육 연간 운영 계획 및 실적 서식',
        source: '환경부·환경교육포털',
        url: 'https://www.keep.go.kr/portal/main.do'
    },
    {
        id: 'f076', dept: '과학영재수학환경부', name: '과학탐구대회 운영 계획서',
        type: 'hwp', size: '약 40KB', desc: '교내 과학탐구대회 운영 및 결과 서식',
        source: '경상남도교육청',
        searchUrl: 'https://www.gne.go.kr/search/search.do?query=%EA%B3%BC%ED%95%99%ED%83%90%EA%B5%AC%EB%8C%80%ED%9A%8C'
    },
    {
        id: 'f077', dept: '과학영재수학환경부', name: '수학·과학 경시대회 참가 신청서',
        type: 'hwp', size: '약 28KB', desc: '각종 수학·과학 대회 학교 대표 선발 서식',
        source: '경상남도교육청',
        searchUrl: 'https://www.gne.go.kr/search/search.do?query=%EA%B2%BD%EC%8B%9C%EB%8C%80%ED%9A%8C+%EC%8B%A0%EC%B2%AD%EC%84%9C'
    },

    // ── 체육&안전부 ──────────────────────────────────────────────────
    {
        id: 'f009', dept: '체육&안전부', name: '재난 대피 훈련 결과보고서',
        type: 'hwp', size: '약 32KB', desc: '재난 대피 훈련 실시 결과 보고 서식',
        source: '경상남도교육청',
        searchUrl: 'https://www.gne.go.kr/search/search.do?query=%EC%9E%AC%EB%82%9C+%EB%8C%80%ED%94%BC+%ED%9B%88%EB%A0%A8+%EA%B2%B0%EA%B3%BC%EB%B3%B4%EA%B3%A0'
    },
    {
        id: 'f081', dept: '체육&안전부', name: '학교스포츠클럽 운영 계획서',
        type: 'hwp', size: '약 45KB', desc: '스포츠클럽 종목·일정·지도교사 운영 계획',
        source: '교육부',
        searchUrl: 'https://www.moe.go.kr/search/search.do?query=%ED%95%99%EA%B5%90%EC%8A%A4%ED%8F%AC%EC%B8%A0%ED%81%B4%EB%9F%BD+%EC%84%9C%EC%8B%9D'
    },
    {
        id: 'f082', dept: '체육&안전부', name: '학교 안전사고 보고서',
        type: 'hwp', size: '약 35KB', desc: '교내 안전사고 발생 시 즉시 보고 서식',
        source: '학교안전공제중앙회',
        url: 'https://www.ssif.or.kr/main.do'
    },
    {
        id: 'f083', dept: '체육&안전부', name: '체육행사 운영 계획서',
        type: 'hwp', size: '약 48KB', desc: '체육대회·체육행사 운영 기본 계획 서식',
        source: '경상남도교육청',
        searchUrl: 'https://www.gne.go.kr/search/search.do?query=%EC%B2%B4%EC%9C%A1%ED%96%89%EC%82%AC+%EC%9A%B4%EC%98%81+%EA%B3%84%ED%9A%8D'
    },
    {
        id: 'f084', dept: '체육&안전부', name: '안전교육 연간 계획서',
        type: 'hwp', size: '약 42KB', desc: '7대 안전교육 연간 교육 계획 및 실적 서식',
        source: '교육부·학교안전정보센터',
        url: 'https://www.schoolsafe.kr/src/main/main.do'
    },
    {
        id: 'f085', dept: '체육&안전부', name: '학교 시설 안전점검표',
        type: 'hwp', size: '약 40KB', desc: '학교 건축물·시설 정기 안전점검 체크리스트',
        source: '교육부',
        searchUrl: 'https://www.moe.go.kr/search/search.do?query=%ED%95%99%EA%B5%90+%EC%8B%9C%EC%84%A4+%EC%95%88%EC%A0%84%EC%A0%90%EA%B2%80'
    },
    {
        id: 'f086', dept: '체육&안전부', name: '체육복·체육용품 수급 신청서',
        type: 'hwp', size: '약 25KB', desc: '체육복·용품·기자재 구매 신청 서식',
        source: '경상남도교육청',
        searchUrl: 'https://www.gne.go.kr/search/search.do?query=%EC%B2%B4%EC%9C%A1%EC%9A%A9%ED%92%88+%EC%88%98%EA%B8%89'
    },
    */
];
