// ============================================================
// Gemini AI API 연동 모듈
// ============================================================

// 후보 모델 목록 (v1beta/v1 둘 다 시도)
const GEMINI_MODELS = [
    { name: 'gemini-2.5-flash-preview-04-17', ver: 'v1beta' },
    { name: 'gemini-2.5-pro-exp-03-25',       ver: 'v1beta' },
    { name: 'gemini-2.5-flash',               ver: 'v1beta' },
    { name: 'gemini-2.5-pro',                 ver: 'v1beta' },
    { name: 'gemini-2.0-flash',               ver: 'v1beta' },
    { name: 'gemini-2.0-flash-lite',          ver: 'v1beta' },
    { name: 'gemini-1.5-flash',               ver: 'v1beta' },
    { name: 'gemini-1.5-flash',               ver: 'v1'     },
    { name: 'gemini-1.5-pro',                 ver: 'v1beta' },
    { name: 'gemini-1.5-pro',                 ver: 'v1'     },
    { name: 'gemini-2.0-flash',               ver: 'v1'     },
];
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/';

// 현재 성공한 모델 캐시
let _workingModel = null;

// ============================================================
// ListModels API로 실제 사용 가능한 모델 조회
// ============================================================
async function fetchAvailableModels(apiKey) {
    const results = { v1beta: [], v1: [] };
    for (const ver of ['v1beta', 'v1']) {
        try {
            const res = await fetch(
                `${GEMINI_BASE}${ver}/models?key=${apiKey}&pageSize=50`
            );
            if (!res.ok) continue;
            const data = await res.json();
            const names = (data.models || [])
                .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
                .map(m => m.name.replace('models/', ''));
            results[ver] = names;
        } catch(e) { /* 무시 */ }
    }
    return results;
}

// ============================================================
// 공유 API 키 (관리자 사전 설정 – 모든 사용자 공통 사용)
// ============================================================
const SHARED_API_KEY = 'AIzaSyBmYP-FW91jccA6coJ7I0gxQGmCi15XCdo';

// API 키 저장/불러오기
// ※ localStorage에 저장된 키가 있으면 우선 사용하고,
//   없으면 관리자가 사전 설정한 SHARED_API_KEY를 반환합니다.
function saveApiKey(key) {
    localStorage.setItem('gemini_api_key', key.trim());
}
function getApiKey() {
    return localStorage.getItem('gemini_api_key') || SHARED_API_KEY;
}
function clearApiKey() {
    localStorage.removeItem('gemini_api_key');
    // clearApiKey 호출 후에도 SHARED_API_KEY가 fallback으로 동작합니다.
}

// ============================================================
// 단일 모델 호출 (내부용)
// ============================================================
async function _callModel(modelName, apiVer, systemPrompt, userQuestion, apiKey) {
    const url = `${GEMINI_BASE}${apiVer}/models/${modelName}:generateContent?key=${apiKey}`;
    const payload = {
        contents: [
            {
                role: 'user',
                parts: [{ text: systemPrompt + '\n\n[사용자 질문]\n' + userQuestion }]
            }
        ],
        generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 65536,  // 최대값 (gemini-2.5 기준 65536, 이전 모델은 자동 조정)
            topP: 0.8
        },
        safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
        ]
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        let errBody = {};
        let rawText = '';
        try {
            rawText = await response.text();
            errBody = JSON.parse(rawText);
        } catch(e) {}
        const errMsg = errBody?.error?.message || rawText || '(응답 없음)';
        const status = response.status;

        // 상태코드 + 서버 원문을 항상 포함
        const detail = `[HTTP ${status}] ${errMsg}`;

        if (status === 429) throw new Error('QUOTA_EXCEEDED');
        if (status === 403) throw new Error('PERMISSION_DENIED:' + detail);
        if (status === 400) {
            if (errMsg.toLowerCase().includes('api key not valid') ||
                errMsg.toLowerCase().includes('invalid api key')) {
                throw new Error('INVALID_KEY');
            }
            throw new Error('BAD_REQUEST:' + detail);
        }
        if (status === 404) throw new Error('MODEL_NOT_FOUND:' + detail);
        throw new Error('API_ERROR:' + detail);
    }

    const data = await response.json();
    const candidate = data?.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text;
    if (!text) throw new Error('EMPTY_RESPONSE');

    // 답변이 토큰 한도로 잘렸는지 확인 후 안내 문구 추가
    const finishReason = candidate?.finishReason;
    if (finishReason === 'MAX_TOKENS') {
        return text + '\n\n---\n⚠️ **답변이 길어서 일부가 잘렸습니다.** 더 구체적인 질문으로 나눠서 물어보시면 완전한 답변을 받을 수 있습니다.';
    }
    return text;
}

// ============================================================
// Gemini 호출 - ListModels 자동 감지 + 폴백
// ============================================================
async function callGemini(systemPrompt, userQuestion) {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('NO_API_KEY');

    // 이전에 성공한 모델이 있으면 바로 시도
    if (_workingModel) {
        try {
            const result = await _callModel(
                _workingModel.name, _workingModel.ver, systemPrompt, userQuestion, apiKey
            );
            return result;
        } catch(err) {
            const c = err.message;
            if (c === 'INVALID_KEY' || c === 'QUOTA_EXCEEDED' || c.startsWith('PERMISSION_DENIED'))
                throw err;
            _workingModel = null; // 캐시 무효화 후 아래에서 재탐색
        }
    }

    // ── Step 1: ListModels로 실제 사용 가능 모델 조회 ──
    const available = await fetchAvailableModels(apiKey);
    const allAvailable = [
        ...available['v1beta'].map(n => ({ name: n, ver: 'v1beta' })),
        ...available['v1'].map(n => ({ name: n, ver: 'v1' }))
    ];

    // ListModels 자체가 실패하면(빈 배열) → 후보 목록으로 폴백
    const modelsToTry = allAvailable.length > 0
        ? allAvailable.filter(m =>
            m.name.includes('gemini') &&
            (m.name.includes('flash') || m.name.includes('pro'))
          ).slice(0, 8)   // 너무 많으면 상위 8개만
        : GEMINI_MODELS;

    const failLog = [];

    for (const modelObj of modelsToTry) {
        try {
            const result = await _callModel(
                modelObj.name, modelObj.ver, systemPrompt, userQuestion, apiKey
            );
            _workingModel = modelObj;
            console.log(`[Gemini] ✅ 사용 모델: ${modelObj.name} (${modelObj.ver})`);
            return result;
        } catch (err) {
            const code = err.message;
            failLog.push(`${modelObj.name}(${modelObj.ver}) → ${code}`);
            console.warn(`[Gemini] ✗ ${modelObj.name}: ${code}`);

            if (code === 'INVALID_KEY' || code === 'NO_API_KEY' ||
                code === 'QUOTA_EXCEEDED' || code.startsWith('PERMISSION_DENIED')) {
                throw err;
            }
        }
    }

    // 모든 모델 실패
    // ListModels 결과도 함께 표시
    const availableNames = allAvailable.map(m => `${m.name}(${m.ver})`).join(', ') || '(조회 실패)';
    const diagMsg =
        'ALL_MODELS_FAILED\n' +
        '━ ListModels 조회 결과 ━\n' + availableNames + '\n\n' +
        '━ 시도한 모델 결과 ━\n' + (failLog.join('\n') || '(없음)');
    throw new Error(diagMsg);
}

// ============================================================
// 질문 요약 생성 (확인 화면용)
// ============================================================
async function generateSummary(dept, question) {
    if (!getApiKey()) return generateLocalSummary(dept, question);
    const prompt = `다음 질문을 2~3줄로 간결하게 요약해주세요. 부서명과 핵심 키워드를 포함하세요. 한국어로만 답하세요.\n부서: ${dept}\n질문: ${question}\n요약:`;
    try {
        return await callGemini('', prompt);
    } catch(e) {
        return generateLocalSummary(dept, question);
    }
}

// API 키 없을 때 로컬 요약 생성
function generateLocalSummary(dept, question) {
    const trimmed = question.length > 80 ? question.slice(0, 80) + '...' : question;
    return `[${dept}] ${trimmed}`;
}

// 키워드 추출 (로컬)
// ── 유사어 사전 (핵심어 → 관련어 배열) ──────────────────────
const SYNONYM_MAP = {
    '전입': ['전입생','전학','이전학교','전학생','입학','편입','전학절차','전입학'],
    '전학': ['전학생','전입','전입생','이전학교','편입','전출','학적변동'],
    '전출': ['전출생','전학','전입','학적변동','이탈','타학교'],
    '학폭': ['학교폭력','폭력','괴롭힘','학교폭력대책','심의위원회','피해학생','가해학생'],
    '학교폭력': ['학폭','폭력','괴롭힘','심의위','피해','가해','학교폭력대책심의'],
    '출결': ['결석','조퇴','지각','출석','출결관리','무단결석','병결','인정결석'],
    '결석': ['출결','무단결석','병결','인정결석','조퇴','지각'],
    '생활기록부': ['학생부','생기부','학교생활기록부','기록부','학적','학생기록'],
    '학생부': ['생활기록부','생기부','학교생활기록부','학적'],
    '수행평가': ['수행','평가','수행평가계획','성적','성취기준','수행평가기준'],
    '성적': ['성적처리','성적산출','수행평가','지필평가','성취도','점수'],
    '교원': ['교사','교직원','교감','교장','선생님','담임'],
    '복무': ['복무규정','근무','휴가','병가','출장','복무관리','연가'],
    '안전': ['안전교육','안전점검','재난','위기','사고','안전관리'],
    '체험학습': ['현장체험','현장학습','수학여행','수련','인정결석','체험'],
    '입학': ['신입생','입학식','입학절차','전입','편입'],
    '졸업': ['졸업식','졸업요건','졸업처리','수료','학년'],
    '예산': ['예산편성','예산집행','학교회계','세출','세입','재정'],
    '공문': ['공문서','공식문서','문서','협조','회신','통보'],
    '연수': ['교원연수','직무연수','자율연수','연수계획','연수신청'],
    '장학': ['장학금','장학지도','컨설팅','장학관','수업장학'],
};

function extractKeywords(dept, question) {
    const stopWords = new Set(['이','가','을','를','은','는','의','에','에서','에게','로','으로','와','과','도','만','까지','부터','어떻게','무엇','언제','누가','왜','하는','하면','할','해야','해주','알려주','주세요','입니다','합니다','있나요','있을','경우','위해','대해','관련']);
    const words = question.split(/[\s,?.!·\-]+/).filter(w => w.length >= 2 && !stopWords.has(w));
    const deptKey = dept.replace(/[&]/g, '').replace(/부$/, '');

    // 유사어 확장
    const expanded = new Set([deptKey, ...words]);
    words.forEach(w => {
        (SYNONYM_MAP[w] || []).forEach(syn => expanded.add(syn));
    });
    return [...expanded].slice(0, 15); // 최대 15개 (유사어 포함이라 넉넉하게)
}
