// ============================================================
// AFTER – Assistant For Teachers' Educational Requirements
// 메인 앱 v3.0 (인증 기반)
// ============================================================

// ── API URL 헬퍼: 배포/미리보기 환경 모두에서 tables/ 경로를 올바르게 처리 ──
// ══════════════════════════════════════════════════════════════
// ★ API URL 생성 – GenSpark 플랫폼 전용
// ══════════════════════════════════════════════════════════════
function apiUrl(path) {
    const origin = window.location.origin;
    const pathname = window.location.pathname;
    const dir = pathname.endsWith('/') ? pathname : pathname.replace(/\/[^/]*$/, '/');
    return origin + dir + path;
}

// ══════════════════════════════════════════════════════════════
// ★ 전역 메모리 캐시 + localStorage 퍼시스트 캐시 – DB 재로드 최소화
// ══════════════════════════════════════════════════════════════
const _dbCache = {
    base_forms:  null,   // 전체 base_forms 배열 (메모리)
    user_forms:  null,   // 전체 user_forms 배열 (메모리)
    _ts:         {},     // 테이블별 캐시 타임스탬프
    TTL:         2 * 60 * 1000,   // ★ 메모리 캐시 2분 TTL (200개 제한 오해 방지)
    PERSIST_TTL: 2 * 60 * 1000,  // ★ localStorage 캐시 2분 TTL
};

// ── localStorage 퍼시스트 캐시 (자료실 즉시 표시용) ──
// ★ 캐시 키에 hostname을 포함 → 미리보기/배포 환경 중복 방지
function _cacheKey(tableName) {
    const host = (window.location.hostname || 'local').replace(/\./g,'_').slice(0,20);
    return `after_cache_${tableName}_${host}`;
}
function _savePersistCache(tableName, rows) {
    try {
        // ★ file_data(Base64) 제외하고 저장 – 수백 건 × 수백KB = localStorage 5MB 초과 방지
        // 다운로드 시에는 상세 API(/tables/{id})에서 file_data를 직접 가져오므로 문제없음
        const slim = rows.map(r => {
            if (!r.file_data) return r;
            const { file_data, ...rest } = r;
            return rest;
        });
        const payload = JSON.stringify({ ts: Date.now(), rows: slim });
        localStorage.setItem(_cacheKey(tableName), payload);
    } catch(e) {
        // 저장 실패 시 기존 캐시 키라도 지워서 다음 번에 새로 로드하도록
        try { localStorage.removeItem(_cacheKey(tableName)); } catch(_) {}
    }
}
function _loadPersistCache(tableName) {
    try {
        const raw = localStorage.getItem(_cacheKey(tableName));
        if (!raw) return null;
        const { ts, rows } = JSON.parse(raw);
        if (Date.now() - ts > _dbCache.PERSIST_TTL) return null;
        return rows;
    } catch(e) { return null; }
}

// 캐시 무효화 (업로드/삭제 후 호출)
function invalidateDbCache(tableName) {
    if (tableName) {
        _dbCache[tableName] = null;
        delete _dbCache._ts[tableName];
        try { localStorage.removeItem(_cacheKey(tableName)); } catch(e) {}
    } else {
        _dbCache.base_forms = null;
        _dbCache.user_forms = null;
        _dbCache._ts = {};
        try {
            localStorage.removeItem(_cacheKey('base_forms'));
            localStorage.removeItem(_cacheKey('user_forms'));
            // 구 키 제거 (호환성)
            localStorage.removeItem('after_cache_base_forms');
            localStorage.removeItem('after_cache_user_forms');
        } catch(e) {}
    }
}

// ── 캐시 강제 초기화 v6: 항상 실행 (DB 초기화 배포 대응) ─────────────────────────
// 미리보기/배포 환경 모두 로드 시마다 localStorage 캐시 삭제 → DB에서 최신 로드
// ★ 자료실 데이터 삭제 후 캐시가 남아 표시되는 문제 완전 차단
// ★ v6: form_knowledge, _formsCounts 캐시도 함께 삭제 + 모든 after_ 키 전체 스캔
(function _clearAllFormsCache() {
    try {
        const host = (window.location.hostname || 'local').replace(/\./g,'_').slice(0,20);
        // 1) 알려진 테이블 캐시 삭제
        ['base_forms','user_forms','form_knowledge'].forEach(t => {
            localStorage.removeItem(`after_cache_${t}_${host}`);
            localStorage.removeItem(`after_cache_${t}`);
        });
        // 2) 버전·카운트 플래그 삭제
        localStorage.removeItem('after_cache_version');
        localStorage.removeItem('after_forms_counts');
        localStorage.removeItem(`after_forms_counts_${host}`);
        // 3) after_ 로 시작하는 모든 캐시 키 전체 스캔 삭제 (혹시 모를 잔류 캐시 완전 제거)
        const keysToDelete = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && (k.startsWith('after_cache_') || k === 'after_forms_counts')) {
                keysToDelete.push(k);
            }
        }
        keysToDelete.forEach(k => localStorage.removeItem(k));
        console.log(`[AFTER] 자료실 캐시 강제 초기화 v6 완료 (삭제: ${keysToDelete.length}개)`);
    } catch(e) {}
})();

// ── 페이지네이션 전체 로드 (메모리캐시 → localStorage캐시 → 네트워크 순) ──
// onProgress(loaded, total) : 진행률 콜백 (선택적)
async function fetchAllPages(tableName, forceRefresh = false, onProgress = null) {
    const now = Date.now();
    const cached = _dbCache[tableName];
    const ts     = _dbCache._ts[tableName] || 0;

    // 1) 메모리 캐시 유효 시 즉시 반환
    if (!forceRefresh && cached && (now - ts) < _dbCache.TTL) {
        if (onProgress) onProgress(cached.length, cached.length); // 100% 즉시
        return cached;
    }

    // 2) localStorage 캐시 확인 (메모리 없을 때 즉시 반환 후 백그라운드 갱신은 호출자가 담당)
    if (!forceRefresh && !cached) {
        const persisted = _loadPersistCache(tableName);
        if (persisted) {
            // 메모리 캐시에도 올려두기
            _dbCache[tableName] = persisted;
            _dbCache._ts[tableName] = now;
            console.log(`[Cache] ${tableName} localStorage에서 ${persisted.length}개 복원`);
            if (onProgress) onProgress(persisted.length, persisted.length); // 100% 즉시
            // 백그라운드로 최신 데이터 갱신 (UI 응답성 유지)
            _refreshCacheInBackground(tableName);
            return persisted;
        }
    }

    // 3) 네트워크 로드 (순차 방식 – 진행률 콜백 지원)
    // ★ GenSpark Tables API는 한 번에 최대 200개까지만 반환함
    //    → PAGE_SIZE를 200으로 설정하고, total 기반으로 페이지 수 계산
    //    → chunk.length < PAGE_SIZE로 break하면 200개에서 멈추는 버그 발생!
    //    → total 기반으로만 종료 조건 판단
    const PAGE_SIZE = 200;
    let allRows = [];
    let total   = null;

    try {
        const firstRes = await fetch(apiUrl(`tables/${tableName}?page=1&limit=${PAGE_SIZE}`));
        if (!firstRes.ok) throw new Error(`HTTP ${firstRes.status}`);
        const firstData = await firstRes.json();
        total   = firstData.total || 0;
        allRows = firstData.data  || [];
        console.log(`[AFTER] fetchAllPages(${tableName}) 1페이지: ${allRows.length}개 / 전체 ${total}개`);

        if (onProgress) onProgress(allRows.length, total);

        if (allRows.length < total) {
            // ★ total 기반으로 필요한 페이지 수 계산 (chunk.length 기반 break 제거)
            const totalPages = Math.ceil(total / PAGE_SIZE);
            console.log(`[AFTER] fetchAllPages(${tableName}) 총 ${totalPages}페이지 로드 시작...`);
            for (let p = 2; p <= totalPages; p++) {
                const res  = await fetch(apiUrl(`tables/${tableName}?page=${p}&limit=${PAGE_SIZE}`));
                if (!res.ok) {
                    console.warn(`[AFTER] fetchAllPages(${tableName}) 페이지 ${p} 오류: HTTP ${res.status}`);
                    break;
                }
                const data = await res.json();
                const chunk = data.data || [];
                allRows = allRows.concat(chunk);
                if (onProgress) onProgress(allRows.length, total);
                console.log(`[AFTER] fetchAllPages(${tableName}) ${p}페이지: +${chunk.length}개 누계 ${allRows.length}개`);
                if (chunk.length === 0) break; // 빈 페이지면 종료
            }
        }
        console.log(`[AFTER] fetchAllPages(${tableName}) 완료: 총 ${allRows.length}개 (서버 total: ${total})`);
    } catch(e) {
        console.warn(`[AFTER] fetchAllPages(${tableName}) 오류:`, e.message);
        return _dbCache[tableName] || _loadPersistCache(tableName) || [];
    }

    // 캐시 갱신 (메모리 + localStorage)
    _dbCache[tableName] = allRows;
    _dbCache._ts[tableName] = Date.now();
    _savePersistCache(tableName, allRows);
    console.log(`[Cache] ${tableName} ${allRows.length}개 캐시됨 (메모리+로컬)`);
    return allRows;
}

// 백그라운드 캐시 갱신 (localStorage 히트 이후)
async function _refreshCacheInBackground(tableName) {
    try {
        // ★ GenSpark API 최대 200개 제한에 맞춘 PAGE_SIZE
        const PAGE_SIZE = 200;
        const firstRes = await fetch(apiUrl(`tables/${tableName}?page=1&limit=${PAGE_SIZE}`));
        if (!firstRes.ok) return;
        const firstData = await firstRes.json();
        let allRows = firstData.data || [];
        const total = firstData.total || 0;
        if (allRows.length < total) {
            const totalPages = Math.ceil(total / PAGE_SIZE);
            for (let p = 2; p <= totalPages; p++) {
                const res = await fetch(apiUrl(`tables/${tableName}?page=${p}&limit=${PAGE_SIZE}`));
                if (!res.ok) break;
                const d = await res.json();
                const chunk = d.data || [];
                if (chunk.length === 0) break;
                allRows = allRows.concat(chunk);
            }
        }
        _dbCache[tableName] = allRows;
        _dbCache._ts[tableName] = Date.now();
        _savePersistCache(tableName, allRows);
        console.log(`[Cache BG] ${tableName} ${allRows.length}개 백그라운드 갱신 완료 (total:${total})`);
    } catch(e) { /* 백그라운드 갱신 실패 무시 */ }
}

const state = {
    currentPage: 'home',
    selectedDept: '',
    questionText: '',
    summaryText: '',
    userKeywords: [],          // 사용자가 직접 입력한 키워드 (최대 3개)
    history: JSON.parse(localStorage.getItem('questionHistory') || '[]'),
    currentAiAnswer: '',
    histDeptFilter: 'all',   // 히스토리 부서 필터
    histSearchQuery: '',      // 히스토리 검색어
    // 대화 히스토리 (현재 세션) - Gemini 스타일 연속 대화
    conversationHistory: [],  // { role: 'user'|'ai', text: string }
    // 현재 세션의 대화 ID (히스토리 연결용)
    currentSessionId: null,
    // 첨부 파일 상태 (질문창)
    qAttachedFile: null,       // { name, size, type, base64, mimeType }
    // 채팅창 첨부 파일 상태
    chatAttachedFile: null,    // { name, size, type, base64, mimeType }
    // 검색 모드: 'fast' = 선택 부서만, 'precise' = 전체 부서
    searchMode: localStorage.getItem('after_search_mode') || 'fast'
};

// ─── 검색 모드 전환 (빠른 검색 / 정밀 검색) ──────────────────────
function setSearchMode(mode) {
    state.searchMode = mode;
    localStorage.setItem('after_search_mode', mode);
    // 버튼 활성화 상태 업데이트
    const fastBtn    = document.getElementById('smode-fast');
    const preciseBtn = document.getElementById('smode-precise');
    const descEl     = document.getElementById('search-mode-desc');
    if (!fastBtn) return;
    if (mode === 'fast') {
        fastBtn.classList.add('active');
        preciseBtn.classList.remove('active');
        if (descEl) descEl.textContent = '선택 부서 DB만 검색 · 빠른 응답';
    } else {
        preciseBtn.classList.add('active');
        fastBtn.classList.remove('active');
        if (descEl) descEl.textContent = '전체 부서 DB 검색 · 정밀한 응답';
    }
}

// 페이지 로드 시 저장된 모드는 initApp에서 복원됩니다.

// ============================================================
// 초기화
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        const splash = document.getElementById('splash-screen');
        splash.style.opacity = '0';
        setTimeout(() => {
            splash.classList.add('hidden');
            document.getElementById('app').classList.remove('hidden');
            initApp();
        }, 500);
    }, 2200);
});

async function initApp() {
    // ── 공유 API 키 사전 적용 (페이지 로드 즉시 – 로그인 전에도 동작) ──
    if (!localStorage.getItem('gemini_api_key') && typeof SHARED_API_KEY !== 'undefined') {
        localStorage.setItem('gemini_api_key', SHARED_API_KEY);
    }

    // ── 메모리 캐시만 초기화 (localStorage는 유지 – TTL로 자동 만료)
    // ★ 매 페이지 로드마다 localStorage까지 지우면 항상 전체를 다시 불러오는 비효율 발생
    // ★ 구버전 캐시 제거는 _clearLegacyCache() IIFE에서 처리 (버전 키 기반)
    _dbCache.base_forms = null;
    _dbCache.user_forms = null;
    _dbCache._ts = {};
    _formsCounts = null;
    window._baseFormsCache = null;
    window._userFormsCache = null;

    initAuth();                  // 인증 모듈 초기화 (세션 복원 + 공유 API 키 로드)
    initAuthEvents();            // 인증 이벤트 바인딩
    bindEvents();
    initHistDropdown();          // 대화 이력 드롭다운 초기화
    initUploadModal();           // 서식 업로드 모달 이벤트 바인딩
    updateAiStatusBadge();
    renderRecentQuestions();
    setSearchMode(state.searchMode); // 검색 모드 버튼 초기 상태 복원
    await seedAdminIfEmpty();        // 관리자 계정 자동 복구 (DB 재구축 후에도 보장)
    await seedApiConfigIfEmpty();    // Gemini API 키 자동 복구 (Rebuild DB 후에도 유지)
    // ★ GitHub Token DB에서 로드 (localStorage에 없으면 DB에서 가져옴)
    if (typeof loadGithubTokenFromDb === 'function') {
        loadGithubTokenFromDb(); // 비동기 – UI 블로킹 없이 백그라운드 로드
    }
    // ★ seedBaseFormsIfEmpty 비활성화 – 자료실은 팀이 직접 업로드
    // await seedBaseFormsIfEmpty();
    loadFormsPageCounts();    // 자료실: 카운트만 먼저 (지연 로딩)
    setTimeout(() => runDbMaintenance(), 3000); // DB 유지보수 (3초 지연 – 초기 로딩 후 백그라운드 실행)
    renderHistoryPage();
    checkApiWarning();
    checkExpiryWarning();
    loadNoticeTicker();      // 홈 화면 공지 티커
    loadBoardPinnedNotices(); // 게시판 고정 공지
    initPresence();          // 접속자 presence 초기화
}

// ============================================================
// 공지사항 티커 (홈 화면 – 최근 2개, JS 직접 픽셀 이동, seamless 무한 루프)
// ============================================================
let _tickerRAF = null; // requestAnimationFrame ID

async function loadNoticeTicker() {
    const wrap  = document.getElementById('notice-ticker-wrap');
    const inner = document.getElementById('notice-ticker-inner');
    if (!wrap || !inner) return;

    // 기존 애니메이션 중단
    if (_tickerRAF) { cancelAnimationFrame(_tickerRAF); _tickerRAF = null; }
    inner.innerHTML = '';

    try {
        const res = await fetch(apiUrl('tables/notices?limit=50'));
        if (!res.ok) { wrap.style.display = 'none'; return; }
        const data = await res.json();

        const active = (data.data || [])
            .filter(n => String(n.is_active) !== 'false')
            .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || (b.created_at || 0) - (a.created_at || 0))
            .slice(0, 2);

        if (active.length === 0) { wrap.style.display = 'none'; return; }

        // 각 공지 HTML 생성
        const makeItem = (n) =>
            `<span class="notice-ticker-item">` +
            `<i class="fas fa-bullhorn" style="font-size:11px;margin-right:6px;color:#6366f1;opacity:.8;"></i>` +
            `${escHtml(n.title)}` +
            (n.content ? `<span class="notice-ticker-sub"> – ${escHtml((n.content||'').slice(0,80))}${(n.content||'').length > 80 ? '…' : ''}</span>` : '') +
            `</span><span class="notice-ticker-sep">　◆　</span>`;

        // 콘텐츠를 4벌 복제 → seamless 루프 (짧은 텍스트도 끊김 없도록)
        const oneSet = active.map(makeItem).join('');
        inner.innerHTML = oneSet + oneSet + oneSet + oneSet; // 4벌

        wrap.style.display = 'flex';

        // 레이아웃 계산을 위해 두 프레임 대기
        requestAnimationFrame(() => requestAnimationFrame(() => {
            const track = wrap.querySelector('.notice-ticker-track');
            if (!track) return;

            const trackW  = track.offsetWidth;    // 보이는 창 너비
            const totalW  = inner.scrollWidth;    // 4벌 전체 너비
            const oneSetW = totalW / 4;           // 한 벌 너비 (루프 단위)

            if (oneSetW <= 0) { wrap.style.display = 'none'; return; }

            // 시작 위치: 트랙 오른쪽 끝에서 출발 (화면 바깥 오른쪽)
            let pos = trackW;

            // 속도: 픽셀/초 – 느리게 고정 (읽기 편한 속도)
            const totalChars = active.reduce((s, n) => s + (n.title||'').length + Math.min((n.content||'').length, 80), 0);
            const speed = Math.max(50, Math.min(75, 180 - totalChars * 0.6)); // 50~75 px/s

            let lastTime = null;
            let paused = false;

            // 이전에 등록된 이벤트 중복 방지: inner 교체 시 새로 바인딩
            const onEnter = () => { paused = true; };
            const onLeave = () => { paused = false; };
            inner.addEventListener('mouseenter', onEnter);
            inner.addEventListener('mouseleave',  onLeave);
            inner.addEventListener('touchstart',  () => { paused = !paused; }, { passive: true });

            function step(ts) {
                if (lastTime === null) lastTime = ts;
                const dt = Math.min((ts - lastTime) / 1000, 0.1); // 최대 0.1초 (탭 숨김 후 재개 시 점프 방지)
                lastTime = ts;

                if (!paused) {
                    pos -= speed * dt;
                    // seamless: pos가 -(한 벌 너비)에 도달하면 한 벌 앞으로 리셋
                    if (pos <= -oneSetW) pos += oneSetW;
                }
                inner.style.left = pos + 'px';
                _tickerRAF = requestAnimationFrame(step);
            }
            _tickerRAF = requestAnimationFrame(step);
        }));

    } catch(e) {
        wrap.style.display = 'none';
    }
}

// ============================================================
// 게시판 고정 공지 (게시판 최상단)
// ============================================================
async function loadBoardPinnedNotices() {
    const el = document.getElementById('board-pinned-notices');
    if (!el) return;

    try {
        const res = await fetch(apiUrl('tables/notices?limit=50'));
        if (!res.ok) { el.style.display = 'none'; return; }
        const data = await res.json();
        const active = (data.data || [])
            .filter(n => String(n.is_active) !== 'false')
            .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || (Number(b.created_at) || 0) - (Number(a.created_at) || 0));

        if (active.length === 0) { el.style.display = 'none'; return; }

        el.innerHTML = active.map(n => {
            // 날짜 포맷: timestamp(ms) 또는 문자열 모두 처리
            let dateStr = '';
            if (n.created_at_str) {
                dateStr = n.created_at_str;
            } else if (n.created_at) {
                const d = new Date(n.created_at);
                dateStr = isNaN(d.getTime()) ? '' : d.toLocaleDateString('ko-KR');
            }
            return `
            <div class="board-pinned-notice-item" onclick="this.classList.toggle('expanded')">
                <div class="bpn-header">
                    <span class="bpn-badge"><i class="fas fa-thumbtack"></i> 공지</span>
                    <span class="bpn-title">${escHtml(n.title || '')}</span>
                    <span class="bpn-date">${escHtml(dateStr)}</span>
                    <i class="fas fa-chevron-down bpn-arrow"></i>
                </div>
                <div class="bpn-body">${escHtml(n.content || '').replace(/\n/g,'<br>')}</div>
            </div>`;
        }).join('');
        el.style.display = 'block';
    } catch(e) {
        console.warn('[AFTER] loadBoardPinnedNotices 오류:', e);
        el.style.display = 'none';
    }
}

// ============================================================
// 이용 만료일 경고 배너 표시
// ============================================================
function checkExpiryWarning() {
    const bannerContainer = document.getElementById('expiry-warning-container');
    if (!bannerContainer) return;

    // 관리자는 표시 안 함
    if (typeof authState !== 'undefined' && (authState.isAdmin || (authState.currentUser && authState.currentUser.user_id === typeof ADMIN_ID !== 'undefined' && ADMIN_ID))) {
        bannerContainer.innerHTML = '';
        return;
    }

    const user = typeof authState !== 'undefined' ? authState.currentUser : null;
    if (!user || String(user.approved) !== 'true') {
        bannerContainer.innerHTML = '';
        return;
    }
    // VIP는 만료 경고 표시 안 함
    if (String(user.vip) === 'true') {
        bannerContainer.innerHTML = '';
        return;
    }

    const status = typeof checkUserExpiry === 'function' ? checkUserExpiry(user) : 'no_expiry';

    if (status === 'expired') {
        const exp = user.expires_at ? new Date(user.expires_at).toLocaleDateString('ko-KR') : '알 수 없음';
        bannerContainer.innerHTML = `<div class="expiry-warning-banner expired" onclick="openProfileModal()">
            <i class="fas fa-exclamation-circle"></i>
            <div class="expiry-warning-text">
                <p class="expiry-warning-title">⛔ 이용 기간이 만료되었습니다 (${exp})</p>
                <p class="expiry-warning-desc">프로필 → "1,500P로 1개월 연장" 버튼을 눌러 이용 기간을 연장하세요.</p>
            </div>
            <i class="fas fa-chevron-right" style="font-size:12px;"></i>
        </div>`;
    } else if (status === 'expiring_soon') {
        const exp = new Date(user.expires_at);
        const daysLeft = Math.ceil((exp - new Date()) / (1000 * 60 * 60 * 24));
        bannerContainer.innerHTML = `<div class="expiry-warning-banner" onclick="openProfileModal()">
            <i class="fas fa-clock"></i>
            <div class="expiry-warning-text">
                <p class="expiry-warning-title">⚠️ 이용 기간이 ${daysLeft}일 후 만료됩니다</p>
                <p class="expiry-warning-desc">프로필에서 1,500P로 이용 기간을 미리 연장하세요.</p>
            </div>
            <i class="fas fa-chevron-right" style="font-size:12px;"></i>
        </div>`;
    } else {
        bannerContainer.innerHTML = '';
    }
}

// ============================================================
// AI 상태 표시 업데이트
// ============================================================
function updateAiStatusBadge() {
    const badge = document.getElementById('ai-status-badge');
    const text = document.getElementById('ai-status-text');
    const settingsTag = document.getElementById('settings-ai-status');
    // 좌측 사이드바 AI 상태
    const lsDot   = document.getElementById('ls-ai-dot');
    const lsLabel = document.getElementById('ls-ai-label');
    const hasKey = !!getApiKey();

    if (hasKey) {
        badge.className = 'ai-status-badge ai-on';
        text.textContent = 'AI 연결됨';
        if (settingsTag) {
            settingsTag.className = 'ai-status-tag ai-on-tag';
            settingsTag.textContent = '✅ 연결됨';
        }
        if (lsDot)   { lsDot.className = 'ls-ai-dot on'; }
        if (lsLabel) { lsLabel.textContent = 'AI 연결됨'; }
    } else {
        badge.className = 'ai-status-badge ai-off';
        text.textContent = 'AI 설정 필요';
        if (settingsTag) {
            settingsTag.className = 'ai-status-tag ai-off-tag';
            settingsTag.textContent = '❌ 연결 안 됨';
        }
        if (lsDot)   { lsDot.className = 'ls-ai-dot off'; }
        if (lsLabel) { lsLabel.textContent = 'AI 미연결'; }
    }
}

function checkApiWarning() {
    const warning = document.getElementById('api-warning');
    if (!getApiKey()) {
        warning.classList.remove('hidden');
    } else {
        warning.classList.add('hidden');
    }
}

// ============================================================
// 이벤트 바인딩
// ============================================================
function bindEvents() {
    // 하단 네비
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const page = btn.dataset.page;
            navigateTo(page);
            updateBottomNav(page);
        });
    });

    // 홈 빠른 카드
    document.querySelectorAll('.quick-card').forEach(card => {
        card.addEventListener('click', () => {
            if (!requireLogin('question')) return;
            const dept = card.dataset.dept;
            state.selectedDept = dept;
            navigateTo('question');
            updateBottomNav('question');
            setTimeout(() => {
                document.getElementById('dept-select').value = dept;
                onDeptChange(dept);
            }, 100);
        });
    });

    // 사이드 메뉴
    document.getElementById('menu-btn').addEventListener('click', openMenu);
    document.getElementById('close-menu').addEventListener('click', closeMenu);
    document.getElementById('overlay').addEventListener('click', closeMenu);
    document.querySelectorAll('.side-nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            closeMenu();
            const page = item.dataset.page;
            if (page) { navigateTo(page); updateBottomNav(page); }
        });
    });

    // 도움말
    document.getElementById('help-btn').addEventListener('click', () => {
        // 관리자 매뉴얼 버튼: 관리자에게만 표시
        const adminManualBtn = document.getElementById('help-admin-manual-btn');
        if (adminManualBtn) {
            const isAdmin = typeof authState !== 'undefined' &&
                (authState.isAdmin || (authState.currentUser && authState.currentUser.user_id === ADMIN_ID));
            adminManualBtn.style.display = isAdmin ? '' : 'none';
        }
        document.getElementById('help-modal').classList.remove('hidden');
    });
    document.getElementById('close-help').addEventListener('click', () => document.getElementById('help-modal').classList.add('hidden'));
    document.getElementById('help-overlay').addEventListener('click', () => document.getElementById('help-modal').classList.add('hidden'));

    // 부서 선택 / 질문 입력
    document.getElementById('dept-select').addEventListener('change', e => onDeptChange(e.target.value));
    document.getElementById('question-input').addEventListener('input', onQuestionInput);
    document.getElementById('submit-question').addEventListener('click', submitQuestion);

    // 키워드 입력 이벤트 (1~3번)
    [1,2,3].forEach(n => {
        const el = document.getElementById(`kw-input-${n}`);
        if (el) {
            el.addEventListener('input', updateKeywordPreview);
            el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); updateKeywordPreview(); } });
        }
    });

    // 뒤로가기
    document.getElementById('back-to-home').addEventListener('click', () => { navigateTo('home'); updateBottomNav('home'); });
    document.getElementById('back-to-question').addEventListener('click', () => navigateTo('question'));
    document.getElementById('back-to-confirm').addEventListener('click', () => navigateTo('confirm'));
    document.getElementById('back-from-forms').addEventListener('click', () => { navigateTo('home'); updateBottomNav('home'); });
    document.getElementById('back-from-history').addEventListener('click', () => { navigateTo('home'); updateBottomNav('home'); });
    document.getElementById('back-from-settings').addEventListener('click', () => { navigateTo('home'); updateBottomNav('home'); });

    // ── 히스토리 부서 탭 이벤트 ──
    document.getElementById('hist-dept-tabs').addEventListener('click', (e) => {
        const tab = e.target.closest('.hist-dept-tab');
        if (!tab) return;
        document.querySelectorAll('.hist-dept-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        state.histDeptFilter = tab.dataset.dept;
        renderHistoryPage();
    });

    // ── 히스토리 검색 이벤트 ──
    const histSearchInput = document.getElementById('hist-search-input');
    const histSearchClear = document.getElementById('hist-search-clear');
    let histSearchTimer = null;
    histSearchInput.addEventListener('input', () => {
        clearTimeout(histSearchTimer);
        const val = histSearchInput.value.trim();
        histSearchClear.classList.toggle('hidden', !val);
        histSearchTimer = setTimeout(() => {
            state.histSearchQuery = val;
            renderHistoryPage();
        }, 250);
    });
    histSearchClear.addEventListener('click', () => {
        histSearchInput.value = '';
        histSearchClear.classList.add('hidden');
        state.histSearchQuery = '';
        renderHistoryPage();
        histSearchInput.focus();
    });

    // 확인/수정
    document.getElementById('btn-correct').addEventListener('click', () => {
        navigateTo('answer');
        startAiAnswer();
    });
    document.getElementById('btn-edit').addEventListener('click', () => {
        resetConfirmScreen();
        navigateTo('question');
        showToast('✏️ 질문을 수정한 후 "AI에게 질문하기" 버튼을 눌러주세요');
    });

    // 새 질문
    document.getElementById('btn-new-q').addEventListener('click', () => {
        resetAll();
        navigateTo('question');
        updateBottomNav('question');
    });

    // 홈으로 버튼
    document.getElementById('btn-answer-home').addEventListener('click', () => {
        resetAll();
        navigateTo('home');
        updateBottomNav('home');
    });

    // 채팅 대화 입력
    const chatInput = document.getElementById('chat-input');
    if (chatInput) {
        chatInput.addEventListener('input', onChatInput);
        chatInput.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendChatMessage();
            }
        });
    }
    // 채팅 전송
    const chatSendBtn = document.getElementById('chat-send-btn');
    if (chatSendBtn) chatSendBtn.addEventListener('click', sendChatMessage);

    // 채팅 파일 첨부
    const chatFileBtn = document.getElementById('chat-file-btn');
    const chatFileInput = document.getElementById('chat-file-input');
    if (chatFileBtn) chatFileBtn.addEventListener('click', () => chatFileInput?.click());
    if (chatFileInput) chatFileInput.addEventListener('change', onChatFileSelected);

    // 채팅 파일 제거
    const chatFileRemove = document.getElementById('chat-file-remove');
    if (chatFileRemove) chatFileRemove.addEventListener('click', clearChatFile);

    // 질문창 파일 첨부
    const btnAttachQ  = document.getElementById('btn-attach-q');
    const qFileInput  = document.getElementById('q-file-input');
    if (btnAttachQ)  btnAttachQ.addEventListener('click', () => qFileInput?.click());
    if (qFileInput)  qFileInput.addEventListener('change', onQFileSelected);

    // 질문창 파일 제거
    const qFileRemove = document.getElementById('q-file-remove');
    if (qFileRemove) qFileRemove.addEventListener('click', clearQFile);

    // 인쇄/복사
    document.getElementById('btn-print').addEventListener('click', () => window.print());
    document.getElementById('btn-copy').addEventListener('click', copyAnswerText);

    // 서식 업로드 모달 열기 (로그인 필요)
    document.getElementById('btn-open-upload').addEventListener('click', () => {
        if (!requireLogin('upload')) return;
        openUploadModal();
    });

    // 피드백
    document.querySelectorAll('.feedback-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.feedback-btn').forEach(b => b.className = 'feedback-btn');
            btn.classList.add(btn.dataset.val === 'good' ? 'selected-good' : 'selected-bad');
            showToast(btn.dataset.val === 'good' ? '👍 피드백 감사합니다!' : '개선하겠습니다. 감사합니다.');
        });
    });

    // 오류 화면 버튼
    document.getElementById('btn-retry').addEventListener('click', () => {
        navigateTo('answer');
        startAiAnswer();
    });
    document.getElementById('btn-go-settings').addEventListener('click', () => {
        // AI설정 페이지는 관리자만 접근 가능
        if (typeof authState !== 'undefined' && (authState.isAdmin || (authState.currentUser && authState.currentUser.user_id === ADMIN_ID))) {
            navigateTo('settings');
            updateBottomNav('settings');
        } else {
            showToast('⚠️ AI 설정은 관리자만 변경할 수 있습니다.');
        }
    });

    // 서식 필터
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            // 필터 변경 시 검색어 초기화
            formsSearchQuery = '';
            const searchInput = document.getElementById('forms-search-input');
            if (searchInput) searchInput.value = '';
            const clearBtn = document.getElementById('forms-search-clear');
            if (clearBtn) clearBtn.classList.add('hidden');
            renderFormsPage(btn.dataset.filter);
        });
    });

    // 서식 검색
    const formsSearchInput = document.getElementById('forms-search-input');
    const formsSearchClear = document.getElementById('forms-search-clear');
    if (formsSearchInput) {
        formsSearchInput.addEventListener('input', () => {
            formsSearchQuery = formsSearchInput.value.trim();
            formsSearchClear.classList.toggle('hidden', !formsSearchQuery);
            const activeFilter = document.querySelector('.filter-btn.active')?.dataset.filter || 'all';
            renderFormsPage(activeFilter, formsSearchQuery);
        });
    }
    if (formsSearchClear) {
        formsSearchClear.addEventListener('click', () => {
            formsSearchQuery = '';
            formsSearchInput.value = '';
            formsSearchClear.classList.add('hidden');
            formsSearchInput.focus();
            const activeFilter = document.querySelector('.filter-btn.active')?.dataset.filter || 'all';
            renderFormsPage(activeFilter);
        });
    }

    // === AI 설정 화면 ===
    // 이벤트는 등록만 해두고, 실제 로직은 외부 함수에서 처리
    document.getElementById('btn-save-key').addEventListener('click', onSaveKey);
    document.getElementById('btn-test-key').addEventListener('click', onTestKey);
    document.getElementById('btn-list-models').addEventListener('click', onListModels);
    document.getElementById('btn-clear-key').addEventListener('click', onClearKey);
    document.getElementById('toggle-key-vis').addEventListener('click', onToggleKeyVis);

    // ── 게시판 이벤트 ──
    const backFromBoard = document.getElementById('back-from-board');
    if (backFromBoard) backFromBoard.addEventListener('click', () => { navigateTo('home'); updateBottomNav('home'); });
    const backFromBoardView = document.getElementById('back-from-board-view');
    if (backFromBoardView) backFromBoardView.addEventListener('click', () => navigateTo('board'));
    const backFromBoardWrite = document.getElementById('back-from-board-write');
    if (backFromBoardWrite) backFromBoardWrite.addEventListener('click', () => navigateTo('board'));
    const btnBoardCancel = document.getElementById('btn-board-cancel');
    if (btnBoardCancel) btnBoardCancel.addEventListener('click', () => navigateTo('board'));
    const btnBoardWrite = document.getElementById('btn-board-write');
    if (btnBoardWrite) btnBoardWrite.addEventListener('click', openBoardWrite);
    const btnBoardSubmit = document.getElementById('btn-board-submit');
    if (btnBoardSubmit) btnBoardSubmit.addEventListener('click', submitBoardPost);

    // 게시판 카테고리 필터
    document.querySelectorAll('.board-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.board-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            boardCurrentCat = btn.dataset.cat;
            boardCurrentPage = 1;
            renderBoardPage();
        });
    });

    // 글쓰기 페이지 카드 인터랙션 초기화
    initBoardWritePage();
}

// ============================================================
// AI 설정 화면 - 핸들러 함수들 (bindEvents 바깥에서 정의)
// ============================================================

// 저장하고 연결하기 (관리자 전용)
function onSaveKey() {
    // 관리자 모드에서만 허용 (또는 직접 저장 - 공유 저장은 관리자 패널에서)
    const inputEl = document.getElementById('api-key-input');
    const val = inputEl.value.trim();

    if (!val) {
        showSaveResult('error', '❌ API 키를 입력해주세요.');
        return;
    }
    if (!val.startsWith('AIza')) {
        showSaveResult('error', '❌ 올바른 형식이 아닙니다.\n"AIza"로 시작하는 키를 입력해주세요.');
        return;
    }

    // 로컬에 저장 (관리자는 admin panel에서 공유 저장 권장)
    saveApiKey(val);
    updateAiStatusBadge();
    checkApiWarning();
    showSaveResult('success', '✅ API 키가 로컬에 저장되었습니다!\n모든 사용자에게 공유하려면 관리자 패널 → API 키 관리에서 저장하세요.');
}

// 연결 테스트
async function onTestKey() {
    const btn = document.getElementById('btn-test-key');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 테스트 중...';
    showSaveResult('info', '⏳ AI 서버에 연결 중입니다...');

    try {
        const result = await callGemini(
            '당신은 교감 업무 도우미입니다.',
            '연결 테스트입니다. "연결 성공"이라고만 짧게 답해주세요.'
        );
        if (result) {
            showSaveResult('success', '🎉 AI 연결 성공!\n이제 홈 화면으로 돌아가서 질문을 시작하세요.');
            updateAiStatusBadge();
            checkApiWarning();
        }
    } catch (e) {
        const code = e.message || '';
        let msg = '';

        if (code === 'NO_API_KEY') {
            msg = '❌ 저장된 API 키가 없습니다.\n먼저 키를 입력하고 저장해주세요.';
        } else if (code === 'INVALID_KEY') {
            msg = '❌ API 키가 유효하지 않습니다.\nGoogle AI Studio(aistudio.google.com)에서 키를 다시 확인해주세요.';
        } else if (code === 'QUOTA_EXCEEDED') {
            msg = '⚠️ API 사용 한도를 초과했습니다.\n무료 한도: 분당 15회, 일 1,500회\n잠시 후 다시 시도하거나 내일 이용해주세요.';
        } else if (code.startsWith('PERMISSION_DENIED')) {
            const detail = code.replace('PERMISSION_DENIED:', '');
            msg = '🔒 API 키 권한 오류\n\n• Gemini API가 활성화되지 않았을 수 있습니다\n• Google AI Studio에서 키를 재발급해보세요\n\n📋 서버 응답: ' + detail;
        } else if (code.startsWith('ALL_MODELS_FAILED')) {
            // 진단 정보 그대로 표시
            msg = '🔍 연결 진단 결과\n\n' + code.replace('ALL_MODELS_FAILED\n진단 결과:\n', '') +
                  '\n\n━━━━━━━━━━━━━━━━━━\n위 내용을 캡처해서 문의해주시면 원인을 파악할 수 있습니다.';
        } else if (code.startsWith('BAD_REQUEST')) {
            const detail = code.replace('BAD_REQUEST:', '');
            msg = '⚠️ 요청 오류\n\n📋 서버 응답: ' + detail;
        } else if (code.startsWith('MODEL_NOT_FOUND')) {
            msg = '🔍 모델 오류\n\n📋 서버 응답: ' + code;
        } else {
            // 예상 못한 오류 → 원문 그대로 표시
            msg = '❌ 연결 실패\n\n📋 오류 원문:\n' + code;
        }

        showSaveResult('error', msg);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-vial"></i> 연결 테스트';
    }
}

// 사용 가능한 모델 조회
async function onListModels() {
    const btn = document.getElementById('btn-list-models');
    const apiKey = getApiKey();
    if (!apiKey) {
        showSaveResult('error', '❌ 먼저 API 키를 저장해주세요.');
        return;
    }
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 조회 중...';
    showSaveResult('info', '⏳ 사용 가능한 모델을 조회하고 있습니다...');

    try {
        const available = await fetchAvailableModels(apiKey);
        const v1betaList = available['v1beta'];
        const v1List     = available['v1'];

        if (v1betaList.length === 0 && v1List.length === 0) {
            showSaveResult('error',
                '❌ 사용 가능한 모델이 없습니다.\n\n' +
                '가능한 원인:\n' +
                '• API 키가 만료되었거나 유효하지 않음\n' +
                '• 결제 계정이 연결되지 않음\n' +
                '• Generative Language API가 비활성화됨\n\n' +
                '👉 해결: aistudio.google.com에서 새 API 키를 발급받으세요.'
            );
        } else {
            const geminiFlashPro = [...v1betaList, ...v1List]
                .filter(n => n.includes('gemini') && (n.includes('flash') || n.includes('pro')));

            let msg = '✅ 사용 가능한 Gemini 모델 목록\n\n';
            if (v1betaList.length > 0) {
                msg += '📌 v1beta 버전:\n' + v1betaList.filter(n=>n.includes('gemini')).map(n=>'  • '+n).join('\n') + '\n\n';
            }
            if (v1List.length > 0) {
                msg += '📌 v1 버전:\n' + v1List.filter(n=>n.includes('gemini')).map(n=>'  • '+n).join('\n') + '\n\n';
            }
            msg += '━━━━━━━━━━━━━━\n';
            msg += '💡 이 키로 사용할 수 있는 모델이 확인됩니다.\n"연결 테스트"를 눌러 실제 연결을 확인해보세요.';
            showSaveResult('success', msg);
        }
    } catch(e) {
        showSaveResult('error', '❌ 조회 실패: ' + e.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-list"></i> 사용 가능한 모델 조회';
    }
}

// API 키 삭제
function onClearKey() {
    clearApiKey();
    const inputEl = document.getElementById('api-key-input');
    if (inputEl) {
        inputEl.value = '';
        const supportsTextSecurity = CSS.supports('-webkit-text-security', 'disc');
        if (supportsTextSecurity) {
            inputEl.type = 'text';
            inputEl.classList.add('api-input-masked');
        } else {
            inputEl.type = 'password';
            inputEl.classList.remove('api-input-masked');
        }
    }
    const eyeBtn = document.getElementById('toggle-key-vis');
    if (eyeBtn) eyeBtn.innerHTML = '<i class="fas fa-eye"></i>';
    updateAiStatusBadge();
    checkApiWarning();
    showSaveResult('info', '🗑️ API 키가 삭제되었습니다.');
}

// 눈 아이콘 토글 (마스킹/언마스킹)
// -webkit-text-security 지원 브라우저: CSS 클래스로 제어
// Firefox 등 미지원 브라우저: input type 변경으로 폴백
function onToggleKeyVis() {
    const inputEl = document.getElementById('api-key-input');
    const eyeBtn = document.getElementById('toggle-key-vis');
    if (!inputEl || !eyeBtn) return;

    // CSS -webkit-text-security 지원 여부 확인
    const supportsTextSecurity = CSS.supports('-webkit-text-security', 'disc');

    if (supportsTextSecurity) {
        // CSS 클래스 방식 (Chrome/Edge/Safari)
        const isMasked = inputEl.classList.contains('api-input-masked');
        if (isMasked) {
            inputEl.classList.remove('api-input-masked');
            eyeBtn.innerHTML = '<i class="fas fa-eye-slash"></i>';
        } else {
            inputEl.classList.add('api-input-masked');
            eyeBtn.innerHTML = '<i class="fas fa-eye"></i>';
        }
    } else {
        // type 변경 방식 폴백 (Firefox)
        const currentVal = inputEl.value;
        if (inputEl.type === 'password') {
            inputEl.type = 'text';
            inputEl.value = currentVal;
            eyeBtn.innerHTML = '<i class="fas fa-eye-slash"></i>';
        } else {
            inputEl.type = 'password';
            inputEl.value = currentVal;
            eyeBtn.innerHTML = '<i class="fas fa-eye"></i>';
        }
    }
}

// 설정 페이지 진입 시 저장된 키 불러오기
function fillApiKeyInput() {
    const key = getApiKey();
    const inputEl = document.getElementById('api-key-input');
    const eyeBtn = document.getElementById('toggle-key-vis');

    // 결과 메시지 초기화
    hideSaveResult();

    if (inputEl) {
        inputEl.value = key || '';
        // 항상 마스킹 상태로 시작
        const supportsTextSecurity = CSS.supports('-webkit-text-security', 'disc');
        if (supportsTextSecurity) {
            // CSS 클래스 마스킹 (Chrome/Edge/Safari)
            inputEl.type = 'text';
            inputEl.classList.add('api-input-masked');
        } else {
            // type=password 폴백 (Firefox)
            inputEl.type = 'password';
            inputEl.classList.remove('api-input-masked');
        }
        if (eyeBtn) eyeBtn.innerHTML = '<i class="fas fa-eye"></i>';
    }

    updateAiStatusBadge();
}

// 인라인 결과 메시지 표시 (.hidden 충돌 해결: style.display 직접 제어)
function showSaveResult(type, message) {
    const el = document.getElementById('save-result-msg');
    if (!el) {
        alert(message);
        return;
    }
    // .hidden 클래스를 완전히 제거하고 style로 직접 표시
    el.classList.remove('hidden');
    el.className = 'save-result-msg save-result-' + type;
    el.innerHTML = message.replace(/\n/g, '<br>');
    el.style.display = 'block'; // !important 우선순위 문제를 회피하기 위해 style 속성 직접 설정
    el.style.setProperty('display', 'block', 'important');
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideSaveResult() {
    const el = document.getElementById('save-result-msg');
    if (!el) return;
    el.style.removeProperty('display');
    el.className = 'save-result-msg hidden';
    el.innerHTML = '';
}

// ============================================================
// 네비게이션
// ============================================================
function navigateTo(pageName) {
    // AI설정 페이지 – 관리자 전용 접근 제한
    if (pageName === 'settings') {
        const isAdmin = typeof authState !== 'undefined' &&
            (authState.isAdmin || (authState.currentUser && authState.currentUser.user_id === ADMIN_ID));
        if (!isAdmin) {
            if (typeof showToast === 'function') showToast('⚠️ AI 설정은 관리자만 변경할 수 있습니다.');
            return; // 페이지 전환 차단
        }
    }

    document.querySelectorAll('.page').forEach(p => {
        p.classList.add('hidden');
        p.classList.remove('active');
    });
    const target = document.getElementById(`page-${pageName}`);
    if (target) {
        target.classList.remove('hidden');
        target.classList.add('active');
        window.scrollTo(0, 0);
    }
    state.currentPage = pageName;

    if (pageName === 'settings') fillApiKeyInput();
    // 홈으로 이동 시 공지 티커·최근 질문 갱신 (다른 기기 변경사항 반영)
    if (pageName === 'home') {
        loadNoticeTicker();
        renderRecentQuestions();
    }
    // 질문 페이지로 직접 이동(네비/홈에서)하면 입력창 초기화 (히스토리는 유지)
    if (pageName === 'question') clearQuestionInput();
    // 게시판 페이지로 이동 시 목록 로드
    if (pageName === 'board') renderBoardPage();
    // 자료실 페이지로 이동 시 자료 목록 새로고침 (캐시 무효화 → 항상 최신 DB 데이터)
    if (pageName === 'forms') {
        invalidateDbCache('base_forms');
        invalidateDbCache('user_forms');
        const activeFilter = document.querySelector('.filter-btn.active')?.dataset.filter || 'all';
        renderFormsPage(activeFilter, formsSearchQuery || '');
    }
    // 히스토리 페이지로 이동 시 DB 캐시 강제 새로고침
    if (pageName === 'history') {
        _dbHistoryCache   = null;
        _dbHistoryCacheTs = 0;
        renderHistoryPage();
    }
}

// 질문 입력창만 초기화 (히스토리/answer 상태는 건드리지 않음)
function clearQuestionInput() {
    state.selectedDept = '';
    state.questionText = '';
    const deptSel = document.getElementById('dept-select');
    const qInput  = document.getElementById('question-input');
    const charCnt = document.getElementById('char-count');
    const deptInfo = document.getElementById('dept-info');
    const qCard    = document.getElementById('question-card');
    if (deptSel)  deptSel.value = '';
    if (qInput)   qInput.value = '';
    if (charCnt)  charCnt.textContent = '0 / 500자';
    if (deptInfo) deptInfo.classList.add('hidden');
    if (qCard)    { qCard.style.opacity = '0.5'; qCard.style.pointerEvents = 'none'; }
    const submitBtn = document.getElementById('submit-question');
    if (submitBtn) submitBtn.disabled = true;
    // 파일 업로드 상태도 초기화
    clearChatFile();
}

function updateBottomNav(active) {
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.page === active) btn.classList.add('active');
    });
}

// ============================================================
// 사이드 메뉴
// ============================================================
function openMenu() {
    const menu = document.getElementById('side-menu');
    menu.classList.remove('hidden');
    setTimeout(() => menu.classList.add('open'), 10);
    document.getElementById('overlay').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}
function closeMenu() {
    const menu = document.getElementById('side-menu');
    menu.classList.remove('open');
    document.getElementById('overlay').classList.add('hidden');
    document.body.style.overflow = '';
    setTimeout(() => menu.classList.add('hidden'), 300);
}

// ============================================================
// 부서 선택
// ============================================================
function onDeptChange(dept) {
    state.selectedDept = dept;
    const deptInfo = document.getElementById('dept-info');
    const questionCard = document.getElementById('question-card');

    if (dept && DEPT_INFO[dept]) {
        const info = DEPT_INFO[dept];
        document.getElementById('dept-info-icon').textContent = info.icon;
        document.getElementById('dept-info-name').textContent = dept;
        document.getElementById('dept-info-desc').textContent = info.desc;
        deptInfo.classList.remove('hidden');
        questionCard.style.opacity = '1';
        questionCard.style.pointerEvents = 'auto';
    } else {
        deptInfo.classList.add('hidden');
        questionCard.style.opacity = '0.5';
        questionCard.style.pointerEvents = 'none';
    }
    updateSubmitButton();
}

// ============================================================
// 질문 입력
// ============================================================
function onQuestionInput() {
    const textarea = document.getElementById('question-input');
    const count = document.getElementById('char-count');
    let text = textarea.value;
    if (text.length > 500) { text = text.slice(0, 500); textarea.value = text; }
    state.questionText = text;
    count.textContent = `${text.length} / 500자`;
    updateSubmitButton();
}

function updateSubmitButton() {
    const btn = document.getElementById('submit-question');
    btn.disabled = !(state.selectedDept && state.questionText.trim().length >= 5);
}

// ============================================================
// 키워드 입력 UI 헬퍼
// ============================================================
function clearKwInput(n) {
    const el = document.getElementById(`kw-input-${n}`);
    if (el) { el.value = ''; updateKeywordPreview(); }
}

function updateKeywordPreview() {
    const kws = [1,2,3]
        .map(n => (document.getElementById(`kw-input-${n}`)?.value || '').trim())
        .filter(v => v.length > 0);
    const preview = document.getElementById('kw-preview');
    if (!preview) return;
    if (kws.length === 0) {
        preview.classList.add('hidden');
        preview.innerHTML = '';
    } else {
        preview.classList.remove('hidden');
        preview.innerHTML = kws.map(k => `<span class="kw-preview-tag">📌 ${escHtml(k)}</span>`).join('');
    }
}

// ============================================================
// 질문 제출 → 확인 화면
// ============================================================
async function submitQuestion() {
    // 항상 textarea 최신값 반영
    state.questionText = document.getElementById('question-input').value.trim();
    state.selectedDept = document.getElementById('dept-select').value;
    if (!state.selectedDept || !state.questionText) return;

    // 사용자 직접 입력 키워드 수집 (최대 3개, 빈 것 제외)
    state.userKeywords = [1,2,3]
        .map(n => (document.getElementById(`kw-input-${n}`)?.value || '').trim())
        .filter(v => v.length > 0);

    navigateTo('confirm');
    resetConfirmScreen();

    // 단계 애니메이션
    const steps = ['a-step1', 'a-step2', 'a-step3'];
    let idx = 0;
    const timer = setInterval(() => {
        if (idx > 0) {
            const prev = document.getElementById(steps[idx - 1]);
            prev.classList.remove('active');
            prev.classList.add('done');
            prev.querySelector('i').className = 'fas fa-check-circle';
        }
        if (idx < steps.length) {
            document.getElementById(steps[idx]).classList.add('active');
            idx++;
        }
    }, 700);

    // AI 요약 생성
    const summary = await generateSummary(state.selectedDept, state.questionText);
    state.summaryText = summary;

    setTimeout(() => {
        clearInterval(timer);
        steps.forEach(s => {
            const el = document.getElementById(s);
            el.classList.remove('active');
            el.classList.add('done');
            el.querySelector('i').className = 'fas fa-check-circle';
        });
        setTimeout(() => {
            document.getElementById('analyzing-anim').classList.add('hidden');
            renderSummaryCard(summary);
            document.getElementById('summary-result').classList.remove('hidden');
        }, 300);
    }, 2200);
}

// ============================================================
// 확인 화면 렌더링
// ============================================================
function resetConfirmScreen() {
    document.getElementById('analyzing-anim').classList.remove('hidden');
    document.getElementById('summary-result').classList.add('hidden');
    ['a-step1', 'a-step2', 'a-step3'].forEach((s, i) => {
        const el = document.getElementById(s);
        el.classList.remove('active', 'done');
        el.querySelector('i').className = 'fas fa-circle';
        if (i === 0) el.classList.add('active');
    });
}

function renderSummaryCard(summary) {
    document.getElementById('summary-dept-tag').textContent = state.selectedDept;

    // 원문 질문 표시
    document.getElementById('summary-original').textContent = state.questionText;

    // AI 요약
    document.getElementById('summary-text').textContent = summary;

    // ─── 검색 모드 배지 업데이트 ───
    const modeBadge = document.getElementById('confirm-mode-badge');
    if (modeBadge) {
        if (state.searchMode === 'precise') {
            modeBadge.textContent = '🔬 정밀 검색 (전체 부서)';
            modeBadge.style.background = 'linear-gradient(135deg, #7c3aed22, #a855f722)';
            modeBadge.style.color = '#7c3aed';
            modeBadge.style.border = '1px solid #a855f766';
        } else {
            modeBadge.textContent = '⚡ 빠른 검색 (선택 부서만)';
            modeBadge.style.background = '';
            modeBadge.style.color = '';
            modeBadge.style.border = '';
        }
    }

    // 키워드 추출 + 사용자 직접 입력 키워드 합산
    const kwContainer = document.getElementById('summary-keywords');
    kwContainer.innerHTML = '';

    // 사용자 직접 입력 키워드 먼저 (강조 표시)
    state.userKeywords.forEach(kw => {
        const tag = document.createElement('span');
        tag.className = 'keyword-tag keyword-tag-user'; // 별도 스타일 (파란색)
        tag.textContent = '📌 ' + kw;
        kwContainer.appendChild(tag);
    });

    // AI 추출 키워드 (사용자 키워드와 중복 제외)
    const aiKeywords = extractKeywords(state.selectedDept, state.questionText)
        .filter(kw => !state.userKeywords.some(uk => uk.toLowerCase() === kw.toLowerCase()));
    aiKeywords.forEach(kw => {
        const tag = document.createElement('span');
        tag.className = 'keyword-tag';
        tag.textContent = kw;
        kwContainer.appendChild(tag);
    });
}

// ============================================================
// AI 답변 생성 (메인)
// ============================================================
async function startAiAnswer() {
    const loading = document.getElementById('answer-loading');
    const content = document.getElementById('answer-content');
    const error = document.getElementById('answer-error');

    loading.classList.remove('hidden');
    content.classList.add('hidden');
    error.classList.add('hidden');

    // 검색 소스 애니메이션
    const isFastModeLabel = (state.searchMode !== 'precise');
    const sources = ['sc1', 'sc2', 'sc3', 'sc4'];
    const subTexts = isFastModeLabel
        ? ['선택 부서 DB 검색 중...', '경남교육청 지침·고시 참조 중...', '교육부 발간자료 참조 중...', 'AI 종합 답변 생성 중...']
        : ['전체 부서 DB 검색 중...', '경남교육청 지침·고시 참조 중...', '교육부 발간자료 참조 중...', 'AI 종합 답변 생성 중...'];
    let sIdx = 0;
    const srcTimer = setInterval(() => {
        if (sIdx < sources.length) {
            if (sIdx > 0) {
                const prev = document.getElementById(sources[sIdx - 1]);
                prev.classList.remove('active');
                prev.classList.add('done');
                prev.querySelector('i').className = 'fas fa-check-circle';
            }
            const cur = document.getElementById(sources[sIdx]);
            cur.classList.add('active');
            cur.querySelector('i').className = 'fas fa-spinner fa-spin';
            document.getElementById('ai-loading-sub').textContent = subTexts[sIdx];
            sIdx++;
        }
    }, 700);

    try {
        // API 키 확인
        if (!getApiKey()) throw new Error('NO_API_KEY');

        // ── 질문 시 10P 차감 (로그인·승인된 일반 사용자만) ──────────
        if (typeof deductPoints === 'function' &&
            typeof authState !== 'undefined' && authState.currentUser &&
            !authState.isAdmin && authState.currentUser.user_id !== ADMIN_ID) {
            const ok = await deductPoints(10, '질문');
            if (!ok) {
                // 포인트 부족 → 로딩 숨기고 중단
                clearInterval(srcTimer);
                loading.classList.add('hidden');
                return;
            }
        }

        // ── 1순위: 자료실 파일 내용 직접 분석 ──────────────────
        let libraryContext = '';
        let libraryImageParts = []; // 이미지 파일 인라인 데이터
        // ★ DB를 한 번만 로드해서 startAiAnswer 전체에서 재활용
        let _bAll = null, _uAll = null;
        const isFastMode = (state.searchMode !== 'precise'); // 기본값 빠른 검색
        try {
            // AI 추출 키워드 + 사용자 직접 입력 키워드 합산
            const aiKeywords = extractKeywords(state.selectedDept, state.questionText);
            const userKws = (state.userKeywords || []).filter(k => k.length > 0);
            // 사용자 키워드는 중복 없이 앞에 배치 (우선순위 높음)
            const keywords = [...new Set([...userKws, ...aiKeywords])];

            // ★ 검색 모드에 따라 DB 로드 분기
            // 빠른 검색: 선택 부서 데이터만 메모리 캐시 또는 신규 fetch
            // 정밀 검색: 전체 부서 데이터 전체 로드
            if (isFastMode) {
                // ── 빠른 검색: 선택 부서만 필터링하여 로드 ──
                console.log(`[AFTER] 빠른 검색 모드 – 부서: ${state.selectedDept}`);
                const [bAll, uAll] = await Promise.all([
                    fetchAllPages('base_forms'),
                    fetchAllPages('user_forms')
                ]);
                // 선택 부서 데이터만 필터링 (findAndShowRelatedForms용 캐시는 전체 보관)
                _bAll = bAll;
                _uAll = uAll;
                // window 캐시에도 저장 → continueConversation에서 재사용
                window._baseFormsCache = bAll;
                window._userFormsCache = uAll;
                const deptBase = bAll.filter(r => _normalizeDeptName(r.dept || '') === state.selectedDept);
                const deptUser = uAll.filter(r => _normalizeDeptName(r.dept || '') === state.selectedDept);
                const allForms = [...deptBase, ...deptUser];

                // 키워드+유사어 매칭으로 관련 자료 필터링 (점수 기반 정렬)
                const scored = allForms.map(f => {
                    const text = ((f.title||'') + ' ' + (f.dept||'') + ' ' + (f.desc||'')).toLowerCase();
                    let score = 0;
                    keywords.forEach((kw, idx) => {
                        if (text.includes(kw.toLowerCase())) {
                            const isUserKw = idx < userKws.length;
                            const baseWeight = kw.length >= 4 ? 3 : 1;
                            score += isUserKw ? baseWeight * 2 : baseWeight;
                        }
                    });
                    if ((f.dept||'') === state.selectedDept) score += 3;
                    return { ...f, _score: score };
                }).filter(f => f._score > 0)
                  .sort((a, b) => b._score - a._score)
                  .slice(0, 10);

                if (scored.length > 0) {
                    let fileContentBlocks = '';
                    let fileListLines = '';
                    for (const f of scored) {
                        const fname = f.title || f.name || f.file_name || '';
                        const ftype = (f.file_type || '').toLowerCase();
                        fileListLines += `- [${f.dept||''}] ${fname} (${ftype})\n`;
                        if (f.file_data && f.file_data.length > 10) {
                            try {
                                if (ftype === 'pdf' || ftype === 'txt') {
                                    const raw = atob(f.file_data);
                                    const readable = raw.replace(/[^\x20-\x7E\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F]/g, ' ')
                                                        .replace(/\s{3,}/g, '\n').trim().slice(0, 2000);
                                    if (readable.length > 50) {
                                        fileContentBlocks += `\n\n[📄 파일명: ${fname}]\n${readable}\n[파일 끝]`;
                                    }
                                } else if (['png','jpg','jpeg','gif','webp'].includes(ftype)) {
                                    const mimeType = ftype === 'jpg' ? 'image/jpeg' : `image/${ftype}`;
                                    libraryImageParts.push({ inlineData: { mimeType, data: f.file_data } });
                                    fileContentBlocks += `\n\n[🖼️ 이미지 파일: ${fname} - 아래 이미지 데이터 참조]`;
                                }
                            } catch(e) { /* 파일 파싱 실패 무시 */ }
                        }
                    }
                    libraryContext = `\n\n[📁 로컬 DB 및 자료실 업로드 파일 - 1순위 최우선 참고자료]\n${fileListLines}`;
                    if (fileContentBlocks) {
                        libraryContext += `\n\n[자료실 파일 내용 - 아래 내용을 경남교육청·교육부 자료보다 우선하여 답변에 인용하세요]\n${fileContentBlocks}`;
                    }
                }
            } else {
                // ── 정밀 검색: 전체 부서 모두 로드 ──
                console.log('[AFTER] 정밀 검색 모드 – 전체 부서 DB 검색');
                [_bAll, _uAll] = await Promise.all([
                    fetchAllPages('base_forms'),
                    fetchAllPages('user_forms')
                ]);
                const allForms = [..._bAll, ..._uAll];

                // 키워드+유사어 매칭으로 관련 자료 필터링 (점수 기반 정렬)
                const scored = allForms.map(f => {
                    const text = ((f.title||'') + ' ' + (f.dept||'') + ' ' + (f.desc||'')).toLowerCase();
                    let score = 0;
                    keywords.forEach((kw, idx) => {
                        if (text.includes(kw.toLowerCase())) {
                            const isUserKw = idx < userKws.length;
                            const baseWeight = kw.length >= 4 ? 3 : 1;
                            score += isUserKw ? baseWeight * 2 : baseWeight;
                        }
                    });
                    if ((f.dept||'') === state.selectedDept) score += 3;
                    return { ...f, _score: score };
                }).filter(f => f._score > 0)
                  .sort((a, b) => b._score - a._score)
                  .slice(0, 10);

                if (scored.length > 0) {
                    let fileContentBlocks = '';
                    let fileListLines = '';
                    for (const f of scored) {
                        const fname = f.title || f.name || f.file_name || '';
                        const ftype = (f.file_type || '').toLowerCase();
                        fileListLines += `- [${f.dept||''}] ${fname} (${ftype})\n`;
                        if (f.file_data && f.file_data.length > 10) {
                            try {
                                if (ftype === 'pdf' || ftype === 'txt') {
                                    const raw = atob(f.file_data);
                                    const readable = raw.replace(/[^\x20-\x7E\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F]/g, ' ')
                                                        .replace(/\s{3,}/g, '\n').trim().slice(0, 2000);
                                    if (readable.length > 50) {
                                        fileContentBlocks += `\n\n[📄 파일명: ${fname}]\n${readable}\n[파일 끝]`;
                                    }
                                } else if (['png','jpg','jpeg','gif','webp'].includes(ftype)) {
                                    const mimeType = ftype === 'jpg' ? 'image/jpeg' : `image/${ftype}`;
                                    libraryImageParts.push({ inlineData: { mimeType, data: f.file_data } });
                                    fileContentBlocks += `\n\n[🖼️ 이미지 파일: ${fname} - 아래 이미지 데이터 참조]`;
                                }
                            } catch(e) { /* 파일 파싱 실패 무시 */ }
                        }
                    }
                    libraryContext = `\n\n[📁 로컬 DB 및 자료실 업로드 파일 - 1순위 최우선 참고자료]\n${fileListLines}`;
                    if (fileContentBlocks) {
                        libraryContext += `\n\n[자료실 파일 내용 - 아래 내용을 경남교육청·교육부 자료보다 우선하여 답변에 인용하세요]\n${fileContentBlocks}`;
                    }
                }
            }
        } catch(e) { console.warn('[AFTER] 자료실 분석 오류:', e.message); }

        // Gemini 호출 (첨부 파일 + 자료실 이미지 포함)
        // ★ 이미 로드한 _bAll을 buildSystemPrompt에 전달 → fetchDeptFileContext 내부 fetch 제거 (속도 개선)
        let systemPrompt = (await buildSystemPrompt(state.selectedDept, isFastMode, _bAll)) + libraryContext;

        // 사용자 직접 입력 키워드가 있으면 시스템 프롬프트에 명시
        if (state.userKeywords && state.userKeywords.length > 0) {
            systemPrompt += `\n\n[사용자 지정 핵심 키워드 - 반드시 이 키워드 중심으로 답변하세요]\n` +
                state.userKeywords.map((k, i) => `${i+1}. ${k}`).join('\n');
        }
        let aiResponse;
        const qFile = state.qAttachedFile;

        if (qFile && qFile.isImage) {
            // 사용자 첨부 이미지 + 자료실 이미지 모두 Vision으로 전달
            const imgPrompt = systemPrompt + '\n\n[사용자 질문]\n' + state.questionText + '\n\n첨부 이미지를 분석하여 답변해주세요.';
            try {
                if (libraryImageParts.length > 0) {
                    // 자료실 이미지도 함께 전달
                    aiResponse = await callGeminiWithMultiImage(imgPrompt, [
                        { inlineData: { mimeType: qFile.mimeType, data: qFile.base64 } },
                        ...libraryImageParts
                    ]);
                } else {
                    aiResponse = await callGeminiWithImage(imgPrompt, qFile.base64, qFile.mimeType);
                }
            } catch(e) {
                aiResponse = await callGemini(systemPrompt, state.questionText + `\n\n[첨부 파일: ${qFile.name}]`);
            }
        } else if (qFile) {
            let fileContent = '';
            if (qFile.type === 'txt') {
                try { fileContent = '\n\n[첨부 파일 내용]\n' + atob(qFile.base64).slice(0, 3000); } catch(e) {}
            }
            aiResponse = await callGemini(systemPrompt, state.questionText + `\n\n[첨부 파일: ${qFile.name} (${qFile.type.toUpperCase()})]${fileContent}`);
        } else if (libraryImageParts.length > 0) {
            // 자료실에 이미지 파일이 있으면 Vision으로 전달
            try {
                aiResponse = await callGeminiWithMultiImage(
                    systemPrompt + '\n\n[사용자 질문]\n' + state.questionText,
                    libraryImageParts
                );
            } catch(e) {
                aiResponse = await callGemini(systemPrompt, state.questionText);
            }
        } else {
            aiResponse = await callGemini(systemPrompt, state.questionText);
        }
        state.currentAiAnswer = aiResponse;
        // 질문창 첨부 파일 초기화
        clearQFile();

        clearInterval(srcTimer);
        sources.forEach(s => {
            const el = document.getElementById(s);
            el.classList.remove('active');
            el.classList.add('done');
            el.querySelector('i').className = 'fas fa-check-circle';
        });

        setTimeout(() => {
            loading.classList.add('hidden');
            renderAiAnswer(aiResponse);
            content.classList.remove('hidden');
            const histId = saveHistory(aiResponse);
            state.currentSessionId = histId;
            // 대화 히스토리 초기화 (새 질문 시작)
            state.conversationHistory = [];
            resetChatConversation();
            // 첫 AI 답변을 대화 히스토리에 말풍선으로 추가
            appendChatBubble('ai', aiResponse);
            // ★ 관련 서식 검색 & 표시 (캐시된 DB 데이터 재활용)
            findAndShowRelatedForms(state.questionText, aiResponse, state.selectedDept, _bAll, _uAll);

            // ★ 빠른 검색 모드일 때 힌트 배너 표시
            const hint = document.getElementById('fast-search-hint');
            if (hint) {
                if (isFastMode) {
                    hint.classList.remove('hidden');
                } else {
                    hint.classList.add('hidden');
                }
            }

            // ★ 답변 완료 즉시 answer-content 최상단으로 스크롤
            scrollToAnswerTop();
        }, 400);

    } catch (err) {
        clearInterval(srcTimer);
        loading.classList.add('hidden');
        showAnswerError(err.message);
    }
}

// ============================================================
// AI 답변 렌더링 (마크다운 → HTML 변환)
// ============================================================
function renderAiAnswer(markdownText) {
    // 헤더
    const deptInfo = DEPT_INFO[state.selectedDept] || {};
    document.getElementById('answer-dept-badge').textContent = `${deptInfo.icon || '🏫'} ${state.selectedDept}`;
    document.getElementById('answer-q-title').textContent =
        state.questionText.length > 70 ? state.questionText.slice(0, 70) + '...' : state.questionText;
    const now = new Date();
    document.getElementById('answer-time').textContent =
        `${now.getFullYear()}.${String(now.getMonth()+1).padStart(2,'0')}.${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

    // 마크다운 → HTML 변환
    const html = markdownToHtml(markdownText);
    document.getElementById('ai-answer-body').innerHTML = html;

    // 피드백 UI 완전 초기화
    resetFeedbackUI();
    // 관련 서식 섹션 숨김 (새 답변 때 초기화)
    const rfs = document.getElementById('related-forms-section');
    if (rfs) rfs.classList.add('hidden');
    // 힌트 배너 숨김 초기화 (답변 생성 완료 후 다시 판단)
    const hint = document.getElementById('fast-search-hint');
    if (hint) hint.classList.add('hidden');
}

// ============================================================
// ★ AI 답변 후 관련 서식 처리
//   - AI 본문의 파일 목록 li 항목에 인라인 버튼 직접 삽입
//   - "관련 서식 자료" 별도 박스는 사용하지 않음 (중복 제거)
// ============================================================
async function findAndShowRelatedForms(question, aiAnswer, dept, cachedBase, cachedUser) {
    // 관련 서식 섹션 박스는 완전히 숨김 (AI 본문 인라인으로 통합)
    const section = document.getElementById('related-forms-section');
    if (section) section.classList.add('hidden');

    try {
        // ★ 캐시된 데이터 재활용 (DB 재조회 없음)
        const bAll2 = cachedBase || await fetchAllPages('base_forms');
        const uAll2 = cachedUser || await fetchAllPages('user_forms');

        // title → 레코드 빠른 검색용 맵 (번호 포함 / 번호 제거 두 가지 키로 이중 등록)
        const titleMap    = new Map();  // 번호 포함 정규화 key → record
        const titleMapNN  = new Map();  // 번호 제거 정규화 key → record (폴백용)
        // 전체 레코드 배열 (점수 매칭에 사용)
        const allRecs = [];

        bAll2.forEach(r => {
            const norm   = _normTitle(r.title);
            const normNN = _normTitleNoNum(r.title);
            const existing = titleMap.get(norm);
            if (!existing || _isBetterRecord(r, existing)) titleMap.set(norm, r);
            const existingNN = titleMapNN.get(normNN);
            // 번호 없는 키는 더 좋은 레코드(파일 있음)만 덮어씀
            if (!existingNN || _isBetterRecord(r, existingNN)) titleMapNN.set(normNN, r);
            allRecs.push(r);
        });
        uAll2.forEach(r => {
            if (r.file_data && r.file_data.length > 20) {
                const norm   = _normTitle(r.name);
                const normNN = _normTitleNoNum(r.name);
                const existing = titleMap.get(norm);
                if (!existing || _isBetterRecord(r, existing)) titleMap.set(norm, r);
                const existingNN = titleMapNN.get(normNN);
                if (!existingNN || _isBetterRecord(r, existingNN)) titleMapNN.set(normNN, r);
                allRecs.push(r);
            }
        });

        // AI 본문에 버튼 주입
        _injectInlineFormButtons(titleMap, titleMapNN, allRecs);

    } catch(e) {
        console.warn('[AFTER] 관련 서식 처리 실패:', e.message);
    }
}

// 제목 정규화 (공백·특수문자 제거, 소문자화 — 앞 번호 유지)
function _normTitle(t) {
    if (!t) return '';
    return t.replace(/[\s\-_()\[\]·•]+/g, '').toLowerCase();
}
// 번호 제거 버전 (2차 폴백 매칭용)
function _normTitleNoNum(t) {
    if (!t) return '';
    return t.replace(/^\d+[.\s]+/, '').replace(/[\s\-_()\[\]·•]+/g, '').toLowerCase();
}

// ============================================================
// ★ AI 본문의 파일 목록 li 항목에 인라인 다운로드/검색 버튼 삽입
// ============================================================
function _injectInlineFormButtons(titleMap, titleMapNN, allRecs) {
    try {
        const answerBody = document.getElementById('ai-answer-body');
        if (!answerBody) return;

        const loggedIn = isLoggedIn();
        const isAdmin  = typeof authState !== 'undefined' &&
            (authState.isAdmin || (authState.currentUser && authState.currentUser.user_id === ADMIN_ID));

        const typeLabel = { pdf:'PDF', hwp:'HWP', hwpx:'HWPX', xlsx:'XLSX', xls:'XLS', pptx:'PPT', ppt:'PPT' };
        const typeCls   = { pdf:'ifl-pdf', hwp:'ifl-hwp', hwpx:'ifl-hwp', xlsx:'ifl-xlsx', xls:'ifl-xlsx', pptx:'ifl-ppt', ppt:'ifl-ppt' };

        // "자료실에 다음 파일이 등록" 안내 p 태그 → 스타일 변경 (완전 제거하지 않고 안내 문구 교체)
        let foundNotice = false;
        answerBody.querySelectorAll('p').forEach(p => {
            const t = p.textContent || '';
            if (t.includes('자료실에 다음 파일') || t.includes('앱 내 자료실')) {
                p.innerHTML = '<span class="ifl-notice"><i class="fas fa-paperclip"></i> 자료실 등록 파일 — 버튼을 눌러 바로 다운로드하세요.</span>';
                p.className = 'ifl-notice-p';
                foundNotice = true;
            }
        });

        // 파일 목록 li 항목에 버튼 삽입
        // 감지 패턴: [PDF], [HWP], 📕, 📘, 📗, 📊 로 시작하는 li
        let injected = 0;
        answerBody.querySelectorAll('li').forEach(li => {
            // 이미 버튼이 삽입된 경우 스킵
            if (li.querySelector('.ifl-btn-wrap')) return;

            const rawText = li.textContent || '';

            // [PDF] 파일명 또는 📕 파일명 패턴 감지
            const typeMatch = rawText.match(/^\s*(?:\[(PDF|HWP|HWPX|XLSX|XLS|PPT|PPTX|DOC|DOCX)\]|[📕📘📗📊])\s*/iu);
            if (!typeMatch && !rawText.match(/^\s*\[/)) return;

            // 파일명 추출 (타입 태그 제거)
            const cleanTitle = rawText
                .replace(/^\s*\[(PDF|HWP|HWPX|XLSX|XLS|PPT|PPTX|DOC|DOCX)\]\s*/i, '')
                .replace(/^[📕📘📗📊]\s*/, '')
                .replace(/\s*—\s*.*$/, '')   // "— 설명" 제거
                .trim();

            if (!cleanTitle) return;

            // ── 3단계 매칭 ──────────────────────────────────────
            // 1단계: 번호 포함 완전 정규화 일치
            const norm = _normTitle(cleanTitle);
            let rec = titleMap.get(norm);

            // 2단계: 번호 제거 후 정규화 일치 (폴백)
            if (!rec) {
                const normNN = _normTitleNoNum(cleanTitle);
                rec = titleMapNN ? titleMapNN.get(normNN) : undefined;
            }

            // 3단계: 토큰 기반 유사도 매칭 (위 두 단계 모두 실패 시)
            if (!rec && allRecs && allRecs.length > 0) {
                const queryTokens = cleanTitle.replace(/[^\uAC00-\uD7A3a-zA-Z0-9]/g, ' ')
                    .split(/\s+/).filter(t => t.length >= 2);
                if (queryTokens.length > 0) {
                    let bestScore = 0, bestRec = null;
                    for (const r of allRecs) {
                        const rTitle = (r.title || r.name || '').toLowerCase();
                        let score = 0;
                        for (const tok of queryTokens) {
                            if (rTitle.includes(tok.toLowerCase())) score++;
                        }
                        // 전체 토큰 중 매칭 비율이 60% 이상인 것만 후보
                        if (score > bestScore && score / queryTokens.length >= 0.6) {
                            bestScore = score;
                            bestRec   = r;
                        }
                    }
                    if (bestRec) rec = bestRec;
                }
            }
            // ─────────────────────────────────────────────────────

            // 버튼 생성
            const ft  = rec ? (rec.file_type || rec.type || 'hwp').toLowerCase() : '';
            const label  = typeLabel[ft] || (ft ? ft.toUpperCase() : 'FILE');
            const cls    = typeCls[ft]  || 'ifl-default';
            const recId  = rec ? escHtml(rec.id) : '';
            const recFname = rec ? escHtml(rec.file_name || rec.name || cleanTitle) : '';

            // ★ 실제 파일 보유 여부 판단
            //   - file_data가 실제로 존재(길이>20) 하거나
            //   - is_chunked='true' 이면서 has_file이 truthy (bool true 또는 문자열 'true')
            //   - download_url이 있는 경우 (외부 링크)
            // ★ file_name만 있거나 has_file=false이면 파일 없음 → 버튼 미표시
            const _hasFile = rec && (rec.has_file === true || rec.has_file === 'true');
            const hasRealData = !!(rec && (
                (rec.file_data && rec.file_data.length > 20) ||
                (rec.is_chunked === 'true' && _hasFile)
            ));
            const hasDlUrl = !!(rec && rec.download_url);
            const hasSrUrl = !!(rec && rec.search_url);

            // ★ 실제 파일도 없고 외부 링크도 없는 레코드 → 버튼 완전 미표시 (메타만 존재)
            const hasAnything = hasRealData || hasDlUrl;

            let btn = '';

            if (rec && hasAnything) {
                // ✅ 실제 파일 있음 → 다운로드 버튼
                if (loggedIn) {
                    // file_type과 file_name 확장자 일치 보정
                    const realExt   = (recFname.split('.').pop() || ft).toLowerCase();
                    const finalType = realExt || ft;
                    const finalLabel = typeLabel[finalType] || (finalType ? finalType.toUpperCase() : 'FILE');
                    const finalCls   = typeCls[finalType]  || cls;
                    const dlFn = hasRealData
                        ? `downloadBaseForm('${recId}','${recFname}','${escHtml(finalType)}')`
                        : `openFormUrl('${escHtml(rec.download_url)}')`;
                    btn = `<button class="ifl-btn ifl-dl ${finalCls}" onclick="${dlFn}"
                        title="바로 다운로드 (${finalLabel})">
                        <i class="fas fa-download"></i> ${finalLabel}
                    </button>`;
                    // 관리자 삭제 버튼
                    if (isAdmin) {
                        btn += `<button class="ifl-del" onclick="deleteBaseFormRecord('${recId}','${escHtml(cleanTitle)}')"
                            title="삭제 (관리자)"><i class="fas fa-trash-alt"></i></button>`;
                    }
                } else {
                    btn = `<button class="ifl-btn ifl-lock" onclick="openLoginModal()"
                        title="로그인 후 다운로드">
                        <i class="fas fa-lock"></i> 로그인
                    </button>`;
                }
            } else if (rec && hasSrUrl) {
                // 🔍 메타데이터만 있음 → 검색 + 업로드 유도
                const geminiUrl = `https://gemini.google.com/search?q=${encodeURIComponent(cleanTitle)}`;
                const safeTitle2 = cleanTitle.replace(/'/g, "\\'");
                const safeDept2  = (rec ? (rec.dept||'') : (state.selectedDept||'')).replace(/'/g, "\\'");
                const safeRecId2 = rec ? escHtml(rec.id) : '';
                btn = `<button class="ifl-btn ifl-search" onclick="openFormUrl('${escHtml(geminiUrl)}')"
                    title="Gemini에서 검색"><i class="fas fa-search"></i> 검색
                </button>
                <button class="ifl-btn ifl-nudge" onclick="openUploadNudgeModal('${safeTitle2}','${safeDept2}','${safeRecId2}')"
                    title="직접 업로드하고 150P 받기"><i class="fas fa-upload"></i> 업로드
                </button>`;
            } else if (!rec) {
                // ❓ DB 매칭 없음 → Gemini 검색 + 업로드 유도
                const geminiUrl = `https://gemini.google.com/search?q=${encodeURIComponent(cleanTitle)}`;
                const safeTitle3 = cleanTitle.replace(/'/g, "\\'");
                const safeDept3  = (state.selectedDept||'').replace(/'/g, "\\'");
                btn = `<button class="ifl-btn ifl-search" onclick="openFormUrl('${escHtml(geminiUrl)}')"
                    title="Gemini에서 검색"><i class="fas fa-search"></i> 검색
                </button>
                <button class="ifl-btn ifl-nudge" onclick="openUploadNudgeModal('${safeTitle3}','${safeDept3}','')"
                    title="직접 업로드하고 150P 받기"><i class="fas fa-upload"></i> 업로드
                </button>`;
            } else {
                // ⏳ 메타는 있으나 파일 미업로드 → 버튼 완전 숨김 (관리자가 파일 업로드 후 자동 표시됨)
                // 아무 버튼도 표시하지 않음 (li 항목 자체는 텍스트로만 남김)
                btn = '';
            }

            // li 항목에 버튼 래퍼 삽입
            const existingText = li.innerHTML;
            li.innerHTML = `<span class="ifl-text">${existingText}</span><span class="ifl-btn-wrap">${btn}</span>`;
            li.classList.add('ifl-item');
            injected++;
        });

        if (injected > 0) {
            console.log(`[AFTER] AI 본문 파일 목록 ${injected}개 항목에 버튼 삽입 완료`);
        }

    } catch(e) {
        console.warn('[AFTER] AI 본문 버튼 삽입 오류:', e.message);
    }
}

// 연관성 점수 계산
// 연관성 점수 계산
function calcRelevanceScore(title, desc, formDept, keywords, queryDept) {
    const t = (title + ' ' + desc).toLowerCase();
    let score = 0;

    // 1) 직접 키워드 매칭 (유사어 포함 – extractKeywords가 이미 확장했음)
    for (const kw of keywords) {
        if (t.includes(kw.toLowerCase())) {
            // 제목에 있으면 가중치 2배
            const inTitle = title.toLowerCase().includes(kw.toLowerCase());
            const weight  = kw.length >= 4 ? 3 : (kw.length >= 3 ? 2 : 1);
            score += inTitle ? weight * 2 : weight;
        }
    }

    // 2) SYNONYM_MAP 기반 추가 확장 매칭 (keyword 자체도 map에 없을 때 보완)
    if (typeof SYNONYM_MAP !== 'undefined') {
        for (const kw of keywords) {
            const syns = SYNONYM_MAP[kw] || [];
            for (const syn of syns) {
                if (t.includes(syn.toLowerCase())) {
                    score += 1; // 유사어 매칭 보너스
                }
            }
        }
    }

    // 3) 같은 부서 서식이면 보너스
    if (queryDept && formDept === queryDept) score += 3;
    return score;
}

// 관련 서식 클릭 → 직접 다운로드 (로그인 필요)
async function relatedFormDownload(type, id, fileName, fileType) {
    if (!isLoggedIn()) { openLoginModal(); return; }
    const tableName = type === 'base' ? 'base_forms' : 'user_forms';
    const titleField = type === 'base' ? 'title' : 'name';
    try {
        showToast('📥 파일 준비 중...');
        const res = await fetch(apiUrl(`tables/${tableName}/${id}`));
        if (!res.ok) throw new Error('파일을 찾을 수 없습니다.');
        const form = await res.json();
        const fileData = form.file_data;
        if (!fileData || fileData.length < 10) {
            // 파일 없으면 URL로 시도
            const url = form.download_url || form.search_url;
            if (url) { openFormUrl(url); return; }
            showToast('❌ 파일 데이터가 없습니다.');
            return;
        }

        const byteStr = atob(fileData);
        const bytes = new Uint8Array(byteStr.length);
        for (let i = 0; i < byteStr.length; i++) bytes[i] = byteStr.charCodeAt(i);
        const mimeMap = {
            pdf: 'application/pdf',
            xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            xls: 'application/vnd.ms-excel',
            hwpx: 'application/octet-stream',
            hwp: 'application/octet-stream',
            docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            doc: 'application/msword',
            pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            ppt: 'application/vnd.ms-powerpoint'
        };
        const mime = mimeMap[fileType] || 'application/octet-stream';
        const blob = new Blob([bytes], { type: mime });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = fileName;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast(`✅ "${fileName}" 다운로드 시작!`);
    } catch(e) {
        showToast('❌ 다운로드 실패: ' + e.message);
    }
}

function markdownToHtml(md) {
    if (!md) return '';
    let html = md;

    // 코드 블록 (먼저 처리)
    html = html.replace(/```[\s\S]*?```/g, m => {
        const code = m.replace(/```\w*\n?/g, '').replace(/```/g, '');
        return `<pre class="md-code"><code>${escHtml(code.trim())}</code></pre>`;
    });

    // ## 제목 → h2 (이모지 포함)
    html = html.replace(/^## (.+)$/gm, '<h2 class="md-h2">$1</h2>');
    // ### 제목 → h3
    html = html.replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>');
    // #### 제목 → h4
    html = html.replace(/^#### (.+)$/gm, '<h4 class="md-h4">$1</h4>');

    // ──────────────────────────────────────────────────────────
    // * 항목 줄바꿈 처리:
    //   줄 중간에 "* 키워드:" 패턴이 연속으로 이어질 때 각각 줄바꿈 처리
    //   예) "...내용. * 학교 업무: 담임교사는..." → 앞에 줄바꿈 삽입
    //   조건: * 뒤에 공백 없이 한글/영문 단어가 바로 오는 경우 (인라인 별표 항목)
    // ──────────────────────────────────────────────────────────
    // 문장 중간의 " * " 또는 ". *" 앞에 줄바꿈 삽입 (이미 줄 시작인 경우 제외)
    html = html.replace(/([^\n]) \* ([^\s*])/g, '$1\n* $2');
    // ". *단어" 패턴도 처리
    html = html.replace(/([.!?]) \*([가-힣A-Za-z])/g, '$1\n* $2');

    // 굵게 **text**
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // 번호 목록 (1. 2. 3.)
    html = html.replace(/((?:^\d+\. .+$\n?)+)/gm, (match) => {
        const items = match.trim().split('\n').map(line => {
            const content = line.replace(/^\d+\. /, '');
            return `<li>${content}</li>`;
        }).join('');
        return `<ol class="md-ol">${items}</ol>`;
    });

    // 불릿 목록: 줄 시작의 "* " 또는 "- " (공백 포함)
    html = html.replace(/((?:^[*\-] .+$\n?)+)/gm, (match) => {
        const items = match.trim().split('\n').map(line => {
            const content = line.replace(/^[*\-] /, '');
            return `<li>${content}</li>`;
        }).join('');
        return `<ul class="md-ul">${items}</ul>`;
    });

    // 줄 시작의 "* 단어:" 패턴 (공백 없이 바로 붙는 경우) → 항목으로 처리
    // 예: "* 교감 업무: 내용..." → <div class="md-bullet-item">
    html = html.replace(/^\* ([^<\n]+)/gm, (_, content) => {
        // 콜론이 포함된 "* 키:값" 형태이면 키를 강조
        const colonIdx = content.indexOf(':');
        if (colonIdx > 0 && colonIdx < 20) {
            const key = content.slice(0, colonIdx).trim();
            const val = content.slice(colonIdx + 1).trim();
            return `<div class="md-bullet-item"><span class="md-bullet-key">* ${escHtml(key)}:</span> ${val}</div>`;
        }
        return `<div class="md-bullet-item"><span class="md-bullet-dot">*</span> ${content}</div>`;
    });

    // 인라인 코드 `code`
    html = html.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');

    // 구분선
    html = html.replace(/^---+$/gm, '<hr class="md-hr">');

    // 단일 줄바꿈 → <br> (단, 태그 경계 제외)
    html = html.replace(/\n(?!<\/?(h[2-4]|ul|ol|li|pre|hr|div|p))/g, '<br>');

    // 빈 줄(두 개 이상 연속 <br>) → 단락 구분
    html = html.replace(/(<br>\s*){2,}/g, '</p><p class="md-p">');
    html = '<p class="md-p">' + html + '</p>';

    // 빈 <p> 태그 제거 및 블록 태그 앞뒤 <p> 정리
    html = html.replace(/<p class="md-p"><\/p>/g, '');
    html = html.replace(/<p class="md-p">(<h[2-4]|<ul|<ol|<pre|<hr|<div)/g, '$1');
    html = html.replace(/(<\/h[2-4]>|<\/ul>|<\/ol>|<\/pre>|<hr[^>]*>|<\/div>)<\/p>/g, '$1');

    return html;
}

function escHtml(text) {
    return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ============================================================
// 오류 표시
// ============================================================
function showAnswerError(errorCode) {
    const errorEl = document.getElementById('answer-error');
    const titleEl = document.getElementById('error-title');
    const descEl = document.getElementById('error-desc');

    let title = '오류가 발생했습니다';
    let desc  = `오류 내용: ${errorCode}\n잠시 후 다시 시도해주세요.`;

    if (errorCode === 'NO_API_KEY') {
        title = '🔑 API 키가 설정되지 않았습니다';
        desc  = 'AI 답변을 받으려면 Gemini API 키가 필요합니다.\n하단의 "API 키 설정" 버튼을 눌러 무료 API 키를 설정해주세요.';
    } else if (errorCode === 'INVALID_KEY') {
        title = '❌ API 키가 올바르지 않습니다';
        desc  = 'API 키를 다시 확인해주세요. "AIza"로 시작하는 키를 입력해야 합니다.';
    } else if (errorCode === 'QUOTA_EXCEEDED') {
        title = '⏳ API 사용 한도를 초과했습니다';
        desc  = '무료 티어의 한도(분당 15회, 일 1,500회)에 도달했습니다.\n잠시 후 다시 시도해주세요.';
    } else if (errorCode === 'EMPTY_RESPONSE') {
        title = '😔 답변 생성에 실패했습니다';
        desc  = 'AI가 빈 응답을 반환했습니다. 잠시 후 다시 시도해주세요.';
    } else if (errorCode.startsWith('PERMISSION_DENIED')) {
        title = '🔒 API 키 권한 오류';
        desc  = 'API 키가 Gemini API 사용 권한이 없습니다.\nGoogle AI Studio에서 "Generative Language API"가 활성화되었는지 확인해주세요.\n\n상세: ' + errorCode.replace('PERMISSION_DENIED:', '');
    } else if (errorCode.startsWith('MODEL_NOT_FOUND') || errorCode === 'ALL_MODELS_FAILED') {
        title = '🌐 사용 가능한 모델 없음';
        desc  = '4가지 모델을 모두 시도했지만 연결에 실패했습니다.\nAPI 키를 다시 확인하거나 잠시 후 재시도해주세요.';
    } else if (errorCode.startsWith('BAD_REQUEST')) {
        title = '⚠️ 요청 오류';
        desc  = 'API 키가 올바른지, 네트워크 상태를 확인해주세요.\n\n상세: ' + errorCode.replace('BAD_REQUEST:', '');
    }

    titleEl.textContent = title;
    descEl.textContent  = desc;
    errorEl.classList.remove('hidden');
}

// ============================================================
// 히스토리
// ============================================================
function saveHistory(aiAnswer) {
    const id = Date.now();
    const entry = {
        id,
        dept: state.selectedDept,
        question: state.questionText,
        summary: state.summaryText,
        answer: aiAnswer ? aiAnswer.slice(0, 300) : '',
        fullAnswer: aiAnswer || '',
        time: new Date().toLocaleString('ko-KR'),
        conversation: []  // 연속 대화 저장용
    };
    state.history.unshift(entry);
    // localStorage는 최대 100개 유지
    if (state.history.length > 100) state.history = state.history.slice(0, 100);
    localStorage.setItem('questionHistory', JSON.stringify(state.history));
    renderRecentQuestions();
    renderHistoryPage();

    // ── DB에도 비동기 저장 (100개 초과 시 가장 오래된 것 자동 삭제) ──
    saveHistoryToDB(id, entry).catch(e => console.warn('[히스토리 DB 저장 실패]', e));

    return id;
}

/**
 * chat_history 테이블에 저장 + 100개 초과분 삭제
 */
async function saveHistoryToDB(localId, entry) {
    try {
        const userId = (typeof authState !== 'undefined' && authState.currentUser)
            ? authState.currentUser.user_id : 'guest';

        const payload = {
            user_id:    userId,
            dept:       entry.dept      || '',
            question:   (entry.question || '').slice(0, 1000),
            summary:    (entry.summary  || '').slice(0, 500),
            answer:     (entry.fullAnswer || '').slice(0, 2000),
            keywords:   (state.userKeywords || []).join(', '),
            feedback_type:    'none',
            feedback_comment: '',
            asked_at:   entry.time || new Date().toLocaleString('ko-KR'),
            session_id: String(localId)
        };

        const res = await fetch(apiUrl('tables/chat_history'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) return;

        // ── 100개 초과 시 가장 오래된 1개 삭제 ──
        await trimChatHistoryDB();
    } catch(e) {
        console.warn('[히스토리 DB 저장 실패]', e.message);
    }
}

/**
 * DB chat_history 레코드가 100개를 초과하면 created_at 기준 가장 오래된 것부터 삭제
 */
async function trimChatHistoryDB() {
    const MAX_HISTORY_DB = 100;
    try {
        // 전체 건수 확인
        const countRes = await fetch(apiUrl('tables/chat_history?page=1&limit=1'));
        if (!countRes.ok) return;
        const countData = await countRes.json();
        const total = countData.total || 0;
        if (total <= MAX_HISTORY_DB) return;

        // 초과 건수만큼 오래된 것 삭제 (sort=created_at 오름차순)
        const overCount = total - MAX_HISTORY_DB;
        const oldRes = await fetch(apiUrl(`tables/chat_history?page=1&limit=${overCount}&sort=created_at`));
        if (!oldRes.ok) return;
        const oldData = await oldRes.json();
        const oldRecords = oldData.data || [];

        // 병렬 삭제
        await Promise.all(oldRecords.map(r =>
            fetch(apiUrl(`tables/chat_history/${r.id}`), { method: 'DELETE' }).catch(() => {})
        ));
        console.log(`[히스토리] DB에서 ${oldRecords.length}개 오래된 기록 삭제 완료`);
    } catch(e) {
        console.warn('[히스토리 트림 실패]', e.message);
    }
}

// 대화를 히스토리에 저장
function saveConversationToHistory(userMsg, aiMsg) {
    if (!state.currentSessionId) return;
    const entry = state.history.find(h => h.id === state.currentSessionId);
    if (!entry) return;
    if (!entry.conversation) entry.conversation = [];
    entry.conversation.push({ role: 'user', text: userMsg, time: new Date().toLocaleString('ko-KR') });
    entry.conversation.push({ role: 'ai', text: aiMsg });
    localStorage.setItem('questionHistory', JSON.stringify(state.history));
}

function renderRecentQuestions() {
    const container = document.getElementById('recent-list');
    const recent = state.history.slice(0, 3);
    if (recent.length === 0) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-comment-dots"></i><p>아직 질문 내역이 없습니다</p></div>`;
        return;
    }
    container.innerHTML = recent.map(item => `
        <div class="recent-item" onclick="replayQuestion('${item.id}')">
            <span class="recent-dept-tag">${item.dept}</span>
            <span class="recent-q-text">${item.question}</span>
        </div>`).join('');
}

// ── DB 히스토리 캐시 ──────────────────────────────────────────
let _dbHistoryCache   = null;   // DB에서 로드한 히스토리 배열
let _dbHistoryCacheTs = 0;      // 마지막 로드 시각
const DB_HIST_CACHE_TTL = 30000; // 30초 캐시

/**
 * DB에서 chat_history 최근 100개 로드 (캐시 활용)
 * localStorage와 병합해 중복 제거 후 반환
 */
async function loadDBHistory(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && _dbHistoryCache && (now - _dbHistoryCacheTs) < DB_HIST_CACHE_TTL) {
        return _dbHistoryCache;
    }
    try {
        const res = await fetch(apiUrl('tables/chat_history?page=1&limit=100&sort=created_at'));
        if (!res.ok) return [];
        const data = await res.json();
        const rows = (data.data || []).reverse(); // 최신순 정렬 (created_at 오름차순 → 역순)

        // DB 레코드를 localStorage 포맷으로 변환
        _dbHistoryCache = rows.map(r => ({
            id:         Number(r.session_id) || r.id,
            dept:       r.dept || '',
            question:   r.question || '',
            summary:    r.summary  || '',
            answer:     (r.answer  || '').slice(0, 300),
            fullAnswer: r.answer   || '',
            time:       r.asked_at || '',
            feedback:   r.feedback_type || 'none',
            keywords:   r.keywords || '',
            conversation: [],
            _fromDB: true,
            _dbId: r.id
        }));
        _dbHistoryCacheTs = now;
        return _dbHistoryCache;
    } catch(e) {
        console.warn('[DB 히스토리 로드 실패]', e.message);
        return [];
    }
}

/**
 * localStorage + DB 히스토리 병합 (session_id 기준 중복 제거)
 * DB 데이터를 우선 사용하고, localStorage에만 있는 것(신규/미동기화)도 포함
 */
async function getMergedHistory() {
    const dbItems = await loadDBHistory();
    const localItems = state.history || [];

    // DB session_id 집합 생성
    const dbIds = new Set(dbItems.map(d => String(d.id)));

    // localStorage에만 있는 미동기화 항목 추가
    const localOnly = localItems.filter(l => !dbIds.has(String(l.id)));

    // DB 항목 + 로컬 전용 항목 합치기, 최신순 정렬
    const merged = [...dbItems, ...localOnly];
    merged.sort((a, b) => {
        const ta = typeof a.id === 'number' ? a.id : (Number(a.id) || 0);
        const tb = typeof b.id === 'number' ? b.id : (Number(b.id) || 0);
        return tb - ta; // 최신순
    });
    return merged;
}

/**
 * 히스토리 페이지 렌더링 (DB 우선, localStorage 보완)
 */
async function renderHistoryPage() {
    const container  = document.getElementById('history-list-full');
    const statsEl    = document.getElementById('hist-search-stats');
    if (!container) return;

    const deptFilter = state.histDeptFilter || 'all';
    const query      = (state.histSearchQuery || '').trim().toLowerCase();

    // 로딩 표시
    container.innerHTML = `<div style="text-align:center;padding:30px;color:#94a3b8;font-size:13px;">
        <i class="fas fa-spinner fa-spin" style="font-size:20px;margin-bottom:8px;display:block;"></i>
        히스토리 불러오는 중...
    </div>`;

    // DB + localStorage 병합
    let items = await getMergedHistory();

    // 부서 필터
    if (deptFilter !== 'all') {
        items = items.filter(h => h.dept === deptFilter);
    }

    // 검색 필터
    if (query) {
        items = items.filter(h =>
            (h.question || '').toLowerCase().includes(query) ||
            (h.answer   || '').toLowerCase().includes(query) ||
            (h.summary  || '').toLowerCase().includes(query) ||
            (h.dept     || '').toLowerCase().includes(query) ||
            (h.keywords || '').toLowerCase().includes(query)
        );
    }

    // 통계 표시
    const totalMerged = (await getMergedHistory()).length;
    if (statsEl) {
        const _DL = (typeof DEPT_LABEL !== 'undefined') ? DEPT_LABEL : {};
        if (query || deptFilter !== 'all') {
            const deptLabel  = deptFilter !== 'all' ? (_DL[deptFilter] || deptFilter) + ' · ' : '';
            const queryLabel = query ? `"${query}" ` : '';
            statsEl.textContent = `${deptLabel}${queryLabel}검색 결과 ${items.length}개 (전체 ${totalMerged}개)`;
        } else {
            statsEl.textContent = `총 ${totalMerged}개의 질문 (DB 공유 · 최근 100개 유지)`;
        }
        statsEl.style.display = 'block';
    }

    if (items.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="padding:50px 20px;">
                <i class="fas fa-search" style="font-size:40px;opacity:0.25;"></i>
                <p style="margin-top:14px;font-size:15px;">
                    ${query ? `"${query}"에 해당하는 히스토리가 없습니다` : '질문 히스토리가 없습니다'}
                </p>
                ${query ? `<p style="font-size:12px;color:#9ca3af;margin-top:6px;">다른 키워드로 검색해보세요</p>` : ''}
            </div>`;
        return;
    }

    // 검색 키워드 하이라이트 헬퍼
    function hlText(text, q) {
        if (!q || !text) return escHtml(text || '');
        const escaped = escHtml(text);
        const escapedQ = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return escaped.replace(new RegExp(escapedQ, 'gi'), m => `<mark class="hist-hl">${m}</mark>`);
    }

    // 부서별 그룹핑 (전체 탭일 때만)
    if (deptFilter === 'all' && !query) {
        const grouped = {};
        items.forEach(h => {
            const d = h.dept || '기타';
            if (!grouped[d]) grouped[d] = [];
            grouped[d].push(h);
        });

        const _DEPT_ORDER = (typeof DEPT_ORDER !== 'undefined') ? DEPT_ORDER : [];
        const _DEPT_LABEL = (typeof DEPT_LABEL !== 'undefined') ? DEPT_LABEL : {};
        const deptKeys = [..._DEPT_ORDER.filter(d => grouped[d]), ...Object.keys(grouped).filter(d => !_DEPT_ORDER.includes(d))];

        container.innerHTML = deptKeys.map(dept => {
            const dItems = grouped[dept];
            const label  = _DEPT_LABEL[dept] || dept;
            const cards  = dItems.map(item => renderHistCard(item, '')).join('');
            return `
            <div class="hist-dept-section">
                <div class="hist-dept-heading">
                    <span class="hist-dept-heading-label">${label}</span>
                    <span class="hist-dept-heading-count">${dItems.length}개</span>
                </div>
                <div class="hist-dept-cards">${cards}</div>
            </div>`;
        }).join('');

    } else {
        container.innerHTML = items.map(item => renderHistCard(item, query)).join('');
    }
}

// 히스토리 카드 HTML 생성 (공통)
function renderHistCard(item, query) {
    const convCount  = (item.conversation || []).length / 2;
    const qHtml      = query ? hlText(item.question, query) : escHtml(item.question || '');
    const summaryRaw = item.summary || (item.answer || '').slice(0, 100);
    const sumHtml    = query ? hlText(summaryRaw, query) : escHtml(summaryRaw);
    const _deptLabel = (typeof DEPT_LABEL !== 'undefined' && DEPT_LABEL[item.dept]) || item.dept || '';

    // 본인 여부 판단
    const me = (typeof authState !== 'undefined' && authState.currentUser) ? authState.currentUser.user_id : null;
    const isOwner = !item.user_id || !me || item.user_id === me;
    const authorBadge = isOwner
        ? `<span style="font-size:10px;background:#dbeafe;color:#1d4ed8;padding:2px 7px;border-radius:10px;font-weight:600;"><i class="fas fa-user"></i> 내 질문</span>`
        : `<span style="font-size:10px;background:#f3f4f6;color:#6b7280;padding:2px 7px;border-radius:10px;"><i class="fas fa-user-friends"></i> ${item.user_id||'공유'}</span>`;

    const actionButtons = isOwner
        ? `<button class="hi-continue-btn" onclick="continueConversation('${item.id}')">
                <i class="fas fa-redo"></i> 다시 질문
           </button>
           ${convCount > 0 ? `<button class="hi-continue-btn hi-conv-btn" onclick="continueConversation('${item.id}')">
                <i class="fas fa-comments"></i> 대화 이어하기
                <span class="hi-conv-count">${convCount}</span>
           </button>` : ''}`
        : `<button class="hi-continue-btn" style="background:#f3f4f6;color:#6b7280;" onclick="continueConversation('${item.id}')">
                <i class="fas fa-eye"></i> 내용 보기
           </button>`;

    return `
    <div class="history-item hi-card${isOwner ? '' : ' hi-card-others'}">
        <div class="hi-header">
            <span class="hi-dept">${_deptLabel}</span>
            <div style="display:flex;align-items:center;gap:6px;">
                ${authorBadge}
                <span class="hi-time">${item.time || ''}</span>
            </div>
        </div>
        <p class="hi-q" onclick="continueConversation('${item.id}')">${qHtml}</p>
        <p class="hi-summary">${sumHtml}${summaryRaw.length >= 100 ? '…' : ''}</p>
        <div class="hi-actions">${actionButtons}</div>
    </div>`;
}

function replayQuestion(id) {
    // 히스토리 클릭 → 대화 전체 복원 (continueConversation으로 위임)
    continueConversation(id);
}

// ============================================================
// 대화 이력 드롭다운 (질문/답변 화면 우측)
// ============================================================
function initHistDropdown() {
    ['', '-ans'].forEach(suffix => {
        const btn     = document.getElementById(`hist-dropdown-btn${suffix}`);
        const list    = document.getElementById(`hist-dropdown-list${suffix}`);
        const arrow   = document.getElementById(`hist-arrow${suffix}`);
        if (!btn || !list) return;

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = !list.classList.contains('hidden');
            // 모든 드롭다운 닫기
            document.querySelectorAll('.hist-dropdown-list').forEach(l => l.classList.add('hidden'));
            document.querySelectorAll('.hist-arrow').forEach(a => a.classList.remove('open'));
            if (!isOpen) {
                renderHistDropdown(list);
                list.classList.remove('hidden');
                if (arrow) arrow.classList.add('open');
            }
        });
    });

    // 외부 클릭 시 닫기
    document.addEventListener('click', () => {
        document.querySelectorAll('.hist-dropdown-list').forEach(l => l.classList.add('hidden'));
        document.querySelectorAll('.hist-arrow').forEach(a => a.classList.remove('open'));
    });
}

function renderHistDropdown(listEl) {
    const history = state.history || [];
    if (history.length === 0) {
        listEl.innerHTML = `<div class="hist-dropdown-empty"><i class="fas fa-comment-slash"></i><br>대화 기록이 없습니다</div>`;
        return;
    }
    listEl.innerHTML = history.slice(0, 30).map(item => {
        const q    = item.question || '';
        const dept = item.dept || '';
        const date = item.time ? new Date(item.time).toLocaleDateString('ko-KR', {month:'2-digit',day:'2-digit'}) : '';
        // 텍스트가 드롭다운 너비(약 200px)에서 잘릴 때만 툴팁 표시
        const needsTooltip = q.length > 28;
        return `<div class="hist-dropdown-item" 
            ${needsTooltip ? `data-overflow="true" data-fulltext="${q.replace(/"/g,'&quot;')}"` : ''}
            onclick="histDropdownSelect(${item.id})">
            <span class="hist-dept-tag">${dept}</span>
            <span class="hist-q-text">${q}</span>
            <span class="hist-q-date">${date}</span>
        </div>`;
    }).join('');
}

function histDropdownSelect(id) {
    // 드롭다운 닫기
    document.querySelectorAll('.hist-dropdown-list').forEach(l => l.classList.add('hidden'));
    document.querySelectorAll('.hist-arrow').forEach(a => a.classList.remove('open'));
    // 대화 복원
    continueConversation(id);
}

// ============================================================
// 서식 자료실 - 기본 서식 + 사용자 업로드 서식 통합 표시
// ============================================================
// 서식 검색어 상태
let formsSearchQuery = '';

// ── 부서명 정규화 (공백 trim + 별칭 통일) ────────────────────────
// 표준명: 과정평가부, 체육안전부, 과학영재수학환경부
// DB에 '과정&평가부', '체육&안전부' 등 구버전 이름 → 표준명으로 통일
function _normalizeDeptName(raw) {
    if (!raw) return '';
    const s = raw.trim().replace(/\s+/g, ' ');
    const ALIAS = {
        // 과정평가부 별칭
        '과정&평가부':           '과정평가부',
        '과정 평가부':           '과정평가부',
        '과정&평가':             '과정평가부',
        '과정 & 평가부':         '과정평가부',
        '과정 & 평가':          '과정평가부',
        // 체육안전부 별칭
        '체육&안전부':           '체육안전부',
        '체육 안전부':           '체육안전부',
        '체육&안전':             '체육안전부',
        '체육 & 안전부':         '체육안전부',
        '체육 & 안전':          '체육안전부',
        // 과학영재수학환경부 별칭
        '과학영재수학환경':      '과학영재수학환경부',
        '과학영재':              '과학영재수학환경부',
        '과학영재부':            '과학영재수학환경부',
        '과학&영재&수학&환경부': '과학영재수학환경부',
        // 오타 보정
        '교감 업무':             '교감업무',
        '교무 부':               '교무부',
        '교무부 ':               '교무부',
        '인성 부':               '인성부',
        '정보 부':               '정보부',
        '연구 부':               '연구부',
        '궐무부':                '교무부',
    };
    return ALIAS[s] || s;
}

// ============================================================
// ★ Gemini 지식 추출 & 저장 (업로드 직후 비동기 실행)
// ============================================================
async function extractAndSaveFormKnowledge(formId, formTable, dept, title, fileType, fileData) {
    try {
        const apiKey = getApiKey();
        if (!apiKey) return;

        // base64 파일 데이터를 텍스트로 변환하여 Gemini에 전송
        // (파일이 없거나 너무 작으면 제목/부서로만 요약)
        let prompt = '';
        if (fileData && fileData.length > 100) {
            prompt = `다음은 학교 행정 서식 파일입니다. 이 서식에 대한 정보를 분석하여 JSON으로 답하세요.
파일명: ${title}.${fileType}
부서: ${dept}
파일(Base64): ${fileData.substring(0, 2000)}...

아래 JSON 형식으로만 답변하세요 (다른 텍스트 없이):
{
  "summary": "이 서식의 용도와 내용을 2~3문장으로 설명",
  "keywords": "쉼표로 구분된 핵심 키워드 5~10개",
  "use_cases": "이 서식이 필요한 상황 2~3가지를 설명"
}`;
        } else {
            prompt = `학교 행정 서식의 제목과 부서를 보고 JSON으로 답하세요.
제목: ${title}
부서: ${dept}
파일 유형: ${fileType}

아래 JSON 형식으로만 답변하세요:
{
  "summary": "제목과 부서를 보고 이 서식의 예상 용도를 2~3문장으로 설명",
  "keywords": "쉼표로 구분된 핵심 키워드 5~10개",
  "use_cases": "이 서식이 필요한 상황 2~3가지"
}`;
        }

        const result = await callGemini(prompt, '');
        if (!result || !result.text) return;

        // JSON 파싱 시도
        let parsed = null;
        try {
            const jsonMatch = result.text.match(/\{[\s\S]*\}/);
            if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
        } catch(e) { /* JSON 파싱 실패 시 무시 */ }

        if (!parsed) return;

        // form_knowledge 테이블에 저장
        await fetch(apiUrl('tables/form_knowledge'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                form_id:      formId,
                form_table:   formTable,
                dept:         dept,
                title:        title,
                file_type:    fileType,
                summary:      parsed.summary || '',
                keywords:     parsed.keywords || '',
                use_cases:    parsed.use_cases || '',
                extracted_at: new Date().toISOString()
            })
        });
        console.log(`[AFTER] 지식 추출 완료: "${title}" (${dept})`);
    } catch(e) {
        console.warn('[AFTER] 지식 추출 실패 (무시):', e.message);
    }
}

// ============================================================
// ★ DB 유지보수: 부서명 정규화 + 다운로드 불가 자료 삭제
//    + 중복 파일 제거 (파일명+크기 동일한 것)
//    배포 후 첫 자료실 진입 시 자동 실행 (환경당 1회)
// ============================================================
async function runDbMaintenance() {
    const envKey = window.location.hostname.replace(/\./g,'_').slice(0,30);
    const MAINT_FLAG = `after_maint_v2_${envKey}`;
    if (localStorage.getItem(MAINT_FLAG) === '1') return;

    console.log('[AFTER] DB 유지보수 시작...');
    try {
        // ── 1) 전체 데이터 로드 ──
        // ★ GenSpark API는 한 번에 최대 200개 반환 → PAGE=200 으로 맞춤
        const PAGE = 200;
        const allBase = [];
        let page = 1, total = null;
        while (true) {
            const res = await fetch(apiUrl(`tables/base_forms?page=${page}&limit=${PAGE}`));
            if (!res.ok) break;
            const d = await res.json();
            const chunk = d.data || [];
            allBase.push(...chunk);
            if (total === null) total = d.total || 0;
            if (allBase.length >= total || chunk.length === 0) break;
            page++;
        }
        console.log(`[AFTER] 유지보수 대상: base_forms ${allBase.length}건 (서버 total: ${total})`);

        const toDelete = new Set();   // 삭제할 레코드 ID
        const toPatch  = {};          // { id: { dept } } 부서명 보정

        // ── 2) 부서명 정규화 ──
        const deptFixes = {
            '궐무부':'교무부','교무 부':'교무부','교감 업무':'교감업무',
            '인성 부':'인성부','정보 부':'정보부','연구 부':'연구부',
            '과학&영재&수학&환경부':'과학영재수학환경부',
            '과학영재수학환경':'과학영재수학환경부',
            '과학영재부':'과학영재수학환경부',
            '체육&안전부':'체육안전부','체육 안전부':'체육안전부',
            '체육&안전':'체육안전부','체육 & 안전부':'체육안전부',
            '체육 & 안전':'체육안전부',
            '과정&평가부':'과정평가부','과정 평가부':'과정평가부',
            '과정&평가':'과정평가부','과정 & 평가부':'과정평가부',
            '과정 & 평가':'과정평가부',
            '교감업무 ':'교감업무','교무부 ':'교무부',
            '과정평가부 ':'과정평가부','연구부 ':'연구부',
            '인성부 ':'인성부','정보부 ':'정보부',
            '과학영재수학환경부 ':'과학영재수학환경부','체육안전부 ':'체육안전부',
        };
        for (const row of allBase) {
            const raw = row.dept || '';
            const norm = _normalizeDeptName(raw);
            const fix = deptFixes[raw] || (norm !== raw ? norm : null);
            if (fix) toPatch[row.id] = { dept: fix };
        }

        // ── 3) 다운로드 불가 자료 감지 ──────────────────────────────────────
        // ★ 주의: 목록 API는 file_data를 잘라서 반환하므로 file_data.length 로 판단하면 안 됨
        // 판단 기준: file_name도 없고 download_url도 없고 search_url도 없는 경우만 삭제
        // has_file 플래그가 없는 구버전 데이터는 file_name 있으면 파일 있다고 간주
        for (const row of allBase) {
            const hasFileName    = row.file_name    && row.file_name.trim().length > 0;
            const hasDownloadUrl = row.download_url && row.download_url.trim().length > 5;
            const hasSearchUrl   = row.search_url   && row.search_url.trim().length > 5;
            // 명시적으로 has_file = false 이고 아무 URL도 없고 파일명도 없을 때만 삭제
            const explicitNoFile = (row.has_file === false || row.has_file === 'false');
            if (explicitNoFile && !hasFileName && !hasDownloadUrl && !hasSearchUrl) {
                toDelete.add(row.id);
            }
        }

        // ── 4) 중복 파일 감지 (file_name + file_size 완전 일치 → 최신 1개만 남기고 나머지 삭제) ──
        // ★ file_size가 없는 레코드는 중복 판단 제외 (구버전 데이터 오삭제 방지)
        const fileKey = new Map(); // "파일명|크기" → 첫 번째 레코드 id (최신순)
        const sortedForDup = [...allBase].sort((a,b) => (b.created_at||0) - (a.created_at||0));
        for (const row of sortedForDup) {
            if (toDelete.has(row.id)) continue;
            const fname = (row.file_name||'').trim().toLowerCase();
            const fsize = (row.file_size||'').trim();
            // file_name 과 file_size 모두 있을 때만 중복 비교 (둘 중 하나라도 없으면 스킵)
            if (!fname || !fsize) continue;
            const key = `${fname}|${fsize}`;
            if (fileKey.has(key)) {
                toDelete.add(row.id); // 중복 → 오래된 것 삭제 (최신 유지)
            } else {
                fileKey.set(key, row.id);
            }
        }

        console.log(`[AFTER] 부서 보정: ${Object.keys(toPatch).length}건, 삭제: ${toDelete.size}건`);

        // ── 5) 실제 PATCH/DELETE 실행 (10건씩 배치) ──
        const BATCH = 10;

        // PATCH (부서명 보정) - 삭제 예정이 아닌 것만
        const patchIds = Object.keys(toPatch).filter(id => !toDelete.has(id));
        for (let i = 0; i < patchIds.length; i += BATCH) {
            await Promise.all(patchIds.slice(i, i+BATCH).map(id =>
                fetch(apiUrl(`tables/base_forms/${id}`), {
                    method: 'PATCH',
                    headers: {'Content-Type':'application/json'},
                    body: JSON.stringify(toPatch[id])
                }).catch(()=>{})
            ));
        }

        // DELETE (다운로드 불가 + 중복)
        const deleteIds = [...toDelete];
        for (let i = 0; i < deleteIds.length; i += BATCH) {
            await Promise.all(deleteIds.slice(i, i+BATCH).map(id =>
                fetch(apiUrl(`tables/base_forms/${id}`), { method: 'DELETE' }).catch(()=>{})
            ));
        }

        // ── 6) user_forms 부서명 정규화 ──
        const allUser = _dbCache.user_forms || _loadPersistCache('user_forms') || [];
        const userPatches = {};
        for (const row of allUser) {
            const raw = row.dept || '';
            const norm = _normalizeDeptName(raw);
            const fix = deptFixes[raw] || (norm !== raw ? norm : null);
            if (fix) userPatches[row.id] = { dept: fix };
        }
        const userPatchIds = Object.keys(userPatches);
        for (let i = 0; i < userPatchIds.length; i += BATCH) {
            await Promise.all(userPatchIds.slice(i, i+BATCH).map(id =>
                fetch(apiUrl(`tables/user_forms/${id}`), {
                    method: 'PATCH',
                    headers: {'Content-Type':'application/json'},
                    body: JSON.stringify(userPatches[id])
                }).catch(()=>{})
            ));
        }

        // ── 7) 캐시 무효화 ──
        invalidateDbCache('base_forms');
        invalidateDbCache('user_forms');
        _formsCounts = null;

        localStorage.setItem(MAINT_FLAG, '1');
        console.log(`[AFTER] DB 유지보수 완료. 보정: ${patchIds.length}건, 삭제: ${deleteIds.length}건`);

        // 삭제/보정이 있었으면 자료실 카운트 새로고침
        if (patchIds.length > 0 || deleteIds.length > 0) {
            showToast(`🔧 DB 정리 완료: 부서 보정 ${patchIds.length}건, 불필요 항목 ${deleteIds.length}건 제거`);
            await loadFormsPageCounts();
        }
    } catch(e) {
        console.warn('[AFTER] DB 유지보수 오류:', e.message);
    }
}


const DEPT_ORDER = ['교감업무','교무부','과정평가부','연구부','인성부','정보부','과학영재수학환경부','체육안전부'];
const DEPT_LABEL = {
    '교감업무': '🏫 교감업무',
    '교무부': '📚 교무부',
    '과정평가부': '📝 과정평가부',
    '연구부': '🔬 연구부',
    '인성부': '💛 인성부',
    '정보부': '💻 정보부',
    '과학영재수학환경부': '🧪 과학영재수학환경부',
    '체육안전부': '⚽ 체육안전부'
};

// ============================================================
// base_forms 그룹핑 헬퍼 → renderBaseFormGroup 직전에 정의됨
// ============================================================

// ── 자료실 페이지 진입 시: 카운트만 먼저 로드 (지연 로딩) ──────
let _formsCounts = null; // { total, byDept: {부서명: count} }
// ★ auth.js 등 외부에서 리셋할 수 있도록 window에 노출
window._resetFormsCounts = function() { _formsCounts = null; };

async function loadFormsPageCounts() {
    const container = document.getElementById('forms-grid');
    const statsEl   = document.getElementById('forms-stats');
    if (!container) return;

    // 이미 카운트 캐시가 있으면 즉시 표시
    if (_formsCounts) {
        _renderFormsCounts(_formsCounts);
        _renderFormsCountsUI(_formsCounts, container, statsEl);
        return;
    }

    container.innerHTML = `<div class="forms-count-loading">
        <div class="forms-count-loading-inner">
            <i class="fas fa-database" style="font-size:32px;color:#6366f1;margin-bottom:14px;"></i>
            <p style="font-weight:700;font-size:15px;color:#1e293b;margin-bottom:6px;">자료실 현황 불러오는 중...</p>
            <p style="font-size:13px;color:#64748b;">잠시만 기다려 주세요</p>
        </div>
    </div>`;

    try {
        // 전체 total 조회 (1건만)
        const res = await fetch(apiUrl('tables/base_forms?page=1&limit=1'));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const total = data.total || 0;

        // ── 부서별 카운트: 전체 데이터를 메모리로 가져와서 직접 집계 (정확도 보장) ──
        let byDept = {};
        DEPT_ORDER.forEach(d => { byDept[d] = 0; });

        // 집계 헬퍼 – GitHub 파일이 있는 것만 카운트 (시드 데이터 제외)
        function countDepts(rows) {
            rows.forEach(row => {
                // GitHub 업로드 파일만 카운트
                const hasGithubPath = row.github_path && row.github_path.trim().length > 0;
                const hasGithubUrl  = row.download_url && row.download_url.includes('raw.githubusercontent.com');
                const hasFileData   = row.has_file === true;
                if (!hasGithubPath && !hasGithubUrl && !hasFileData) return; // 시드 데이터 제외
                const dept = _normalizeDeptName(row.dept);
                if (dept && byDept.hasOwnProperty(dept)) {
                    byDept[dept]++;
                }
            });
        }

        if (total > 0) {
            // ★ 반드시 fetchAllPages로 통일 – 독립 루프 제거
            // 캐시가 있어도 total 수와 다르면 강제 갱신
            const memCached = _dbCache.base_forms;
            const needRefresh = !memCached || memCached.length < total;
            console.log(`[AFTER] loadFormsPageCounts: total=${total}, 캐시=${memCached ? memCached.length : 0}개, 갱신=${needRefresh}`);
            const allRows = await fetchAllPages('base_forms', needRefresh);
            console.log(`[AFTER] loadFormsPageCounts: fetchAllPages 결과 ${allRows.length}개`);
            countDepts(allRows);
        }

        _formsCounts = { total, byDept };
        _renderFormsCounts(_formsCounts);
        _renderFormsCountsUI(_formsCounts, container, statsEl);

        // ── user_forms 카운트도 백그라운드에서 추가 집계 ──
        try {
            const cachedUser = _dbCache.user_forms || _loadPersistCache('user_forms');
            const allUser = cachedUser || [];
            if (allUser.length > 0) {
                allUser.forEach(row => {
                    if (row.approved === 'approved' || !row.approved) {
                        const dept = _normalizeDeptName(row.dept);
                        if (dept && byDept.hasOwnProperty(dept)) byDept[dept]++;
                    }
                });
                _formsCounts = { total: total + allUser.filter(r => r.approved === 'approved' || !r.approved).length, byDept };
                _renderFormsCounts(_formsCounts);
                _renderFormsCountsUI(_formsCounts, container, statsEl);
            }
        } catch(ue) { /* user_forms 집계 실패 무시 */ }

    } catch(e) {
        console.warn('[AFTER] loadFormsPageCounts 오류:', e.message);
        container.innerHTML = `<div class="empty-state">
            <i class="fas fa-exclamation-circle" style="font-size:32px;color:#ef4444;"></i>
            <p style="margin-top:12px;font-weight:600;">자료 현황 조회 실패</p>
            <p style="font-size:12px;color:#94a3b8;margin-top:4px;">${e.message}</p>
            <button class="btn-primary" style="margin-top:14px;font-size:13px;" onclick="loadFormsPageCounts()">
                <i class="fas fa-redo"></i> 다시 시도
            </button>
        </div>`;
    }
}

// 카운트 배지 DOM 업데이트
function _renderFormsCounts(counts) {
    const cntAll = document.getElementById('cnt-all');
    if (cntAll) cntAll.textContent = counts.total > 0 ? counts.total.toLocaleString() : '';
    const deptIdMap = {
        '교감업무':          'cnt-교감업무',
        '교무부':            'cnt-교무부',
        '과정평가부':        'cnt-과정평가부',
        '연구부':            'cnt-연구부',
        '인성부':            'cnt-인성부',
        '정보부':            'cnt-정보부',
        '과학영재수학환경부': 'cnt-과학영재수학환경부',
        '체육안전부':        'cnt-체육안전부'
    };
    Object.entries(deptIdMap).forEach(([dept, id]) => {
        const el = document.getElementById(id);
        const cnt = counts.byDept[dept] || 0;
        if (el) el.textContent = cnt > 0 ? cnt.toLocaleString() : '';
    });
}

// 자료실 메인 화면 UI 렌더링 (부서 카드 그리드)
function _renderFormsCountsUI(counts, container, statsEl) {
    if (!container) return;
    const total = counts.total;

    if (statsEl) statsEl.textContent = total > 0
        ? `전체 자료 ${total.toLocaleString()}건 · 부서 버튼을 클릭하면 자료 목록이 표시됩니다`
        : '등록된 자료가 없습니다 · 관리자가 서식을 업로드하면 표시됩니다';

    // 부서 카드 그리드 렌더링
    const DEPT_ICONS = {
        '교감업무': '🏫', '교무부': '📋', '과정평가부': '📝',
        '연구부': '🔬', '인성부': '💛', '정보부': '💻',
        '과학영재수학환경부': '🧪', '체육안전부': '⚽'
    };
    const DEPT_DESCS = {
        '교감업무': '교무 · 학사 · 행정', '교무부': '수업 · 평가 · 교육과정',
        '과정평가부': '교육과정 · 평가계획', '연구부': '연수 · 장학 · 컨설팅',
        '인성부': '생활지도 · 상담 · 학폭', '정보부': '정보보안 · 개인정보',
        '과학영재수학환경부': '과학 · 영재 · 수학 · 환경', '체육안전부': '체육 · 안전교육'
    };

    const cardsHtml = DEPT_ORDER.map(dept => {
        const cnt = counts.byDept[dept] || 0;
        const icon = DEPT_ICONS[dept] || '📁';
        const desc = DEPT_DESCS[dept] || '';
        const deptSafe = dept.replace(/'/g, "\\'");
        return `<div class="dept-overview-card ${cnt > 0 ? 'has-data' : 'no-data'}" onclick="clickDeptFilter('${deptSafe}')">
            <div class="doc-icon">${icon}</div>
            <div class="doc-content">
                <p class="doc-name">${dept === '과학영재수학환경부' ? '과학영재수학환경부' : dept}</p>
                <p class="doc-desc">${desc}</p>
            </div>
            <div class="doc-count ${cnt > 0 ? 'has-count' : 'zero-count'}">
                <span class="doc-cnt-num">${cnt.toLocaleString()}</span>
                <span class="doc-cnt-unit">건</span>
            </div>
        </div>`;
    }).join('');

    container.innerHTML = `
        <div class="forms-overview-guide">
            <i class="fas fa-hand-point-up" style="font-size:24px;color:#6366f1;"></i>
            <p>부서 버튼 또는 카드를 클릭하면 자료 목록이 표시됩니다</p>
        </div>
        <div class="dept-overview-grid">${cardsHtml}</div>
    `;
}

// 부서 카드 클릭 → 필터 버튼도 active 처리 후 renderFormsPage 호출
function clickDeptFilter(dept) {
    document.querySelectorAll('.filter-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.filter === dept);
    });
    formsSearchQuery = '';
    const searchInput = document.getElementById('forms-search-input');
    if (searchInput) searchInput.value = '';
    const clearBtn = document.getElementById('forms-search-clear');
    if (clearBtn) clearBtn.classList.add('hidden');
    renderFormsPage(dept);
}

async function renderFormsPage(filter = 'all', searchQuery = '') {
    const query = (searchQuery || formsSearchQuery || '').trim().toLowerCase();

    // ── 부서 미선택(전체) + 검색어 없으면 카운트만 보여주고 즉시 반환 ────────────
    if (filter === 'all' && !query) {
        await loadFormsPageCounts();
        // 필터 버튼 active 갱신
        document.querySelectorAll('.filter-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.filter === 'all');
        });
        return;
    }

    const container = document.getElementById('forms-grid');
    const statsEl   = document.getElementById('forms-stats');

    // ── 진행률 바 헬퍼 ──────────────────────────────────────────────────────────
    const barWrap  = document.getElementById('forms-load-bar-wrap');
    const barFill  = document.getElementById('forms-load-bar-fill');
    const barText  = document.getElementById('forms-load-bar-text');
    const barPct   = document.getElementById('forms-load-bar-pct');
    const barSub   = document.getElementById('forms-load-bar-sub');

    function showBar(label) {
        if (!barWrap) return;
        barWrap.style.display = 'block';
        if (barFill) { barFill.style.width = '0%'; barFill.classList.remove('done'); }
        if (barText) barText.textContent = label || '서식 목록 불러오는 중...';
        if (barPct)  barPct.textContent  = '0%';
        if (barSub)  barSub.textContent  = '잠시만 기다려 주세요...';
    }
    function updateBar(loaded, total, tableLabel) {
        if (!barWrap) return;
        const pct = total > 0 ? Math.round((loaded / total) * 100) : 0;
        if (barFill) barFill.style.width = pct + '%';
        if (barPct)  barPct.textContent  = pct + '%';
        if (barSub)  barSub.textContent  = `${tableLabel} · ${loaded.toLocaleString()} / ${total.toLocaleString()}건`;
    }
    function completeBar(totalLoaded) {
        if (!barWrap) return;
        if (barFill) { barFill.style.width = '100%'; barFill.classList.add('done'); }
        if (barPct)  barPct.textContent  = '100%';
        if (barText) barText.textContent = '✅ 서식 목록 로드 완료';
        if (barSub)  barSub.textContent  = `총 ${totalLoaded.toLocaleString()}건 준비됨`;
        setTimeout(() => { if (barWrap) barWrap.style.display = 'none'; }, 2000);
    }
    function hideBar() {
        if (barWrap) barWrap.style.display = 'none';
    }

    container.innerHTML = `<div class="empty-state" style="padding:30px;"><i class="fas fa-spinner fa-spin" style="font-size:28px;"></i><p style="margin-top:10px;font-size:13px;color:#64748b;">${filter !== 'all' ? (DEPT_LABEL[filter]||filter) : '전체'} 자료 불러오는 중...</p></div>`;

    // ── 캐시 여부 미리 확인 (진행률 바 표시 여부 결정) ──
    const hasCachedBase = !!(_dbCache.base_forms && (_dbCache._ts.base_forms || 0) > Date.now() - _dbCache.TTL)
        || !!_loadPersistCache('base_forms');

    showBar(`${filter !== 'all' ? (DEPT_LABEL[filter]||filter) : '전체'} 서식 불러오는 중...`);

    const loggedIn = isLoggedIn();

    // ── 1) base_forms (원본 DB 서식) 로드 – 전체 페이지 순회 ──────────────────────
    let baseRows = [];
    try {
        // ★ 캐시 건수 < 서버 total이면 강제 갱신 (업로드 후 캐시가 낡은 경우 완전 차단)
        let _needForceBase = false;
        try {
            const _chkRes  = await fetch(apiUrl('tables/base_forms?page=1&limit=1'));
            const _chkData = _chkRes.ok ? await _chkRes.json() : {};
            const _chkTotal = _chkData.total || 0;
            const _memLen  = (_dbCache.base_forms || []).length;
            if (_chkTotal > 0 && _memLen < _chkTotal) {
                console.log(`[AFTER] renderFormsPage: 캐시(${_memLen}) < 서버total(${_chkTotal}) → 강제 갱신`);
                invalidateDbCache('base_forms');
                _needForceBase = true;
            }
        } catch(_e) {}

        const allBase = await fetchAllPages('base_forms', _needForceBase, (loaded, total) => {
            // 캐시 미스일 때만 진행률 바 표시 (캐시 히트면 즉시 100% 반환)
            if (!hasCachedBase || _needForceBase) updateBar(loaded, total, '자료실 서식');
        });
        // 진단 로그: DB 전체 데이터 현황
        const deptCounts = {};
        allBase.forEach(r => { deptCounts[r.dept || '미분류'] = (deptCounts[r.dept || '미분류'] || 0) + 1; });
        console.log(`[AFTER] base_forms 총 ${allBase.length}개 로드됨. 부서별:`, deptCounts);

        // ── 부서명 자동 보정 (배포 환경별 1회 실행 – URL + 버전으로 키 구분) ──────────
        // 이 루프는 수백 건의 PATCH 요청을 발생시키므로 환경당 최초 1회만 실행합니다.
        const envKey = window.location.hostname.replace(/\./g,'_').slice(0,30);
        const DEPT_FIX_FLAG = `after_dept_fix_v5_${envKey}`; // v5: 과정평가부·체육안전부 최종 표준화
        const alreadyFixed = localStorage.getItem(DEPT_FIX_FLAG) === '1';
        if (!alreadyFixed) {
            const deptFixes = {
                '궐무부': '교무부', '교무 부': '교무부', '교감 업무': '교감업무',
                '인성 부': '인성부', '정보 부': '정보부', '연구 부': '연구부',
                '과학&영재&수학&환경부': '과학영재수학환경부',
                '과학영재수학환경': '과학영재수학환경부',
                '과학영재부': '과학영재수학환경부',
                '체육&안전부': '체육안전부', '체육 안전부': '체육안전부',
                '체육&안전': '체육안전부', '체육 & 안전부': '체육안전부',
                '체육 & 안전': '체육안전부',
                '과정&평가부': '과정평가부', '과정 평가부': '과정평가부',
                '과정&평가': '과정평가부', '과정 & 평가부': '과정평가부',
                '과정 & 평가': '과정평가부',
                // 공백 포함 부서명 (trim 안 됐을 경우)
                '교감업무 ': '교감업무', '교무부 ': '교무부',
                '과정평가부 ': '과정평가부', '연구부 ': '연구부',
                '인성부 ': '인성부', '정보부 ': '정보부',
                '과학영재수학환경부 ': '과학영재수학환경부', '체육안전부 ': '체육안전부',
            };
            const sciKeywords = ['과학','영재','수학','환경','지능형','PAPS','체험수학','발명','창의','생태','체육','운동','스포츠','현장체험','감염병','건강','안전','체육시설'];
            const patchQueue = [];
            for (const row of allBase) {
                let targetDept = deptFixes[row.dept] || null;
                if (!targetDept && row.dept === '연구부') {
                    const combined = ((row.title || '') + ' ' + (row.file_name || '')).toLowerCase();
                    const isScience = sciKeywords.some(kw => combined.includes(kw.toLowerCase()));
                    if (isScience) {
                        const sportsKw = ['체육','운동','스포츠','현장체험','감염병','건강','paps','안전점검'];
                        const isSports = sportsKw.some(kw => combined.includes(kw.toLowerCase()));
                        targetDept = isSports ? '체육안전부' : '과학영재수학환경부';
                    }
                }
                if (targetDept) {
                    patchQueue.push({ row, targetDept });
                    row.dept = targetDept; // 로컬 즉시 반영
                }
            }
            if (patchQueue.length > 0) {
                console.log(`[AFTER] 부서 보정 ${patchQueue.length}건 병렬 PATCH 시작...`);
                // 10건씩 배치 병렬 실행
                const BATCH = 10;
                for (let i = 0; i < patchQueue.length; i += BATCH) {
                    const chunk = patchQueue.slice(i, i + BATCH);
                    await Promise.all(chunk.map(({ row, targetDept }) =>
                        fetch(apiUrl(`tables/base_forms/${row.id}`), {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ dept: targetDept })
                        }).catch(() => {})
                    ));
                }
                invalidateDbCache('base_forms'); // 캐시 무효화
                console.log(`[AFTER] 부서 보정 완료: ${patchQueue.length}건`);
            }
            // ── user_forms 부서명도 동일하게 보정 ──
            try {
                const allUserForFix = _dbCache.user_forms || _loadPersistCache('user_forms') || [];
                const userPatchQueue = [];
                for (const row of allUserForFix) {
                    const targetDept = deptFixes[row.dept] || (_normalizeDeptName(row.dept) !== row.dept ? _normalizeDeptName(row.dept) : null);
                    if (targetDept) {
                        userPatchQueue.push({ row, targetDept });
                        row.dept = targetDept;
                    }
                }
                if (userPatchQueue.length > 0) {
                    const BATCH2 = 10;
                    for (let i = 0; i < userPatchQueue.length; i += BATCH2) {
                        const chunk = userPatchQueue.slice(i, i + BATCH2);
                        await Promise.all(chunk.map(({ row, targetDept }) =>
                            fetch(apiUrl(`tables/user_forms/${row.id}`), {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ dept: targetDept })
                            }).catch(() => {})
                        ));
                    }
                    invalidateDbCache('user_forms');
                    console.log(`[AFTER] user_forms 부서 보정 완료: ${userPatchQueue.length}건`);
                }
            } catch(ue2) { /* user_forms 패치 실패 무시 */ }
            localStorage.setItem(DEPT_FIX_FLAG, '1');
        }

        baseRows = allBase.filter(r => {
            // dept 정규화 후 비교 (공백/오타 차이 흡수)
            const normDept = _normalizeDeptName(r.dept);
            const matchDept  = filter === 'all' || normDept === filter;
            const matchQuery = !query ||
                (r.title||'').toLowerCase().includes(query) ||
                (normDept||'').toLowerCase().includes(query) ||
                (r.desc||'').toLowerCase().includes(query);
            return matchDept && matchQuery;
        });
        console.log(`[AFTER] 필터(${filter}) 적용 후 ${baseRows.length}개`);
    } catch(e) { console.warn('[AFTER] base_forms 로드 오류:', e.message); }

    // 동일 title+dept 묶음
    const baseGroupsRaw = groupBaseForms(baseRows);

    // ★ GitHub 업로드 파일만 표시 (github_path 또는 GitHub raw URL이 있는 것만)
    // 기존 시드 데이터(search_url만 있는 것)는 완전 제외
    // 관리자도 동일 기준 적용 – 깨끗한 자료실 유지
    const baseGroups = baseGroupsRaw.filter(g => {
        return g.files.some(f => {
            // GitHub raw URL 판별: raw.githubusercontent.com 포함 여부
            const hasGithubPath = f.github_path && f.github_path.trim().length > 0;
            const hasGithubUrl  = f.download_url && f.download_url.includes('raw.githubusercontent.com');
            // file_data가 직접 저장된 경우 (GitHub 미연동 fallback)
            const hasFileData   = f.has_file === true;
            return hasGithubPath || hasGithubUrl || hasFileData;
        });
    });
    console.log(`[AFTER] baseGroups ${baseGroups.length}개 (GitHub 파일만 표시). 부서 목록:`, [...new Set(baseGroups.map(g => g.dept))]);

    // ── 2) user_forms (사용자 업로드 – 승인된 것만) 로드 – 전체 페이지 순회 ────────────────────
    let userForms = [];
    try {
        const hasCachedUser = !!(_dbCache.user_forms && (_dbCache._ts.user_forms || 0) > Date.now() - _dbCache.TTL)
            || !!_loadPersistCache('user_forms');
        if (!hasCachedBase && !hasCachedUser && barText) {
            barText.textContent = '사용자 등록 서식 불러오는 중...';
            if (barFill) { barFill.style.width = '50%'; }
            if (barPct)  barPct.textContent = '50%';
        }
        const allUser = await fetchAllPages('user_forms', false, (loaded, total) => {
            if (!hasCachedBase && !hasCachedUser) {
                // base_forms 50% 기준으로 나머지 50% 진행
                const addPct = total > 0 ? Math.round((loaded / total) * 50) : 0;
                const pct = 50 + addPct;
                if (barFill) barFill.style.width = pct + '%';
                if (barPct)  barPct.textContent = pct + '%';
                if (barSub)  barSub.textContent = `사용자 등록 서식 · ${loaded.toLocaleString()} / ${total.toLocaleString()}건`;
            }
        });

        // ── user_forms 부서명 자동 보정 (base_forms와 동일 방식, 환경당 1회) ──
        const userEnvKey = window.location.hostname.replace(/\./g,'_').slice(0,30);
        const USER_DEPT_FIX_FLAG = `after_user_dept_fix_v1_${userEnvKey}`;
        if (localStorage.getItem(USER_DEPT_FIX_FLAG) !== '1') {
            const userPatchQueue = [];
            for (const row of allUser) {
                const norm = _normalizeDeptName(row.dept);
                if (norm !== row.dept && norm) {
                    userPatchQueue.push({ row, targetDept: norm });
                    row.dept = norm; // 로컬 즉시 반영
                }
            }
            if (userPatchQueue.length > 0) {
                console.log(`[AFTER] user_forms 부서 보정 ${userPatchQueue.length}건 PATCH 시작...`);
                const BATCH = 5;
                for (let i = 0; i < userPatchQueue.length; i += BATCH) {
                    const chunk = userPatchQueue.slice(i, i + BATCH);
                    await Promise.all(chunk.map(({ row, targetDept }) =>
                        fetch(apiUrl(`tables/user_forms/${row.id}`), {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ dept: targetDept })
                        }).catch(() => {})
                    ));
                }
                invalidateDbCache('user_forms');
                console.log(`[AFTER] user_forms 부서 보정 완료: ${userPatchQueue.length}건`);
            }
            localStorage.setItem(USER_DEPT_FIX_FLAG, '1');
        }

        userForms = allUser.filter(f => {
            // 관리자는 모두, 일반 사용자는 승인된 것만
            const isAdminView = typeof authState !== 'undefined' && (authState.isAdmin || (authState.currentUser && authState.currentUser.user_id === ADMIN_ID));
            const approvedOk = isAdminView || f.approved === 'approved' || !f.approved; // 기존 자료(approved 없음)도 표시
            const normUserDept = _normalizeDeptName(f.dept); // ★ 정규화 적용
            const matchDept  = filter === 'all' || normUserDept === filter;
            const matchQuery = !query ||
                (f.name||'').toLowerCase().includes(query) ||
                (normUserDept||'').toLowerCase().includes(query) ||
                (f.desc||'').toLowerCase().includes(query);
            return approvedOk && matchDept && matchQuery;
        });
    } catch(e) { console.warn('[AFTER] user_forms 로드 오류:', e.message); }

    // ── 로딩 진행률 바 완료 처리 ───────────────────────────────────────────────
    if (!hasCachedBase) {
        completeBar(baseRows.length + userForms.length);
    } else {
        hideBar();
    }

    const totalCount = baseGroups.length + userForms.length;

    if (statsEl) {
        const baseCount = baseGroups.length;
        const userCount = userForms.length;
        statsEl.textContent = query
            ? `"${query}" 검색 결과: ${totalCount}개`
            : `기본 서식 ${baseCount}개 · 등록 서식 ${userCount}개 (총 ${totalCount}개)`;
    }

    // 비로그인 안내 배너 표시/숨김
    const loginHintEl = document.getElementById('forms-login-hint');
    if (loginHintEl) {
        loginHintEl.style.display = !loggedIn ? 'flex' : 'none';
    }

    // 서식 없을 때
    if (totalCount === 0) {
        const deptLabel = filter !== 'all' ? (DEPT_LABEL[filter] || filter) : '';
        const emptyTitle = query
            ? `"${query}" 검색 결과가 없습니다`
            : (deptLabel ? `${deptLabel} 서식이 아직 없습니다` : '자료실이 비어 있습니다');
        container.innerHTML = `<div class="empty-state" style="padding:48px 24px;text-align:center;">
            <i class="fas fa-folder-open" style="font-size:48px;opacity:0.25;"></i>
            <p style="margin-top:14px;font-weight:600;font-size:15px;">${emptyTitle}</p>
            <p style="font-size:13px;color:#9ca3af;margin-top:6px;">관리자 패널에서 서식을 업로드하거나, 아래 버튼으로 직접 등록하세요</p>
            ${!loggedIn ? `<button class="btn-primary" style="margin-top:14px;font-size:13px;" onclick="openLoginModal()">
                <i class="fas fa-sign-in-alt"></i> 로그인 / 회원가입
            </button>` : (filter !== 'all' ? `<button class="btn-primary" style="margin-top:14px;font-size:13px;" onclick="openUploadModalWithDept('${filter}')">
                <i class="fas fa-upload"></i> ${deptLabel} 서식 추가하기
            </button>` : '')}
        </div>`;
        if (statsEl) statsEl.textContent = query ? `"${query}" 검색 결과 없음` : `${deptLabel || '전체'} · 등록된 서식 없음`;
        hideBar();
        return;
    }

    // ── 렌더링 ───────────────────────────────────────────────
    // ── 그룹이 다운로드 가능한지 판단하는 헬퍼 ──
    const _groupHasDownload = (g) =>
        g.files.some(f => (f.file_name && f.file_name.trim()) || (f.download_url && f.download_url.trim()) || (f.search_url && f.search_url.trim()));

    const renderDeptSection = (dept) => {
        const deptBase = baseGroups.filter(g => _normalizeDeptName(g.dept) === dept);
        const deptUser = userForms.filter(f => _normalizeDeptName(f.dept) === dept);
        if (deptBase.length === 0 && deptUser.length === 0) return '';

        // ── 다운로드 가능/불가 분리 ──
        const baseAvail   = deptBase.filter(g => _groupHasDownload(g));   // 다운로드 가능
        const baseNoFile  = deptBase.filter(g => !_groupHasDownload(g));  // 파일 없음

        const total = deptBase.length + deptUser.length;
        const deptSafe = dept.replace(/&/g, '&amp;').replace(/'/g, '&apos;');
        const downloadableBase = deptBase.reduce((acc, g) => acc + g.files.filter(f => (f.file_name && f.file_name.trim()) || (f.download_url && f.download_url.trim())).length, 0);
        const downloadableUser = deptUser.filter(f => (f.file_name && f.file_name.trim())).length;
        const totalDownloadable = downloadableBase + downloadableUser;
        const deptEncoded = encodeURIComponent(dept);

        let html = `<div class="forms-dept-section">
            <div class="forms-dept-heading">
                <span class="forms-dept-heading-label">${DEPT_LABEL[dept] || dept}</span>
                <span class="forms-dept-count">${total}개</span>
                ${totalDownloadable > 0 ? `<button class="dept-zip-btn" onclick="downloadDeptAsZip(decodeURIComponent('${deptEncoded}'))" title="${DEPT_LABEL[dept] || dept} 전체 파일 ZIP 다운로드">
                    <i class="fas fa-file-archive"></i> 전체 ZIP (${totalDownloadable}개)
                </button>` : ''}
            </div>`;

        // ① 다운로드 가능한 기본 서식 먼저
        baseAvail.forEach(g => { html += renderBaseFormGroup(g, loggedIn); });

        // ② 사용자 업로드 서식 (다운로드 가능)
        if (deptUser.length > 0) {
            html += `<div class="forms-section-divider forms-divider-user"><i class="fas fa-upload"></i> 사용자 등록 서식 (${deptUser.length}개)</div>`;
            deptUser.forEach(f => { html += renderUserFormItem(f); });
        }

        // ③ 파일 없는 항목 구분 바 + 목록
        if (baseNoFile.length > 0) {
            html += `<div class="forms-section-divider forms-divider-nofile">
                <i class="fas fa-clock"></i>
                <span>파일 준비 중 · 아래 ${baseNoFile.length}개는 아직 파일이 없습니다</span>
                <span class="forms-divider-nofile-count">${baseNoFile.length}개</span>
            </div>`;
            baseNoFile.forEach(g => { html += renderBaseFormGroup(g, loggedIn); });
        }

        // ④ 업로드 버튼
        html += `<button class="btn-add-form-inline" onclick="openUploadModalWithDept('${deptSafe}')">
            <i class="fas fa-plus"></i> ${DEPT_LABEL[dept] || dept} 서식 추가하기
        </button>`;
        html += `</div>`;
        return html;
    };

    if (filter === 'all' && !query) {
        let html = '';
        DEPT_ORDER.forEach(dept => { html += renderDeptSection(dept); });

        // 기타 (부서 미분류 사용자 서식)
        const otherUser = userForms.filter(f => !DEPT_ORDER.includes(_normalizeDeptName(f.dept)));
        if (otherUser.length > 0) {
            html += `<div class="forms-dept-section">
                <div class="forms-dept-heading">
                    <span class="forms-dept-heading-label">📎 기타</span>
                    <span class="forms-dept-count">${otherUser.length}개</span>
                </div>`;
            otherUser.forEach(f => { html += renderUserFormItem(f); });
            html += `</div>`;
        }
        container.innerHTML = html;

    } else {
        // 단일 부서 or 검색결과
        let html = '';

        // 단일 부서 필터일 때 섹션 헤더 표시 (비로그인도 볼 수 있음)
        if (filter !== 'all' && !query) {
            const downloadableBase = baseGroups.reduce((acc, g) => acc + g.files.filter(f => (f.file_name && f.file_name.trim()) || (f.download_url && f.download_url.trim())).length, 0);
            const downloadableUser = userForms.filter(f => (f.file_name && f.file_name.trim())).length;
            const totalDL = downloadableBase + downloadableUser;
            const filterEncoded = encodeURIComponent(filter);
            html += `<div class="dept-filter-header">
                <span class="dept-filter-title">${DEPT_LABEL[filter] || filter}</span>
                <span class="forms-dept-count">${totalCount}개</span>
                ${totalDL > 0 ? `<button class="dept-zip-btn" onclick="downloadDeptAsZip(decodeURIComponent('${filterEncoded}'))" title="${DEPT_LABEL[filter] || filter} 전체 파일 ZIP 다운로드">
                    <i class="fas fa-file-archive"></i> 전체 ZIP (${totalDL}개)
                </button>` : ''}
            </div>`;
        }

        // 단일 부서 필터 / 검색 모드: 다운로드 가능/불가 분리
        const bAvail  = baseGroups.filter(g => _groupHasDownload(g));
        const bNoFile = baseGroups.filter(g => !_groupHasDownload(g));

        // ① 다운로드 가능 기본 서식
        bAvail.forEach(g => { html += renderBaseFormGroup(g, loggedIn, query); });

        // ② 사용자 등록 서식
        if (userForms.length > 0) {
            if (bAvail.length > 0 || bNoFile.length > 0) {
                html += `<div class="forms-section-divider forms-divider-user"><i class="fas fa-upload"></i> 사용자 등록 서식 (${userForms.length}개)</div>`;
            }
            userForms.forEach(f => { html += renderUserFormItem(f, query); });
        }

        // ③ 파일 없는 항목
        if (bNoFile.length > 0) {
            html += `<div class="forms-section-divider forms-divider-nofile">
                <i class="fas fa-clock"></i>
                <span>파일 준비 중 · 아래 ${bNoFile.length}개는 아직 파일이 없습니다</span>
                <span class="forms-divider-nofile-count">${bNoFile.length}개</span>
            </div>`;
            bNoFile.forEach(g => { html += renderBaseFormGroup(g, loggedIn, query); });
        }
        if (filter !== 'all' && !query) {
            const filterSafe = filter.replace(/&/g, '&amp;').replace(/'/g, '&apos;');
            html += `<button class="btn-add-form-inline" onclick="openUploadModalWithDept('${filterSafe}')">
                <i class="fas fa-plus"></i> ${DEPT_LABEL[filter] || filter} 서식 추가하기
            </button>`;
        }
        container.innerHTML = html;
    }
}

// ============================================================
// base_forms 그룹 렌더링 (PDF / HWP 선택 버튼)
// ============================================================
function renderBaseFormGroup(group, loggedIn, query = '') {
    const nameHtml = query ? highlightText(group.title, query) : escHtml(group.title);

    // 관리자 여부 확인
    const isAdmin = typeof authState !== 'undefined' &&
        (authState.isAdmin || (authState.currentUser && authState.currentUser.user_id === ADMIN_ID));

    // 파일 타입별 아이콘 & 색상
    const typeInfo = {
        'pdf':  { icon: '📕', label: 'PDF',  cls: 'bf-btn-pdf'  },
        'hwp':  { icon: '📘', label: 'HWP',  cls: 'bf-btn-hwp'  },
        'hwpx': { icon: '📘', label: 'HWPX', cls: 'bf-btn-hwp'  },
        'xlsx': { icon: '📗', label: 'XLSX', cls: 'bf-btn-xlsx' },
        'xls':  { icon: '📗', label: 'XLS',  cls: 'bf-btn-xlsx' },
        'pptx': { icon: '📊', label: 'PPT',  cls: 'bf-btn-ppt'  },
        'ppt':  { icon: '📊', label: 'PPT',  cls: 'bf-btn-ppt'  },
    };

    // 파일 목록 → 버튼 생성
    let btnHtml = '';
    group.files.forEach(f => {
        const info = typeInfo[f.file_type] || { icon: '📄', label: (f.file_type||'FILE').toUpperCase(), cls: 'bf-btn-default' };
        const safeFname = escHtml(f.file_name || group.title);
        const safeExt   = escHtml(f.file_type || 'hwp');
        const safeId    = escHtml(f.id);
        const hasUploadedFile = !!(f.file_name && f.file_name.trim());
        const hasDownloadUrl = !!(f.download_url && f.download_url.trim());
        const hasSearchUrl   = !!(f.search_url  && f.search_url.trim());

        // ★ 관리자 삭제 버튼 (로그인된 관리자에게만 표시)
        const deleteBtn = isAdmin
            ? `<button class="bf-del-btn" onclick="deleteBaseFormRecord('${safeId}', '${escHtml(group.title)}')" title="이 항목 삭제 (관리자 전용)">
                <i class="fas fa-trash-alt"></i>
               </button>`
            : '';

        // ★ 관리자 파일 교체 버튼
        const safeReplaceTitle = escHtml(group.title).replace(/'/g, "\\'");
        const safeReplaceDept  = escHtml(group.dept || '').replace(/'/g, "\\'");
        const replaceBtn = isAdmin
            ? `<button class="bf-replace-btn" onclick="openReplaceFileModal('${safeId}','${safeReplaceTitle}','${safeReplaceDept}','${escHtml(f.file_type||'hwp')}','${escHtml(f.file_name||'')}')" title="파일 교체 (관리자 전용)">
                <i class="fas fa-sync-alt"></i> 교체
               </button>`
            : '';

        if (hasUploadedFile || hasDownloadUrl) {
            if (loggedIn) {
                btnHtml += `<span class="bf-btn-wrap">
                    ${deleteBtn}
                    ${replaceBtn}
                    <button class="bf-dl-btn ${info.cls}"
                        onclick="downloadBaseForm('${safeId}','${safeFname}','${safeExt}')"
                        title="${info.label} 다운로드">
                        ${info.icon} <span>${info.label}</span>
                        <small>⬇ 다운로드</small>
                    </button>
                </span>`;
            } else {
                btnHtml += `<span class="bf-btn-wrap">
                    <button class="bf-dl-btn ${info.cls} bf-btn-need-login"
                        onclick="openLoginModal()"
                        title="로그인 후 다운로드 가능">
                        ${info.icon} <span>${info.label}</span>
                        <small>🔒 로그인 필요</small>
                    </button>
                </span>`;
            }
        } else if (hasSearchUrl) {
            const safeUrl = escHtml(f.search_url);
            const nudgeTitle = escHtml(group.title).replace(/'/g, "\\'");
            const nudgeDept  = escHtml(group.dept  || '').replace(/'/g, "\\'");
            const nudgeId    = safeId;
            btnHtml += `<span class="bf-btn-wrap">
                ${deleteBtn}
                ${replaceBtn}
                <button class="bf-dl-btn bf-btn-search"
                    onclick="openFormUrl('${safeUrl}')"
                    title="관련 서식 검색 (외부 사이트)">
                    🔍 <span>${info.label}</span>
                    <small>↗ 검색</small>
                </button>
                <button class="bf-dl-btn bf-btn-nudge"
                    onclick="openUploadNudgeModal('${nudgeTitle}','${nudgeDept}','${nudgeId}')"
                    title="직접 업로드하고 150P 받기">
                    📤 <span>업로드</span>
                    <small>+150P</small>
                </button>
            </span>`;
        } else {
            const nudgeTitle2 = escHtml(group.title).replace(/'/g, "\\'");
            const nudgeDept2  = escHtml(group.dept  || '').replace(/'/g, "\\'");
            const nudgeId2    = safeId;
            btnHtml += `<span class="bf-btn-wrap">
                ${deleteBtn}
                ${replaceBtn}
                <button class="bf-dl-btn bf-btn-nudge"
                    onclick="openUploadNudgeModal('${nudgeTitle2}','${nudgeDept2}','${nudgeId2}')"
                    title="직접 업로드하고 150P 받기">
                    ${info.icon} <span>${info.label}</span>
                    <small>준비중·+150P</small>
                </button>
            </span>`;
        }
    });

    if (btnHtml === '') {
        btnHtml = `<button class="bf-dl-btn bf-btn-none" disabled><i class="fas fa-file"></i> <span>파일 없음</span></button>`;
    }

    // 파일 없는 항목 여부 (nudge 버튼만 있음)
    const isNoFile = !group.files.some(f =>
        (f.file_name && f.file_name.trim()) ||
        (f.download_url && f.download_url.trim()) ||
        (f.search_url && f.search_url.trim())
    );

    return `<div class="form-download-item bf-item${isNoFile ? ' bf-item-nofile' : ''}">
        <div class="bf-left">
            <p class="form-name">${nameHtml}</p>
        </div>
        <div class="bf-btns">${btnHtml}</div>
    </div>`;
}

// ============================================================
// groupBaseForms – 같은 title+dept를 묶고, 동일 file_type 중 최적 레코드만 남김
// 우선순위: file_data 있음 > file_name 있음 > download_url 있음 > 나머지
// ============================================================
function groupBaseForms(rows) {
    // 1단계: title+dept 그룹 맵 생성
    const map = new Map();
    rows.forEach(r => {
        const normDept = _normalizeDeptName(r.dept);
        const key = `${normDept}|||${r.title}`;
        if (!map.has(key)) {
            map.set(key, {
                title:      r.title,
                dept:       normDept,
                desc:       r.desc || '',
                source:     r.source || '',
                sort_order: r.sort_order ?? 9999,
                // file_type → 가장 좋은 레코드 1개씩 보관
                typeMap:    new Map()   // file_type → record
            });
        }
        const group = map.get(key);
        const ft = (r.file_type || 'hwp').toLowerCase();

        // 동일 file_type 중 우선순위 비교 후 더 나은 것만 보관
        const existing = group.typeMap.get(ft);
        if (!existing || _isBetterRecord(r, existing)) {
            group.typeMap.set(ft, r);
        }
    });

    // 2단계: typeMap → files 배열로 변환
    const result = [];
    map.forEach(g => {
        const files = [];
        g.typeMap.forEach((r, ft) => {
            files.push({
                id:           r.id,
                file_type:    ft,
                file_name:    r.file_name  || r.title,
                file_size:    r.file_size  || '',
                file_data:    r.file_data  || '',
                download_url: r.download_url || '',
                search_url:   r.search_url   || ''
            });
        });
        // PDF → HWP/HWPX → XLSX/XLS → PPT → 나머지 순 정렬
        const typeOrder = ['pdf','hwpx','hwp','xlsx','xls','pptx','ppt'];
        files.sort((a, b) => {
            const ai = typeOrder.indexOf(a.file_type);
            const bi = typeOrder.indexOf(b.file_type);
            return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        });
        result.push({ title: g.title, dept: g.dept, desc: g.desc, source: g.source, sort_order: g.sort_order, files });
    });
    return result.sort((a, b) => a.sort_order - b.sort_order);
}

// 두 레코드 중 더 좋은 것(file_data > file_name > download_url > 나머지) 판별
function _isBetterRecord(candidate, current) {
    const score = r => {
        if (r.file_data  && r.file_data.length  > 20) return 3;
        if (r.file_name  && r.file_name.trim())       return 2;
        if (r.download_url && r.download_url.trim())  return 1;
        return 0;
    };
    return score(candidate) > score(current);
}

// ============================================================
// 부서별 전체 파일 ZIP 다운로드
// ============================================================
async function downloadDeptAsZip(dept) {
    if (!isLoggedIn()) { openLoginModal(); return; }
    if (typeof JSZip === 'undefined') {
        showToast('⚠️ ZIP 라이브러리를 로드 중입니다. 잠시 후 다시 시도해주세요.');
        return;
    }
    const deptLabel = DEPT_LABEL[dept] || dept;
    showToast(`📦 ${deptLabel} 파일 묶는 중...`);

    try {
        const zip = new JSZip();
        const folder = zip.folder(deptLabel.replace(/[🏫📚📝🔬💛💻🧪⚽\s]/g, '').trim() || dept);

        // base_forms 수집 – 전체 페이지 순회
        let addedCount = 0;
        const usedNames = new Set();

        const allBase = await fetchAllPages('base_forms');
        // file_name 있는 항목 대상 (file_data는 목록 API에서 잘려 오므로 개별 조회)
        const deptBaseRows = allBase.filter(r => _normalizeDeptName(r.dept) === dept && r.file_name && r.file_name.trim());
        showToast(`📦 ${deptLabel} 파일 ${deptBaseRows.length}개 뮳는 중... (잠시 기다려 주세요)`);
        for (const r of deptBaseRows) {
            let fname = r.file_name || (r.title + '.' + (r.file_type || 'hwp'));
            // 중복 파일명 처리
            if (usedNames.has(fname)) {
                const ext = fname.includes('.') ? fname.substring(fname.lastIndexOf('.')) : '';
                const base = fname.includes('.') ? fname.substring(0, fname.lastIndexOf('.')) : fname;
                fname = `${base}(${addedCount})${ext}`;
            }
            usedNames.add(fname);
            try {
                // file_data가 목록에 없으면 개별 API로 조회
                let fileData = r.file_data;
                if (!fileData || fileData.length <= 10) {
                    const detailRes = await fetch(apiUrl(`tables/base_forms/${r.id}`));
                    if (detailRes.ok) {
                        const detail = await detailRes.json();
                        fileData = detail.file_data || '';
                    }
                }
                if (!fileData || fileData.length <= 10) continue; // 실제 파일 없으면 스킵
                const bytes = Uint8Array.from(atob(fileData), c => c.charCodeAt(0));
                folder.file(fname, bytes);
                addedCount++;
            } catch(e) { /* base64 디코딩 실패 무시 */ }
        }

        // user_forms 수집 – 전체 페이지 순회
        const allUser = await fetchAllPages('user_forms');
        const deptUserRows = allUser.filter(r => _normalizeDeptName(r.dept) === dept && r.file_data && r.file_data.length > 10);
        if (deptUserRows.length > 0) {
            const userFolder = folder.folder('사용자등록');
            for (const r of deptUserRows) {
                let fname = r.file_name || (r.name + '.' + (r.file_type || 'hwp'));
                if (usedNames.has('user/' + fname)) {
                    const ext = fname.includes('.') ? fname.substring(fname.lastIndexOf('.')) : '';
                    const base = fname.includes('.') ? fname.substring(0, fname.lastIndexOf('.')) : fname;
                    fname = `${base}(${addedCount})${ext}`;
                }
                usedNames.add('user/' + fname);
                try {
                    const bytes = Uint8Array.from(atob(r.file_data), c => c.charCodeAt(0));
                    userFolder.file(fname, bytes);
                    addedCount++;
                } catch(e) { /* 무시 */ }
            }
        }

        if (addedCount === 0) {
            showToast('⚠️ 다운로드 가능한 파일이 없습니다. 파일이 업로드된 서식만 ZIP에 포함됩니다.');
            return;
        }

        const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        const safeLabel = (deptLabel.replace(/[🏫📚📝🔬💛💻🧪⚽\s]/g, '').trim() || dept);
        a.download = `AFTER_서식자료_${safeLabel}.zip`;
        a.click();
        URL.revokeObjectURL(a.href);
        showToast(`✅ ${safeLabel} 서식 ${addedCount}개 ZIP 다운로드 완료!`);
    } catch(e) {
        console.error('[AFTER] ZIP 다운로드 실패:', e);
        showToast('❌ ZIP 생성 중 오류가 발생했습니다: ' + e.message);
    }
}

// base_forms 다운로드 (로그인 필요)
async function downloadBaseForm(id, fileName, fileType) {
    if (!requireLogin('download')) return;
    // 다운로드 시 10P 차감 (관리자 제외)
    if (typeof deductPoints === 'function' &&
        typeof authState !== 'undefined' && authState.currentUser &&
        !authState.isAdmin && authState.currentUser.user_id !== ADMIN_ID) {
        const ok = await deductPoints(10, '자료 다운로드');
        if (!ok) return; // 포인트 부족 시 중단
    }
    try {
        showToast('📥 파일 준비 중...');
        const res = await fetch(apiUrl(`tables/base_forms/${id}`));
        if (!res.ok) throw new Error('파일을 찾을 수 없습니다.');
        const form = await res.json();

        // ★ GitHub raw URL 또는 download_url이 있으면 직접 다운로드 (file_data 불필요)
        const githubRawUrlVal = form.github_path
            ? `https://raw.githubusercontent.com/daqdaegarie-hash/after-forms-storage/main/${form.github_path}`
            : '';
        const directDownloadUrl = githubRawUrlVal || form.download_url;

        if (!form.file_data || form.file_data.length < 20) {
            if (directDownloadUrl) {
                // GitHub raw URL → <a> 태그로 강제 다운로드
                showToast('📥 파일 다운로드 중...');
                try {
                    const dlRes = await fetch(directDownloadUrl);
                    if (dlRes.ok) {
                        const blob = await dlRes.blob();
                        const dlName = form.file_name || (fileName + '.' + (fileType||'hwp'));
                        const dlA = document.createElement('a');
                        dlA.href = URL.createObjectURL(blob);
                        dlA.download = dlName;
                        document.body.appendChild(dlA);
                        dlA.click();
                        setTimeout(() => { document.body.removeChild(dlA); URL.revokeObjectURL(dlA.href); }, 3000);
                        showToast(`✅ "${dlName}" 다운로드 완료!`);
                        return;
                    }
                } catch(dlErr) { /* fetch 실패 시 아래 openFormUrl로 fallback */ }
                showToast('🔗 외부 링크로 연결합니다...');
                openFormUrl(directDownloadUrl);
                return;
            }
            if (form.search_url) {
                showToast('🔍 검색 링크로 연결합니다...');
                openFormUrl(form.search_url);
                return;
            }
            // 파일 없음 안내 + 관리자에게는 교체 버튼 안내
            const isAdminUser = typeof authState !== 'undefined' && authState.isAdmin;
            if (isAdminUser) {
                showToast('⚠️ 파일 데이터가 없습니다. 🔄 교체 버튼으로 파일을 업로드해주세요.');
            } else {
                showToast('📋 해당 파일은 목록에 등록되어 있으나 아직 파일이 업로드되지 않았습니다. 관리자가 업로드 예정입니다.');
            }
            return;
        }

        // ── 청크 분할 파일 병합 처리 ──
        let allBytes;
        if (form.is_chunked === 'true' && form.chunk_total > 1) {
            showToast('📥 분할 파일 병합 중...');
            // 메인 레코드(chunk_index=0)의 file_data + 나머지 청크 레코드들 검색
            const chunkTotal = form.chunk_total;
            // 같은 제목(파트 포함)의 청크들을 검색
            const searchRes = await fetch(apiUrl(`tables/base_forms?search=${encodeURIComponent(form.file_name)}&limit=100`));
            const searchData = await searchRes.json();
            const allChunks = (searchData.data || [])
                .filter(r => r.chunk_ref === id || r.id === id)
                .sort((a, b) => (a.chunk_index || 0) - (b.chunk_index || 0));

            // 청크가 모두 있으면 병합, 없으면 main 것만 사용
            const parts = [];
            if (allChunks.length === chunkTotal) {
                for (const chunk of allChunks) {
                    const bs = atob(chunk.file_data);
                    const part = new Uint8Array(bs.length);
                    for (let j = 0; j < bs.length; j++) part[j] = bs.charCodeAt(j);
                    parts.push(part);
                }
                let totalLen = parts.reduce((s, p) => s + p.length, 0);
                allBytes = new Uint8Array(totalLen);
                let offset = 0;
                for (const part of parts) { allBytes.set(part, offset); offset += part.length; }
            } else {
                // 청크 일부 누락 시 main만 사용
                const bs = atob(form.file_data);
                allBytes = new Uint8Array(bs.length);
                for (let j = 0; j < bs.length; j++) allBytes[j] = bs.charCodeAt(j);
            }
        } else {
            const byteStr = atob(form.file_data);
            allBytes = new Uint8Array(byteStr.length);
            for (let i = 0; i < byteStr.length; i++) allBytes[i] = byteStr.charCodeAt(i);
        }
        const bytes = allBytes;

        // ★ file_name 확장자와 fileType 일치 보정
        // DB의 file_type보다 실제 file_name 확장자를 우선 신뢰
        const fileNameExt = (fileName.split('.').pop() || '').toLowerCase();
        const resolvedType = (fileNameExt && fileNameExt !== fileName.toLowerCase())
            ? fileNameExt   // file_name에 확장자가 있으면 그것을 사용
            : (fileType || 'hwp').toLowerCase();

        // 다운로드 파일명도 확장자 일치시키기
        // (file_name이 이미 올바른 확장자를 가지고 있으면 그대로, 아니면 fileType 확장자 붙임)
        let finalFileName = fileName;
        if (fileNameExt !== resolvedType && !fileName.includes('.')) {
            finalFileName = `${fileName}.${resolvedType}`;
        }

        const mimeMap = {
            pdf:  'application/pdf',
            xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            xls:  'application/vnd.ms-excel',
            hwpx: 'application/octet-stream',
            hwp:  'application/octet-stream',
            docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            doc:  'application/msword',
            pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            ppt:  'application/vnd.ms-powerpoint'
        };
        const mime = mimeMap[resolvedType] || 'application/octet-stream';
        const blob = new Blob([bytes], { type: mime });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = finalFileName;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast(`✅ 다운로드 시작: ${finalFileName}`);
    } catch(e) {
        showToast('❌ 다운로드 실패: ' + e.message);
    }
}

// 외부 URL 새 탭으로 열기
function openFormUrl(url) {
    if (!url) { showToast('⚠️ 링크가 없습니다.'); return; }
    try {
        const win = window.open(url, '_blank', 'noopener,noreferrer');
        if (!win) {
            // 팝업 차단 시 안내
            showToast('⚠️ 팝업이 차단됐습니다. 브라우저에서 팝업 허용 후 다시 눌러주세요.');
        }
    } catch(e) {
        showToast('⚠️ 링크를 열 수 없습니다: ' + e.message);
    }
}

function highlightText(text, query) {
    if (!query || !text) return escHtml(text || '');
    const escaped = escHtml(text);
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return escaped.replace(new RegExp(`(${escapedQuery})`, 'gi'), '<mark class="search-highlight">$1</mark>');
}

function renderBaseFormItem(form, query = '') {
    const icon = form.type === 'pdf' ? '📕' : (form.type === 'xlsx' || form.type === 'xls') ? '📗' : '📘';
    const nameHtml = query ? highlightText(form.name, query) : escHtml(form.name);
    const sourceHtml = form.source ? `<span class="form-source-badge">${escHtml(form.source)}</span>` : '';

    // url(직접 열기) 또는 searchUrl(검색 페이지) 결정
    const targetUrl = form.url || form.searchUrl || '';
    const hasDirectUrl = !!form.url;
    const hasUrl = !!targetUrl;

    // onclick 어트리뷰트 안에서 큰따옴표 충돌 방지: 작은따옴표로 URL을 감싸되
    // URL 내 작은따옴표·역슬래시만 이스케이프
    const urlForAttr = targetUrl.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

    let btnHtml;
    if (hasDirectUrl) {
        btnHtml = `<button class="form-download-btn form-download-btn--direct"
            onclick="openFormUrl('${urlForAttr}')"
            title="서식 페이지 바로가기 (새 탭 열기)">
            <i class="fas fa-external-link-alt"></i><span>열기</span>
        </button>`;
    } else if (hasUrl) {
        btnHtml = `<button class="form-download-btn form-download-btn--search"
            onclick="openFormUrl('${urlForAttr}')"
            title="관련 서식 검색하기 (새 탭 열기)">
            <i class="fas fa-search"></i><span>찾기</span>
        </button>`;
    } else {
        btnHtml = `<button class="form-download-btn form-download-btn--none"
            onclick="showToast('⚠️ 해당 서식의 링크가 아직 준비되지 않았습니다.')">
            <i class="fas fa-question-circle"></i>
        </button>`;
    }

    return `<div class="form-download-item">
        <span class="form-icon">${icon}</span>
        <div class="form-info">
            <p class="form-name">${nameHtml}</p>
            <p class="form-meta">${escHtml(form.dept)} · ${form.type.toUpperCase()} · ${form.size}</p>
            <p class="form-desc">${escHtml(form.desc || '')}</p>
            ${sourceHtml}
        </div>
        ${btnHtml}
    </div>`;
}

function renderUserFormItem(form, query = '') {
    const ext  = (form.file_type || 'file').toLowerCase();
    const icon = ext === 'pdf' ? '📕' : (ext === 'xlsx' || ext === 'xls') ? '📗' :
                 (ext === 'ppt' || ext === 'pptx') ? '📊' : '📘';
    const nameHtml = query ? highlightText(form.name, query) : escHtml(form.name);
    const safeId   = escHtml(form.id);
    const safeName = escHtml(form.file_name || form.name);
    const safeExt  = escHtml(ext);

    // 로그인 상태 & 본인 업로드 여부 확인
    const currentUid = getCurrentUserId();
    const isOwner = currentUid && (form.uploader_id === currentUid);
    const canDownload = isLoggedIn();

    const uploaderBadge = form.uploader_id
        ? `<span class="form-uploader-badge"><i class="fas fa-user"></i> ${escHtml(form.uploader_id)}</span>`
        : '';
    const pendingBadge = form.approved === 'pending'
        ? `<span class="form-pending-badge"><i class="fas fa-clock"></i> 승인 대기중</span>`
        : '';

    const actionHtml = canDownload
        ? `<div class="form-item-actions">
            <button class="form-download-btn form-download-btn--user"
                title="다운로드"
                onclick="downloadUserForm('${safeId}', '${safeName}', '${safeExt}')">
                <i class="fas fa-download"></i>
            </button>
            ${isOwner ? `<button class="form-delete-btn"
                title="삭제 (내가 올린 서식)"
                onclick="deleteUserForm('${safeId}', '${escHtml(form.name)}')">
                <i class="fas fa-trash-alt"></i>
            </button>` : ''}
          </div>`
        : `<button class="form-download-btn form-download-btn--locked"
                title="로그인 후 다운로드 가능"
                onclick="openLoginModal()">
                <i class="fas fa-lock"></i>
           </button>`;

    return `<div class="form-download-item form-download-item--user">
        <span class="form-icon">${icon}</span>
        <div class="form-info">
            <p class="form-name">${nameHtml}</p>
            <p class="form-meta">${escHtml(form.dept || '')} · ${ext.toUpperCase()} · ${escHtml(form.file_size || '?')}</p>
            <p class="form-desc">${escHtml(form.desc || '')}</p>
            ${uploaderBadge}${pendingBadge}
        </div>
        ${actionHtml}
    </div>`;
}

// ============================================================
// ★ 관리자 전용 – base_forms 레코드 삭제 (중복 파일 정리)
// ⚡ 빠른 삭제: DOM 직접 제거 → 백그라운드 캐시 갱신 (전체 재렌더링 없음)
// ============================================================
async function deleteBaseFormRecord(id, title) {
    const isAdmin = typeof authState !== 'undefined' &&
        (authState.isAdmin || (authState.currentUser && authState.currentUser.user_id === ADMIN_ID));
    if (!isAdmin) { showToast('❌ 관리자만 삭제할 수 있습니다.'); return; }

    const displayTitle = title || id;
    if (!confirm(`"${displayTitle}" 파일을 삭제하시겠습니까?\n\n⚠️ 이 작업은 되돌릴 수 없습니다.`)) return;

    // ── ① DOM 즉시 페이드아웃 제거 (API 응답 전 즉각 반응) ──────────────
    const bfDelBtn = document.querySelector(`.bf-del-btn[onclick*="'${id}'"]`);
    const bfWrap   = bfDelBtn ? bfDelBtn.closest('.bf-btn-wrap') : null;
    const rfDelBtn = document.querySelector(`.rf-del-btn[onclick*="'${id}'"]`);
    const rfItem   = rfDelBtn ? rfDelBtn.closest('.rf-item') : null;

    const fadeOut = el => {
        if (!el) return;
        el.style.transition = 'opacity 0.18s';
        el.style.opacity    = '0';
        el.style.pointerEvents = 'none';
        setTimeout(() => el.remove(), 200);
    };
    fadeOut(bfWrap);
    fadeOut(rfItem);

    // bf-item 안에 버튼이 0개 남으면 항목 전체도 제거
    if (bfWrap) {
        const bfItem = bfWrap.closest('.bf-item');
        if (bfItem) {
            setTimeout(() => {
                if (bfItem.querySelectorAll('.bf-btn-wrap').length === 0) fadeOut(bfItem);
            }, 250);
        }
    }

    showToast('🗑️ 삭제 중...');

    try {
        const res = await fetch(apiUrl(`tables/base_forms/${id}`), { method: 'DELETE' });
        if (res.ok || res.status === 204) {
            showToast(`✅ "${displayTitle}" 삭제 완료`);
            // ── ② 메모리 캐시에서만 해당 레코드 제거 (전체 재로드 없음) ──
            if (_dbCache.base_forms) {
                _dbCache.base_forms = _dbCache.base_forms.filter(r => r.id !== id);
                _savePersistCache('base_forms', _dbCache.base_forms);
            }
        } else {
            // API 실패 시 페이드아웃된 요소 복원
            [bfWrap, rfItem].forEach(el => {
                if (el && el.isConnected) {
                    el.style.opacity = '1';
                    el.style.pointerEvents = '';
                }
            });
            const errText = await res.text().catch(() => '');
            showToast(`❌ 삭제 실패 (${res.status})${errText ? ': ' + errText : ''}`);
        }
    } catch(e) {
        showToast('❌ 삭제 오류: ' + e.message);
    }
}

// 사용자 업로드 서식 삭제 (본인 업로드만 가능) – DOM 즉시 제거 방식
async function deleteUserForm(id, name) {
    if (!requireLogin('delete')) return;
    if (!confirm(`"${name}" 서식을 삭제하시겠습니까?`)) return;

    // DOM 즉시 페이드아웃
    const delBtn  = document.querySelector(`.form-delete-btn[onclick*="'${id}'"]`);
    const ufItem  = delBtn ? delBtn.closest('.form-download-item') : null;
    if (ufItem) {
        ufItem.style.transition = 'opacity 0.18s';
        ufItem.style.opacity    = '0';
        ufItem.style.pointerEvents = 'none';
        setTimeout(() => ufItem.remove(), 200);
    }

    try {
        const res = await fetch(apiUrl(`tables/user_forms/${id}`), { method: 'DELETE' });
        if (res.ok || res.status === 204) {
            showToast('🗑️ 서식이 삭제되었습니다.');
            // 캐시에서도 제거
            if (_dbCache.user_forms) {
                _dbCache.user_forms = _dbCache.user_forms.filter(r => r.id !== id);
                _savePersistCache('user_forms', _dbCache.user_forms);
            }
        } else {
            if (ufItem && ufItem.isConnected) { ufItem.style.opacity = '1'; ufItem.style.pointerEvents = ''; }
            showToast('❌ 삭제에 실패했습니다.');
        }
    } catch(e) {
        showToast('❌ 삭제 오류: ' + e.message);
    }
}

// 사용자 업로드 서식 다운로드 (로그인 필요)
async function downloadUserForm(id, fileName, fileType) {
    if (!requireLogin('download')) return;
    // 다운로드 시 10P 차감 (관리자 제외)
    if (typeof deductPoints === 'function' &&
        typeof authState !== 'undefined' && authState.currentUser &&
        !authState.isAdmin && authState.currentUser.user_id !== ADMIN_ID) {
        const ok = await deductPoints(10, '자료 다운로드');
        if (!ok) return; // 포인트 부족 시 중단
    }
    try {
        showToast('📥 파일 준비 중...');
        const res = await fetch(apiUrl(`tables/user_forms/${id}`));
        if (!res.ok) throw new Error('not found');
        const form = await res.json();
        if (!form.file_data) { showToast('❌ 파일 데이터가 없습니다.'); return; }

        // Base64 → Blob → 다운로드
        const byteStr = atob(form.file_data);
        const bytes = new Uint8Array(byteStr.length);
        for (let i = 0; i < byteStr.length; i++) bytes[i] = byteStr.charCodeAt(i);
        const mimeMap = { pdf:'application/pdf', xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            xls:'application/vnd.ms-excel', hwpx:'application/octet-stream', hwp:'application/octet-stream',
            docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
        const mime = mimeMap[fileType] || 'application/octet-stream';
        const blob = new Blob([bytes], { type: mime });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = fileName;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('✅ 다운로드를 시작합니다.');
    } catch(e) {
        showToast('❌ 다운로드에 실패했습니다: ' + e.message);
    }
}

// ============================================================
// 유틸
// ============================================================
function resetAll() {
    state.selectedDept = '';
    state.questionText = '';
    state.summaryText = '';
    state.currentAiAnswer = '';
    state.userKeywords = [];   // ★ 키워드 상태 초기화
    document.getElementById('dept-select').value = '';
    document.getElementById('question-input').value = '';
    document.getElementById('char-count').textContent = '0 / 500자';
    document.getElementById('dept-info').classList.add('hidden');
    document.getElementById('question-card').style.opacity = '0.5';
    document.getElementById('question-card').style.pointerEvents = 'none';
    document.getElementById('submit-question').disabled = true;
    document.getElementById('ai-answer-body').innerHTML = '';
    document.getElementById('answer-content').classList.add('hidden');
    document.getElementById('answer-error').classList.add('hidden');
    document.getElementById('answer-loading').classList.add('hidden');

    // ★ 키워드 입력창 초기화
    [1, 2, 3].forEach(n => {
        const el = document.getElementById(`kw-input-${n}`);
        if (el) el.value = '';
    });
    updateKeywordPreview();

    // 소스 체크 초기화
    ['sc1','sc2','sc3','sc4'].forEach(s => {
        const el = document.getElementById(s);
        el.classList.remove('active','done');
        el.querySelector('i').className = 'fas fa-circle';
    });
    document.querySelectorAll('.feedback-btn').forEach(b => b.className = 'feedback-btn');
    resetConfirmScreen();
    resetFollowupPanel();
}

// ============================================================
// 채팅 대화 인터페이스 (Gemini 스타일 연속 대화)
// ============================================================

// 채팅 입력 핸들러
function onChatInput() {
    const ta  = document.getElementById('chat-input');
    const cnt = document.getElementById('chat-char-count');
    const btn = document.getElementById('chat-send-btn');
    if (!ta) return;
    const len = ta.value.length;
    if (cnt) cnt.textContent = `${len} / 2000자`;
    if (btn) btn.disabled = ta.value.trim().length < 1 && !state.chatAttachedFile;
    // textarea 자동 높이
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
}

// 채팅 파일 선택
async function onChatFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    await attachFile(file, 'chat');
    e.target.value = '';
}

// 질문창 파일 선택
async function onQFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    await attachFile(file, 'question');
    e.target.value = '';
}

// 파일 첨부 공통 처리 (base64 변환)
async function attachFile(file, target) {
    // 파일 크기 제한 없음 (모든 용량 허용)
    const allowedTypes = ['image/png','image/jpeg','image/gif','image/webp',
        'application/pdf','text/plain',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/vnd.ms-powerpoint'];

    // mimeType 결정 (확장자로 보완)
    const ext = file.name.split('.').pop().toLowerCase();
    const extMime = {
        pdf: 'application/pdf', txt: 'text/plain',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        doc: 'application/msword',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        xls: 'application/vnd.ms-excel',
        pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        ppt: 'application/vnd.ms-powerpoint',
        png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
        gif: 'image/gif', webp: 'image/webp'
    };
    const mimeType = extMime[ext] || file.type || 'application/octet-stream';

    showToast('📎 파일 처리 중...');
    try {
        const base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
        const fileInfo = {
            name: file.name, size: file.size,
            type: ext, mimeType, base64,
            isImage: mimeType.startsWith('image/')
        };

        if (target === 'chat') {
            state.chatAttachedFile = fileInfo;
            // 채팅 파일 미리보기 업데이트
            const preview = document.getElementById('chat-file-preview');
            const nameEl  = document.getElementById('chat-file-name');
            const sizeEl  = document.getElementById('chat-file-size');
            const fileBtn = document.getElementById('chat-file-btn');
            if (preview) preview.classList.remove('hidden');
            if (nameEl)  nameEl.textContent = file.name;
            if (sizeEl)  sizeEl.textContent = formatFileSize(file.size);
            if (fileBtn) fileBtn.classList.add('has-file');
            onChatInput(); // 버튼 활성화
        } else {
            state.qAttachedFile = fileInfo;
            const preview = document.getElementById('q-file-preview');
            const nameEl  = document.getElementById('q-file-name');
            const sizeEl  = document.getElementById('q-file-size');
            const attachBtn = document.getElementById('btn-attach-q');
            if (preview) preview.classList.remove('hidden');
            if (nameEl)  nameEl.textContent = file.name;
            if (sizeEl)  sizeEl.textContent = formatFileSize(file.size);
            if (attachBtn) attachBtn.classList.add('has-file');
        }
        showToast(`✅ "${file.name}" 첨부 완료!`);
    } catch(e) {
        showToast('❌ 파일 처리 실패: ' + e.message);
    }
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + 'B';
    if (bytes < 1048576) return (bytes/1024).toFixed(1) + 'KB';
    return (bytes/1048576).toFixed(1) + 'MB';
}

// 채팅 파일 제거
function clearChatFile() {
    state.chatAttachedFile = null;
    const preview = document.getElementById('chat-file-preview');
    const fileBtn = document.getElementById('chat-file-btn');
    if (preview) preview.classList.add('hidden');
    if (fileBtn) fileBtn.classList.remove('has-file');
    onChatInput();
}

// 질문창 파일 제거
function clearQFile() {
    state.qAttachedFile = null;
    const preview = document.getElementById('q-file-preview');
    const attachBtn = document.getElementById('btn-attach-q');
    if (preview) preview.classList.add('hidden');
    if (attachBtn) attachBtn.classList.remove('has-file');
}

// 채팅 메시지 전송
async function sendChatMessage() {
    const ta   = document.getElementById('chat-input');
    const text = ta ? ta.value.trim() : '';
    const file = state.chatAttachedFile;

    if (!text && !file) return;

    // 입력 초기화
    if (ta) { ta.value = ''; ta.style.height = 'auto'; }
    document.getElementById('chat-char-count').textContent = '0 / 2000자';
    document.getElementById('chat-send-btn').disabled = true;
    clearChatFile();

    // 사용자 말풍선 추가
    appendChatBubble('user', text, file);
    state.conversationHistory.push({ role: 'user', text, file: file ? file.name : null });

    // 로딩 말풍선
    const loadingId = appendChatLoading();

    try {
        if (!getApiKey()) throw new Error('NO_API_KEY');

        // 파일 포함 프롬프트 생성
        const prompt = buildChatPrompt(text, file);
        let aiAnswer;

        if (file) {
            // ── Gemini inlineData 지원 MIME 목록 ──
            // 이미지: 네이티브, PDF: 네이티브(1.5+), 텍스트: plain/text
            // Office 문서(docx/xlsx/pptx)도 Gemini 2.0+ 에서 지원
            const inlineSupported = [
                'image/png','image/jpeg','image/gif','image/webp',
                'application/pdf',
                'text/plain',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                'application/msword',
                'application/vnd.ms-excel',
                'application/vnd.ms-powerpoint',
            ];
            const canInline = inlineSupported.includes(file.mimeType);

            if (canInline) {
                // ✅ inlineData로 실제 파일 내용 전달 → Gemini가 직접 읽음
                try {
                    aiAnswer = await callGeminiWithFile(prompt, file.base64, file.mimeType);
                } catch(e) {
                    // fallback: 텍스트 파일이면 내용 추출 후 텍스트 전송
                    if (file.type === 'txt') {
                        let decoded = '';
                        try { decoded = atob(file.base64).slice(0, 4000); } catch(_) {}
                        aiAnswer = await callGemini('', prompt + `\n\n[첨부 파일 내용 (${file.name})]\n${decoded}`);
                    } else {
                        aiAnswer = await callGemini('', prompt + `\n\n[첨부 파일: ${file.name} (${file.type.toUpperCase()}) — 파일 내용을 직접 분석하여 답변해주세요.]`);
                    }
                }
            } else {
                // hwp/hwpx 등 Gemini 미지원 포맷 → 파일명과 유형 안내
                aiAnswer = await callGemini('', prompt + `\n\n[첨부 파일: ${file.name} (${file.type.toUpperCase()}) — 현재 이 파일 형식은 직접 분석이 어렵습니다. 파일 내용을 텍스트로 붙여넣어 주시면 더 정확히 도움드릴 수 있습니다.]`);
            }
        } else {
            aiAnswer = await callGemini('', prompt);
        }

        removeChatLoading(loadingId);
        appendChatBubble('ai', aiAnswer);
        state.conversationHistory.push({ role: 'ai', text: aiAnswer });

        // 히스토리에 대화 저장
        saveConversationToHistory(text + (file ? ` [파일: ${file.name}]` : ''), aiAnswer);

    } catch(err) {
        removeChatLoading(loadingId);
        const errMsgs = {
            'NO_API_KEY':       '❌ API 키가 설정되지 않았습니다. AI 설정 탭에서 먼저 등록해주세요.',
            'QUOTA_EXCEEDED':   '⚠️ API 사용 한도를 초과했습니다. 잠시 후 다시 시도해주세요.',
            'INVALID_KEY':      '❌ API 키가 올바르지 않습니다.',
            'PERMISSION_DENIED':'❌ API 권한이 없습니다. 키를 확인해주세요.',
        };
        const msg = errMsgs[err.message] || ('❌ 오류: ' + err.message);
        appendChatBubble('ai', msg);
    }
}

// 채팅 프롬프트 생성 (전체 컨텍스트 포함)
function buildChatPrompt(newText, file) {
    const lines = [];
    lines.push(`당신은 경상남도 중·고등학교 교감 업무 전문 AI 도우미입니다.`);
    lines.push(`담당 부서: ${state.selectedDept}`);
    lines.push('');
    lines.push('=== 최초 질문 ===');
    lines.push(state.questionText);
    lines.push('');
    lines.push('=== 최초 AI 답변 ===');
    lines.push(state.currentAiAnswer);

    // 이전 대화 내역
    const prevConv = state.conversationHistory.filter(c => c.role !== 'system');
    if (prevConv.length > 0) {
        lines.push('');
        lines.push('=== 이전 대화 ===');
        prevConv.forEach(c => {
            if (c.role === 'user') {
                lines.push(`[사용자] ${c.text}${c.file ? ` (파일 첨부: ${c.file})` : ''}`);
            } else {
                lines.push(`[AI 답변] ${c.text}`);
            }
        });
    }

    lines.push('');
    if (file) {
        const typeUpper = file.type.toUpperCase();
        lines.push(`=== 새 질문 (첨부 파일: ${file.name} / 형식: ${typeUpper}) ===`);

        // 파일 유형별 분석 지시 추가 (Gemini가 역할을 명확히 인식하도록)
        if (file.isImage) {
            lines.push(`[지시] 첨부된 이미지를 세밀하게 분석하세요. 이미지의 내용을 사용자 질문과 연결지어 구체적으로 설명해주세요.`);
        } else if (file.type === 'pdf') {
            lines.push(`[지시] 첨부된 PDF 파일의 내용을 직접 읽고 분석하세요. 사용자 질문에 맞춰 PDF 내용을 참고한 구체적인 답변을 제공하세요.`);
        } else if (['docx','doc'].includes(file.type)) {
            lines.push(`[지시] 첨부된 Word 문서의 내용을 직접 읽고 분석하세요. 문서 구조와 내용을 사용자 질문에 맞춰 활용하세요.`);
        } else if (['xlsx','xls'].includes(file.type)) {
            lines.push(`[지시] 첨부된 Excel 파일의 데이터를 직접 읽고 분석하세요. 표의 구조, 수치, 항목을 사용자 질문에 맞춰 해석하세요.`);
        } else if (['pptx','ppt'].includes(file.type)) {
            lines.push(`[지시] 첨부된 PowerPoint 파일의 슬라이드 내용을 직접 읽고 분석하세요. 발표 자료의 구성과 내용을 사용자 질문에 맞춰 활용하세요.`);
        } else if (file.type === 'txt') {
            lines.push(`[지시] 첨부된 텍스트 파일의 내용을 읽고 사용자 질문에 맞춰 분석·활용하세요.`);
        }
    } else {
        lines.push('=== 새 질문 ===');
    }

    lines.push(newText || '첨부한 파일을 분석해주세요.');
    lines.push('');
    lines.push('위 전체 맥락과 첨부 파일 내용을 충분히 참고하여 구체적이고 실용적으로 답변해주세요. 마크다운 형식으로 작성해주세요.');

    return lines.join('\n');
}

// 이미지 파일 포함 Gemini 호출
async function callGeminiWithImage(textPrompt, base64Data, mimeType) {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('NO_API_KEY');

    const modelsToTry = [
        { name: 'gemini-2.5-flash-preview-04-17', ver: 'v1beta' },
        { name: 'gemini-2.0-flash', ver: 'v1beta' },
        { name: 'gemini-1.5-flash', ver: 'v1beta' },
        { name: 'gemini-1.5-pro', ver: 'v1beta' },
    ];

    for (const model of modelsToTry) {
        try {
            const url = `https://generativelanguage.googleapis.com/${model.ver}/models/${model.name}:generateContent?key=${apiKey}`;
            const payload = {
                contents: [{
                    role: 'user',
                    parts: [
                        { text: textPrompt },
                        { inlineData: { mimeType, data: base64Data } }
                    ]
                }],
                generationConfig: { temperature: 0.3, maxOutputTokens: 65536 }
            };
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                if (res.status === 429) throw new Error('QUOTA_EXCEEDED');
                if (res.status === 403) throw new Error('PERMISSION_DENIED');
                continue;
            }
            const data = await res.json();
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) return text;
        } catch(e) {
            if (e.message === 'QUOTA_EXCEEDED' || e.message === 'PERMISSION_DENIED') throw e;
        }
    }
    throw new Error('이미지 분석 모델 연결 실패. 텍스트로 질문해 주세요.');
}

/**
 * 파일(이미지·PDF·문서)을 inlineData로 Gemini에 전달해 실제 내용을 분석
 * - 이미지: Vision 모드로 그대로 인식
 * - PDF: Gemini 1.5+ 네이티브 PDF 파싱
 * - docx/xlsx/pptx: Gemini 2.0+ 문서 파싱
 * - txt: text/plain으로 내용 전달
 */
async function callGeminiWithFile(textPrompt, base64Data, mimeType) {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('NO_API_KEY');

    // PDF·문서는 1.5 pro 이상 권장, 이미지는 flash도 OK
    const modelsToTry = [
        { name: 'gemini-2.5-flash-preview-04-17', ver: 'v1beta' },
        { name: 'gemini-2.0-flash',               ver: 'v1beta' },
        { name: 'gemini-1.5-pro',                 ver: 'v1beta' },
        { name: 'gemini-1.5-flash',               ver: 'v1beta' },
    ];

    for (const model of modelsToTry) {
        try {
            const url = `https://generativelanguage.googleapis.com/${model.ver}/models/${model.name}:generateContent?key=${apiKey}`;
            const payload = {
                contents: [{
                    role: 'user',
                    parts: [
                        { text: textPrompt },
                        { inlineData: { mimeType, data: base64Data } }
                    ]
                }],
                generationConfig: { temperature: 0.3, maxOutputTokens: 65536 }
            };
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                if (res.status === 429) throw new Error('QUOTA_EXCEEDED');
                if (res.status === 403) throw new Error('PERMISSION_DENIED');
                // 해당 모델에서 파일 형식 미지원 → 다음 모델 시도
                continue;
            }
            const data = await res.json();
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) return text;
        } catch(e) {
            if (['QUOTA_EXCEEDED','PERMISSION_DENIED','NO_API_KEY'].includes(e.message)) throw e;
        }
    }
    throw new Error('파일 분석 모델 연결 실패');
}

// 다중 이미지 지원 Gemini Vision 호출 (자료실 이미지 파일 분석용)
async function callGeminiWithMultiImage(textPrompt, imageParts) {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('NO_API_KEY');

    const modelsToTry = [
        { name: 'gemini-2.5-flash-preview-04-17', ver: 'v1beta' },
        { name: 'gemini-2.0-flash', ver: 'v1beta' },
        { name: 'gemini-1.5-pro', ver: 'v1beta' },
        { name: 'gemini-1.5-flash', ver: 'v1beta' },
    ];

    for (const model of modelsToTry) {
        try {
            const url = `https://generativelanguage.googleapis.com/${model.ver}/models/${model.name}:generateContent?key=${apiKey}`;
            const payload = {
                contents: [{
                    role: 'user',
                    parts: [{ text: textPrompt }, ...imageParts]
                }],
                generationConfig: { temperature: 0.3, maxOutputTokens: 65536 }
            };
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) { if (res.status === 429) throw new Error('QUOTA_EXCEEDED'); continue; }
            const data = await res.json();
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) return text;
        } catch(e) {
            if (e.message === 'QUOTA_EXCEEDED') throw e;
        }
    }
    return await callGemini('', textPrompt); // 이미지 분석 실패 시 텍스트로 폴백
}

// 채팅 말풍선 추가
function appendChatBubble(role, text, file = null) {
    const histEl = document.getElementById('chat-history');
    if (!histEl) return;
    const div = document.createElement('div');

    if (role === 'user') {
        div.className = 'chat-msg-user';
        const fileHtml = file ? `<div class="chat-bubble-file"><i class="fas fa-paperclip"></i>${escHtml(file.name)}</div>` : '';
        div.innerHTML = `<div class="chat-bubble-user">${escapeHtml(text)}${fileHtml}</div>`;
        histEl.appendChild(div);
        setTimeout(() => histEl.scrollTop = histEl.scrollHeight, 50);
    } else {
        div.className = 'chat-msg-ai';
        div.innerHTML = `
            <div class="chat-ai-avatar">🤖</div>
            <div class="chat-bubble-ai">${markdownToHtml(text)}</div>`;
        histEl.appendChild(div);
        
        // ★ AI 답변에 관련 파일 버튼 삽입
        requestAnimationFrame(async () => {
            const bubbleEl = div.querySelector('.chat-bubble-ai');
            if (bubbleEl) {
                try {
                    // 캐시된 base_forms, user_forms 사용
                    const bAll = window._baseFormsCache || _dbCache.base_forms || await fetchAllPages('base_forms');
                    const uAll = window._userFormsCache || _dbCache.user_forms || await fetchAllPages('user_forms');
                    if (!window._baseFormsCache) window._baseFormsCache = bAll;
                    if (!window._userFormsCache) window._userFormsCache = uAll;
                    
                    // 인라인 파일 버튼 삽입
                    await _injectInlineFormButtons(bubbleEl, state.questionText, text, state.selectedDept, bAll, uAll);
                } catch(e) {
                    console.warn('[채팅 버블] 관련 파일 버튼 삽입 실패:', e.message);
                }
            }
        });
        
        setTimeout(() => {
            div.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 80);
    }
}

// 로딩 말풍선
function appendChatLoading() {
    const histEl = document.getElementById('chat-history');
    if (!histEl) return null;
    const id = 'chat-loading-' + Date.now();
    const div = document.createElement('div');
    div.className = 'chat-msg-ai';
    div.id = id;
    div.innerHTML = `
        <div class="chat-ai-avatar">🤖</div>
        <div class="chat-bubble-ai chat-loading-bubble">
            <span class="chat-dot"></span>
            <span class="chat-dot"></span>
            <span class="chat-dot"></span>
        </div>`;
    histEl.appendChild(div);
    setTimeout(() => histEl.scrollTop = histEl.scrollHeight, 50);
    return id;
}

function removeChatLoading(id) {
    if (!id) return;
    const el = document.getElementById(id);
    if (el) el.remove();
}

// 채팅 대화 영역 초기화 (새 질문 시)
function resetChatConversation() {
    const histEl = document.getElementById('chat-history');
    if (histEl) histEl.innerHTML = '';
    const chatInput = document.getElementById('chat-input');
    if (chatInput) { chatInput.value = ''; chatInput.style.height = 'auto'; }
    clearChatFile();
    const sendBtn = document.getElementById('chat-send-btn');
    if (sendBtn) sendBtn.disabled = true;
}

// 히스토리에서 대화 이어하기
function continueConversation(histId) {
    const item = state.history.find(h => h.id == histId);
    if (!item) return;

    // 본인 항목인지 확인
    const me = (typeof authState !== 'undefined' && authState.currentUser) ? authState.currentUser.user_id : null;
    const isOwner = !item.user_id || !me || item.user_id === me;

    if (!isOwner) {
        // 타인 항목: 질문 내용과 요약만 모달로 표시
        showHistoryReadOnly(item);
        return;
    }

    state.selectedDept     = item.dept;
    state.questionText     = item.question;
    state.currentAiAnswer  = item.fullAnswer || item.answer || '';
    state.currentSessionId = item.id;
    state.conversationHistory = [];

    // ── 부서 선택 UI 업데이트 ──
    document.querySelectorAll('.dept-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.dept === item.dept);
    });
    const deptDisplay = document.getElementById('selected-dept-display');
    if (deptDisplay) deptDisplay.textContent = item.dept || '';

    // ── 질문 입력창 업데이트 ──
    const qInput = document.getElementById('question-input');
    if (qInput) qInput.value = item.question || '';

    navigateTo('answer');
    updateBottomNav('question');

    setTimeout(async () => {
        const content = document.getElementById('answer-content');
        const loading = document.getElementById('answer-loading');
        const error   = document.getElementById('answer-error');
        if (loading) loading.classList.add('hidden');
        if (error)   error.classList.add('hidden');
        if (content) content.classList.remove('hidden');

        // AI 답변 렌더링
        renderAiAnswer(state.currentAiAnswer);

        // ── 관련 서식 버튼 삽입 (캐시 우선) ──
        requestAnimationFrame(async () => {
            try {
                let bAll = _bAll || window._baseFormsCache || _dbCache.base_forms;
                let uAll = _uAll || window._userFormsCache || _dbCache.user_forms;
                if (!bAll) bAll = await fetchAllPages('base_forms');
                if (!uAll) uAll = await fetchAllPages('user_forms');
                if (!window._baseFormsCache) window._baseFormsCache = bAll;
                if (!window._userFormsCache) window._userFormsCache = uAll;
                findAndShowRelatedForms(state.questionText, state.currentAiAnswer, state.selectedDept, bAll, uAll);
            } catch(e) {
                console.warn('[히스토리 복원] 관련 서식 로드 실패:', e.message);
            }
        });

        // 기존 대화 복원
        resetChatConversation();
        appendChatBubble('ai', state.currentAiAnswer);

        if (item.conversation && item.conversation.length > 0) {
            item.conversation.forEach(c => {
                appendChatBubble(c.role, c.text);
                state.conversationHistory.push({ role: c.role, text: c.text });
            });
        }

        // ── 추가 질문 입력창 표시 보장 ──
        const chatInput = document.getElementById('chat-input-area');
        if (chatInput) chatInput.style.display = '';
        const chatWrap = document.getElementById('chat-area-wrap');
        if (chatWrap) chatWrap.classList.remove('hidden');

        showToast('💬 이전 대화를 불러왔습니다. 이어서 질문하세요!');
    }, 200);
}

// 타인 히스토리 읽기 전용 모달
function showHistoryReadOnly(item) {
    const deptLabel = (typeof DEPT_LABEL !== 'undefined' && DEPT_LABEL[item.dept]) || item.dept || '';
    const summary   = item.summary || (item.answer || '').slice(0, 200);
    const esc = s => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');

    let modal = document.getElementById('hist-readonly-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'hist-readonly-modal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
        modal.onclick = e => { if (e.target === modal) modal.remove(); };
        document.body.appendChild(modal);
    }
    modal.innerHTML = `
        <div style="background:#fff;border-radius:16px;padding:24px;max-width:520px;width:100%;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <span style="font-size:13px;background:#ede9fe;color:#7c3aed;padding:4px 10px;border-radius:20px;">${esc(deptLabel)}</span>
                <button onclick="document.getElementById('hist-readonly-modal').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#6b7280;">✕</button>
            </div>
            <div style="font-weight:700;font-size:16px;color:#1e293b;margin-bottom:12px;">${esc(item.question||'')}</div>
            <div style="font-size:13px;color:#64748b;line-height:1.7;padding:12px;background:#f8fafc;border-radius:8px;">${esc(summary)}${(item.answer||'').length > 200 ? '…' : ''}</div>
            <div style="margin-top:12px;font-size:12px;color:#94a3b8;text-align:right;">
                <i class="fas fa-lock"></i> 타인의 질문은 내용만 열람 가능합니다
            </div>
        </div>`;
}

// resetFollowupPanel 호환용 (resetAll에서 호출)
function resetFollowupPanel() {
    state.conversationHistory = [];
    resetChatConversation();
}

// HTML 이스케이프 (사용자 입력 표시용)
function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
}

function copyAnswerText() {
    const body = document.getElementById('ai-answer-body');
    const text = body ? body.innerText : '';
    if (navigator.clipboard && text) {
        navigator.clipboard.writeText(text).then(() => showToast('📋 답변이 클립보드에 복사되었습니다'));
    } else {
        showToast('이 브라우저는 복사 기능을 지원하지 않습니다');
    }
}

let toastTimer = null;
function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.remove('hidden');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add('hidden'), 3500);
}

// ============================================================
// 서식 업로드 모달 (가~라 4단계)
// ============================================================
const umState = {
    step: 1,
    title: '',
    desc: '',
    dept: '',
    file: null,
    fileData: ''
};

// ── 헬퍼: hidden 대신 전용 CSS 클래스 사용 ──────────────────
function umShow(el) { if (el) el.classList.remove('um-hidden'); }
function umHide(el) { if (el) el.classList.add('um-hidden'); }

function openUploadModal(preDept = '') {
    umReset();
    if (preDept) {
        umState.dept = preDept;
        document.querySelectorAll('.um-dept-btn').forEach(b => {
            b.classList.toggle('selected', b.dataset.dept === preDept);
        });
        const badge = document.getElementById('um-selected-dept-badge');
        document.getElementById('um-selected-dept-name').textContent = preDept;
        if (badge) badge.style.display = 'block';
    }
    document.getElementById('upload-modal').classList.remove('hidden');
}
function openUploadModalWithDept(dept) {
    if (!requireLogin('upload')) return;
    openUploadModal(dept);
}
function closeUploadModal() {
    document.getElementById('upload-modal').classList.add('hidden');
}

// ============================================================
// 매뉴얼 모달
// ============================================================
let _manualCurrentTab = 'user'; // 'user' | 'admin'

function openManualModal(tab) {
    // 탭 기본값: 관리자면 admin, 아니면 user
    const isAdmin = typeof authState !== 'undefined' &&
        (authState.isAdmin || (authState.currentUser && authState.currentUser.user_id === ADMIN_ID));

    // tab 인자 없으면 role 기반으로 자동 결정
    if (!tab) tab = isAdmin ? 'admin' : 'user';

    // 관리자 탭 버튼 표시/숨김
    const adminTabBtn = document.getElementById('manual-tab-admin-btn');
    if (adminTabBtn) adminTabBtn.style.display = isAdmin ? '' : 'none';

    _manualCurrentTab = tab;
    _loadManualIframe(tab);

    // 탭 active 상태
    document.querySelectorAll('.manual-tab').forEach(t => t.classList.remove('active'));
    // user → manual-tab-user, admin → manual-tab-admin-btn
    const activeTabId = tab === 'admin' ? 'manual-tab-admin-btn' : 'manual-tab-user';
    const activeTab = document.getElementById(activeTabId);
    if (activeTab) activeTab.classList.add('active');

    document.getElementById('manual-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeManualModal() {
    document.getElementById('manual-modal').classList.add('hidden');
    document.body.style.overflow = '';
    // iframe src 초기화 (메모리 절약)
    const iframe = document.getElementById('manual-iframe');
    if (iframe) iframe.src = '';
}

function switchManualTab(tab) {
    const isAdmin = typeof authState !== 'undefined' &&
        (authState.isAdmin || (authState.currentUser && authState.currentUser.user_id === ADMIN_ID));
    if (tab === 'admin' && !isAdmin) {
        showToast('⛔ 관리자 매뉴얼은 관리자만 열람할 수 있습니다.');
        return;
    }
    _manualCurrentTab = tab;
    _loadManualIframe(tab);
    document.querySelectorAll('.manual-tab').forEach(t => t.classList.remove('active'));
    const activeTabId2 = tab === 'admin' ? 'manual-tab-admin-btn' : 'manual-tab-user';
    const activeTab = document.getElementById(activeTabId2);
    if (activeTab) activeTab.classList.add('active');
}

function _loadManualIframe(tab) {
    const iframe = document.getElementById('manual-iframe');
    if (!iframe) return;
    // 현재 앱 경로 기준 상대 URL
    const base = window.location.href.replace(/\/[^/]*$/, '/');
    iframe.src = base + (tab === 'admin' ? 'manual_admin.html' : 'manual_user.html');
}

function openManualNewTab() {
    const base = window.location.href.replace(/\/[^/]*$/, '/');
    const url  = base + (_manualCurrentTab === 'admin' ? 'manual_admin.html' : 'manual_user.html');
    window.open(url, '_blank');
}

function umReset() {
    umState.step = 1;
    umState.title = '';
    umState.desc  = '';
    umState.dept  = '';
    umState.file  = null;
    umState.fileData = '';

    const titleInput = document.getElementById('um-input-title');
    const descInput  = document.getElementById('um-input-desc');
    const titleCount = document.getElementById('um-title-count');
    const badge      = document.getElementById('um-selected-dept-badge');
    const fileDrop   = document.getElementById('um-file-drop');
    const fileSelected = document.getElementById('um-file-selected');
    const fileInput  = document.getElementById('um-file-input');
    const savingEl   = document.getElementById('um-saving');

    if (titleInput)   titleInput.value = '';
    if (descInput)    descInput.value  = '';
    if (titleCount)   titleCount.textContent = '0 / 60자';
    if (badge)        badge.style.display = 'none';
    if (savingEl)     savingEl.style.display = 'none';
    if (fileInput)    fileInput.value = '';

    document.querySelectorAll('.um-dept-btn').forEach(b => b.classList.remove('selected'));
    document.querySelectorAll('.um-error').forEach(e => { e.style.display = 'none'; });

    // 파일 영역 초기화
    if (fileDrop)     fileDrop.style.display = 'flex';
    if (fileSelected) fileSelected.style.display = 'none';

    umGoStep(1);
}

function umGoStep(step) {
    // 모든 패널 숨기기
    document.querySelectorAll('.um-panel').forEach(p => p.classList.remove('active'));

    // 해당 패널 활성화
    const panel = document.getElementById(`um-panel-${step}`);
    if (panel) panel.classList.add('active');

    // 단계 인디케이터
    ['um-s1','um-s2','um-s3','um-s4'].forEach((id, i) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.remove('active', 'done');
        if (i + 1 < step)        el.classList.add('done');
        else if (i + 1 === step) el.classList.add('active');
    });

    // 하단 버튼
    const prevBtn = document.getElementById('um-btn-prev');
    const nextBtn = document.getElementById('um-btn-next');
    const footer  = document.getElementById('um-footer');

    if (step === 'done') {
        if (footer) footer.style.display = 'none';
        return;
    }
    if (footer) footer.style.display = '';

    if (prevBtn) prevBtn.style.display = (step === 1) ? 'none' : '';
    if (nextBtn) {
        nextBtn.innerHTML = (step === 4)
            ? '<i class="fas fa-save"></i> 저장하기'
            : '다음 <i class="fas fa-chevron-right"></i>';
    }

    umState.step = step;
    const titleEl = document.getElementById('um-title');
    if (titleEl) {
        titleEl.textContent = ['가. 제목 입력', '나. 부서 선택', '다. 파일 선택', '라. 확인 및 저장'][step - 1];
    }
}

function umSetFile(file) {
    const allowed = ['hwpx','hwp','pdf','xlsx','xls','docx','doc','ppt','pptx','hwt'];
    const ext = file.name.split('.').pop().toLowerCase();
    if (!allowed.includes(ext)) {
        showToast('❌ 지원하지 않는 형식입니다 (hwp·pdf·xlsx·docx·ppt 등)');
        return;
    }
    // 파일 크기 제한 없음 (모든 용량 허용)
    umState.file = file;
    const nameEl = document.getElementById('um-file-name-display');
    const sizeEl = document.getElementById('um-file-size-display');
    const errEl  = document.getElementById('um-err-3');
    const fileDrop    = document.getElementById('um-file-drop');
    const fileSelected = document.getElementById('um-file-selected');

    if (nameEl) nameEl.textContent = file.name;
    if (sizeEl) sizeEl.textContent = umFormatSize(file.size);
    if (fileDrop)     fileDrop.style.display = 'none';
    if (fileSelected) fileSelected.style.display = 'flex';
    if (errEl)        errEl.style.display = 'none';
}

function umFormatSize(bytes) {
    if (bytes < 1024)       return bytes + 'B';
    if (bytes < 1024*1024)  return (bytes / 1024).toFixed(1) + 'KB';
    return (bytes / (1024*1024)).toFixed(1) + 'MB';
}

// ── 제목 유사도 계산 (0~1): 공백·특수문자 제거 후 공통 문자 비율 ──────────
function umTitleSimilarity(a, b) {
    const normalize = s => s.replace(/[\s\-_\(\)\[\]·\.]/g, '').toLowerCase();
    const na = normalize(a), nb = normalize(b);
    if (!na || !nb) return 0;
    if (na === nb) return 1;
    const longer = na.length > nb.length ? na : nb;
    const shorter = na.length > nb.length ? nb : na;
    let matches = 0;
    for (let i = 0; i < shorter.length; i++) {
        if (longer.includes(shorter[i])) matches++;
    }
    return matches / longer.length;
}

// ── 중복 파일 감지: base_forms + user_forms에서 동일/유사 파일 검색 ────────
async function umCheckDuplicate(title, fileSize) {
    try {
        // ★ fetchAllPages 사용 (캐시 활용 + 전체 페이지 순회 보장)
        const [bData, uData] = await Promise.all([
            fetchAllPages('base_forms', false),
            fetchAllPages('user_forms', false)
        ]);
        const allForms = [...bData, ...uData];

        for (const form of allForms) {
            const existTitle = form.title || form.name || '';
            const existSize  = form.file_size || '';
            const sim = umTitleSimilarity(title, existTitle);
            // 조건: 제목 유사도 85% 이상 OR (유사도 70% 이상 & 파일 크기 동일)
            const sizeMatch = existSize && existSize === fileSize;
            if (sim >= 0.85 || (sim >= 0.70 && sizeMatch)) {
                return {
                    isDuplicate: true,
                    similarity: Math.round(sim * 100),
                    existTitle,
                    existDept: form.dept || '',
                    sizeMatch
                };
            }
        }
    } catch(e) {
        console.warn('[중복감지] 오류 (건너뜀):', e.message);
    }
    return { isDuplicate: false };
}

async function umSave() {
    const savingEl = document.getElementById('um-saving');
    const nextBtn  = document.getElementById('um-btn-next');
    if (savingEl) savingEl.style.display = 'flex';
    if (nextBtn)  nextBtn.disabled = true;

    try {
        // ── 중복 파일 감지 (저장 전 체크) ────────────────────────────────
        const fileSizeStr = umFormatSize(umState.file.size);
        const dupResult = await umCheckDuplicate(umState.title, fileSizeStr);
        if (dupResult.isDuplicate) {
            if (savingEl) savingEl.style.display = 'none';
            if (nextBtn)  nextBtn.disabled = false;

            const detail = dupResult.sizeMatch
                ? `제목 유사도 ${dupResult.similarity}% · 파일 크기 동일`
                : `제목 유사도 ${dupResult.similarity}%`;
            const confirmed = window.confirm(
                `⚠️ 중복 파일이 감지되었습니다.\n\n` +
                `기존 파일: "${dupResult.existTitle}"` +
                (dupResult.existDept ? ` [${dupResult.existDept}]` : '') + `\n` +
                `${detail}\n\n` +
                `이미 자료실에 동일하거나 유사한 파일이 있습니다.\n` +
                `그래도 업로드하시겠습니까?\n(확인: 계속 업로드 / 취소: 중단)`
            );
            if (!confirmed) {
                showToast('⛔ 중복 파일이므로 업로드를 취소했습니다.');
                return;
            }
            // 확인 클릭 시 savingEl 다시 표시
            if (savingEl) savingEl.style.display = 'flex';
            if (nextBtn)  nextBtn.disabled = true;
        }

        const base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload  = e => resolve(e.target.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(umState.file);
        });

        // ★ 업로드 유도 모달에서 지정한 제목이 있으면 원래 파일명 대신 사용
        const nudgeBaseId = (document.getElementById('um-base-form-id')?.value || '').trim();
        const isNudgeUpload = !!nudgeBaseId;  // 메타데이터 매칭 업로드 여부

        const ext = umState.file.name.split('.').pop().toLowerCase();
        // ★ 파일명을 제목 기반으로 자동 통일 (원래 데이터와 이름 일치)
        const normalizedFileName = umState.title
            ? `${umState.title.replace(/[\\/:\*\?"<>|]/g, '_')}.${ext}`
            : umState.file.name;
        const payload = {
            name:           umState.title,
            dept:           umState.dept,
            file_name:      normalizedFileName,  // ★ 제목 기반으로 자동 통일
            file_size:      umFormatSize(umState.file.size),
            file_type:      ext,
            file_data:      base64,
            has_file:       true,        // ★ 실제 파일 데이터 보유 플래그 (백업/검색 포함 여부)
            desc:           umState.desc,
            uploaded_at:    new Date().toLocaleString('ko-KR'),
            uploader_id:    getCurrentUserId() || 'anonymous',
            approved:       'pending',   // 관리자 승인 필요
            base_form_ref:  nudgeBaseId  // ★ 메타데이터 매칭 참조 ID (승인 시 150P 부여 판단)
        };

        const res = await fetch(apiUrl('tables/user_forms'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('저장 실패 (HTTP ' + res.status + ')');

        // 완료
        const doneMsg = document.getElementById('um-done-msg');
        if (doneMsg) doneMsg.textContent = `"${umState.title}" 서식이 업로드되었습니다! 관리자 승인 후 [${umState.dept}] 자료실에 공개됩니다.`;
        document.querySelectorAll('.um-panel').forEach(p => p.classList.remove('active'));
        const panelDone = document.getElementById('um-panel-done');
        if (panelDone) panelDone.classList.add('active');
        const footer = document.getElementById('um-footer');
        if (footer) footer.style.display = 'none';
        ['um-s1','um-s2','um-s3','um-s4'].forEach(id => {
            const el = document.getElementById(id);
            if (el) { el.classList.remove('active'); el.classList.add('done'); }
        });

        // ★ 포인트 안내 표시
        const pointWrap = document.getElementById('um-point-result-wrap');
        if (isNudgeUpload) {
            // 메타데이터 매칭 업로드 → 150P 안내 강조
            if (pointWrap) pointWrap.classList.remove('hidden');
            if (doneMsg) doneMsg.textContent = `"${umState.title}" 파일이 업로드되었습니다!`;
        } else {
            if (pointWrap) pointWrap.classList.add('hidden');
        }
        // 숨김 필드 초기화
        const hiddenBfId = document.getElementById('um-base-form-id');
        if (hiddenBfId) hiddenBfId.value = '';

        // 포인트 적립 (100P) - 기본 업로드 포인트 (메타데이터 매칭 150P는 관리자 승인 시 추가)
        const uploaderUid = getCurrentUserId();
        if (uploaderUid) {
            await addUploadPoints(uploaderUid, 100);
        }

        // ★ 캐시 무효화 → 자료실 및 AI 검색에 즉시 반영
        if (typeof invalidateDbCache === 'function') {
            invalidateDbCache('user_forms');
        }
        // window 캐시도 초기화 (AI 질문 시 최신 파일 포함)
        window._userFormsCache = null;

        // ★ Gemini 지식 추출 (비동기 – 완료 기다리지 않음)
        const savedRecord = await res.json().catch(() => ({}));
        const savedId = savedRecord.id || '';
        if (savedId) {
            extractAndSaveFormKnowledge(
                savedId, 'user_forms',
                umState.dept, umState.title,
                (umState.file.name.split('.').pop().toLowerCase()),
                base64
            );
        }

    } catch(e) {
        showToast('❌ 저장 중 오류: ' + e.message);
    } finally {
        if (savingEl) savingEl.style.display = 'none';
        if (nextBtn)  nextBtn.disabled = false;
    }
}

// ── 모달 이벤트 바인딩 (initApp에서 호출) ───────────────────
function initUploadModal() {
    // 닫기
    const closeBtn = document.getElementById('um-close');
    if (closeBtn) closeBtn.addEventListener('click', closeUploadModal);

    // 오버레이 클릭 닫기
    const overlay = document.getElementById('upload-modal');
    if (overlay) {
        overlay.addEventListener('click', e => {
            if (e.target === overlay) closeUploadModal();
        });
    }

    // 다음 버튼
    const nextBtn = document.getElementById('um-btn-next');
    if (nextBtn) {
        nextBtn.addEventListener('click', async () => {
            const step = umState.step;

            if (step === 1) {
                const t = document.getElementById('um-input-title').value.trim();
                const errEl = document.getElementById('um-err-1');
                if (!t) { if(errEl) errEl.style.display = 'block'; return; }
                if (errEl) errEl.style.display = 'none';
                umState.title = t;
                umState.desc  = (document.getElementById('um-input-desc').value || '').trim();
                umGoStep(2);

            } else if (step === 2) {
                const errEl = document.getElementById('um-err-2');
                if (!umState.dept) { if(errEl) errEl.style.display = 'block'; return; }
                if (errEl) errEl.style.display = 'none';
                umGoStep(3);

            } else if (step === 3) {
                const errEl = document.getElementById('um-err-3');
                if (!umState.file) { if(errEl) errEl.style.display = 'block'; return; }
                if (errEl) errEl.style.display = 'none';
                document.getElementById('uc-title').textContent = umState.title;
                document.getElementById('uc-dept').textContent  = umState.dept;
                document.getElementById('uc-file').textContent  = `${umState.file.name} (${umFormatSize(umState.file.size)})`;
                document.getElementById('uc-desc').textContent  = umState.desc || '(설명 없음)';
                umGoStep(4);

            } else if (step === 4) {
                await umSave();
            }
        });
    }

    // 이전 버튼
    const prevBtn = document.getElementById('um-btn-prev');
    if (prevBtn) prevBtn.addEventListener('click', () => {
        if (umState.step > 1) umGoStep(umState.step - 1);
    });

    // 완료 후 버튼
    const anotherBtn = document.getElementById('um-btn-another');
    if (anotherBtn) anotherBtn.addEventListener('click', () => umReset());

    const closeDoneBtn = document.getElementById('um-btn-close-done');
    if (closeDoneBtn) closeDoneBtn.addEventListener('click', () => {
        closeUploadModal();
        const activeFilter = document.querySelector('.filter-btn.active')?.dataset.filter || 'all';
        renderFormsPage(activeFilter);
    });

    // 부서 선택 버튼
    document.querySelectorAll('.um-dept-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.um-dept-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            umState.dept = btn.dataset.dept;
            const badge = document.getElementById('um-selected-dept-badge');
            const nameEl = document.getElementById('um-selected-dept-name');
            if (nameEl) nameEl.textContent = umState.dept;
            if (badge) badge.style.display = 'block';
            const errEl = document.getElementById('um-err-2');
            if (errEl) errEl.style.display = 'none';
        });
    });

    // 제목 글자 수
    const titleInput = document.getElementById('um-input-title');
    if (titleInput) {
        titleInput.addEventListener('input', e => {
            const cnt = document.getElementById('um-title-count');
            if (cnt) cnt.textContent = `${e.target.value.length} / 60자`;
        });
        // Enter 키로 다음 단계
        titleInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                document.getElementById('um-btn-next')?.click();
            }
        });
    }

    // 파일 드롭존
    const fileInput = document.getElementById('um-file-input');
    const fileDrop  = document.getElementById('um-file-drop');

    if (fileDrop && fileInput) {
        // 클릭 → 파일 탐색기 열기
        fileDrop.addEventListener('click', (e) => {
            e.stopPropagation();
            fileInput.click();
        });
        fileDrop.addEventListener('dragover', e => {
            e.preventDefault();
            fileDrop.classList.add('drag-over');
        });
        fileDrop.addEventListener('dragleave', () => fileDrop.classList.remove('drag-over'));
        fileDrop.addEventListener('drop', e => {
            e.preventDefault();
            fileDrop.classList.remove('drag-over');
            const f = e.dataTransfer.files[0];
            if (f) umSetFile(f);
        });
    }

    if (fileInput) {
        fileInput.addEventListener('change', e => {
            if (e.target.files[0]) umSetFile(e.target.files[0]);
        });
    }

    // 파일 제거 버튼
    const removeBtn = document.getElementById('um-file-remove');
    if (removeBtn) {
        removeBtn.addEventListener('click', () => {
            umState.file = null;
            umState.fileData = '';
            const fd = document.getElementById('um-file-drop');
            const fs = document.getElementById('um-file-selected');
            const fi = document.getElementById('um-file-input');
            if (fd) fd.style.display = 'flex';
            if (fs) fs.style.display = 'none';
            if (fi) fi.value = '';
        });
    }
}

// ============================================================
// 커뮤니티 게시판
// ============================================================
let boardCurrentPage = 1;
let boardCurrentCat  = 'all';
let boardEditingId   = null; // 수정 중인 게시글 ID

const BOARD_PAGE_SIZE = 15;

const BOARD_CAT_LABELS = {
    general:    '💬 일반',
    suggestion: '💡 제안',
    inquiry:    '❓ 문의',
    request:    '📂 자료요청',
    bugreport:  '🚨 파일오류신고'
};
const BOARD_CAT_CLS = {
    general:    'cat-general',
    suggestion: 'cat-suggestion',
    inquiry:    'cat-inquiry',
    request:    'cat-request',
    bugreport:  'cat-bugreport'
};

// 카테고리별 안내 문구
const BOARD_CAT_GUIDES = {
    general: {
        icon: '💬', cls: 'bw-guide-general',
        title: '일반',
        desc: '자유롭게 생각을 공유하거나 연수 소식, 좋은 정보를 나눌 때 사용하세요. 교직원으로서 도움이 될 만한 리소스, 유용한 연수 정보 등을 자유롭게 올려주세요.'
    },
    suggestion: {
        icon: '💡', cls: 'bw-guide-suggestion',
        title: '제안',
        desc: '시스템 기능 개선, UI/UX 향상, 새로운 기능 요청 등 애플리케이션 개선에 대한 아이디어를 제안해주세요. 여러분의 의견이 성능 향상으로 이어집니다.'
    },
    inquiry: {
        icon: '❓', cls: 'bw-guide-inquiry',
        title: '문의',
        desc: '앱 사용 중 어려운 점, 사용 방법 문의, 연수 제휴 안내 등을 문의해 주세요. 관리자가 확인 후 답변해 드립니다.'
    },
    request: {
        icon: '📂', cls: 'bw-guide-request',
        title: '자료 요청',
        desc: '직무에 필요한 서식이나 자료를 급하게 요청하는 공간입니다. 필요한 자료명을 정확히 적어주시면 다른 사용자나 관리자가 빠르게 도움을 드릴 수 있습니다.'
    },
    bugreport: {
        icon: '🚨', cls: 'bw-guide-bugreport',
        title: '파일 오류 신고',
        desc: '다운로드 파일의 제목과 실제 파일이 다르거나, 시스템이 의도와 다르게 동작하는 경우, 또는 오류가 발생하는 경우에 신고해 주세요. 어떤 파일인지, 어떤 상황인지를 구체적으로 적어주세요.'
    }
};

// 게시판 검색어 상태
let boardSearchQuery = '';

function boardSearchChanged() {
    const inp = document.getElementById('board-search-input');
    if (!inp) return;
    boardSearchQuery = inp.value.trim();
    const clearBtn = document.getElementById('board-search-clear');
    if (clearBtn) clearBtn.style.display = boardSearchQuery ? 'block' : 'none';
    boardCurrentPage = 1;
    renderBoardPage();
}

function boardClearSearch() {
    boardSearchQuery = '';
    const inp = document.getElementById('board-search-input');
    if (inp) inp.value = '';
    const clearBtn = document.getElementById('board-search-clear');
    if (clearBtn) clearBtn.style.display = 'none';
    boardCurrentPage = 1;
    renderBoardPage();
}

async function renderBoardPage() {
    const listEl = document.getElementById('board-list');
    const pageEl = document.getElementById('board-pagination');
    if (!listEl) return;
    listEl.innerHTML = `<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>불러오는 중...</p></div>`;
    // 게시판 공지 갱신
    loadBoardPinnedNotices();

    try {
        const res = await fetch(apiUrl(`tables/board_posts?limit=2000&sort=created_at`));
        if (!res.ok) {
            const errText = await res.text().catch(()=>'');
            if (res.status === 422 || res.status === 404) {
                // 테이블이 아직 생성되지 않은 경우
                listEl.innerHTML = `<div class="empty-state"><i class="fas fa-comments"></i><p>게시글이 없습니다. 첫 글을 작성해보세요!</p></div>`;
                if (pageEl) pageEl.innerHTML = '';
                return;
            }
            throw new Error(`서버 오류 (${res.status})`);
        }
        const data = await res.json();
        let rows = (data.data || []).sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

        // 카테고리 필터
        if (boardCurrentCat !== 'all') {
            rows = rows.filter(r => r.category === boardCurrentCat);
        }

        const currentUserId = typeof getCurrentUserId === 'function' ? getCurrentUserId() : null;
        const isAdmin = typeof authState !== 'undefined' && authState.isAdmin;

        // 검색어 필터 (제목, 내용, 관리자 답변 포함)
        const sq = boardSearchQuery.toLowerCase();
        if (sq) {
            rows = rows.filter(r => {
                const isSecret = r.is_secret === 'true' || r.is_secret === true;
                const canRead = isAdmin || !isSecret || (currentUserId && r.author_id === currentUserId);
                if (!canRead) {
                    // 비밀글은 제목만 검색
                    return (r.title || '').toLowerCase().includes(sq);
                }
                return (r.title || '').toLowerCase().includes(sq)
                    || (r.content || '').toLowerCase().includes(sq)
                    || (r.admin_reply || '').toLowerCase().includes(sq)
                    || (r.author_id || '').toLowerCase().includes(sq);
            });
        }

        // 검색 결과 수 표시
        let countEl = document.getElementById('board-search-count');
        if (!countEl) {
            countEl = document.createElement('div');
            countEl.id = 'board-search-count';
            countEl.className = 'board-search-count';
            listEl.parentNode.insertBefore(countEl, listEl);
        }
        countEl.textContent = sq ? `검색 결과 ${rows.length}건` : '';

        if (rows.length === 0) {
            listEl.innerHTML = `<div class="empty-state"><i class="fas fa-comments"></i><p>${sq ? '검색 결과가 없습니다.' : '게시글이 없습니다. 첫 글을 작성해보세요!'}</p></div>`;
            if (pageEl) pageEl.innerHTML = '';
            return;
        }

        // 페이지네이션
        const totalPages = Math.ceil(rows.length / BOARD_PAGE_SIZE);
        if (boardCurrentPage > totalPages) boardCurrentPage = 1;
        const start = (boardCurrentPage - 1) * BOARD_PAGE_SIZE;
        const pageRows = rows.slice(start, start + BOARD_PAGE_SIZE);

        // 검색어 하이라이트 헬퍼
        const hlBoard = (txt, keyword) => {
            if (!keyword || !txt) return txt || '';
            const esc = txt.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            if (!keyword) return esc;
            const re = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'gi');
            return esc.replace(re, m => `<mark class="highlight">${m}</mark>`);
        };

        listEl.innerHTML = pageRows.map(r => {
            const cat = r.category || 'general';
            const catLabel = BOARD_CAT_LABELS[cat] || '💬 일반';
            const catCls   = BOARD_CAT_CLS[cat] || 'cat-general';
            const dateStr = r.created_at_str || (r.created_at ? new Date(r.created_at).toLocaleDateString('ko-KR') : '');
            const canDelete = isAdmin || (currentUserId && r.author_id === currentUserId);
            const hasReply  = !!(r.admin_reply && r.admin_reply.trim());
            // 비밀글 처리
            const isSecret  = r.is_secret === 'true' || r.is_secret === true;
            const canRead   = isAdmin || !isSecret || (currentUserId && r.author_id === currentUserId);
            const titleDisp = canRead ? hlBoard(r.title || '(제목 없음)', sq) : (isSecret ? '🔒 ' + (r.title || '(제목 없음)') : (r.title || '(제목 없음)'));
            const rawPreview = canRead ? (r.content || '').slice(0, 80).replace(/\n/g, ' ') : null;
            const preview   = rawPreview !== null ? hlBoard(rawPreview, sq) : '🔒 비밀글입니다.';
            // 관리자 답변 검색어 일치 시 미리보기에 표시
            const replyPreview = (canRead && hasReply && sq && (r.admin_reply||'').toLowerCase().includes(sq))
                ? `<div class="board-item-admin-preview"><i class="fas fa-shield-alt"></i> ${hlBoard((r.admin_reply||'').slice(0,60), sq)}…</div>`
                : '';

            return `<div class="board-item${isSecret ? ' board-secret' : ''}" onclick="openBoardView('${r.id}')">
                <div class="board-item-header">
                    <span class="board-cat-badge ${catCls}">${catLabel}</span>
                    ${isSecret ? '<span class="board-secret-badge"><i class="fas fa-lock"></i></span>' : ''}
                    <span class="board-item-title">${titleDisp}</span>
                    ${hasReply ? `<span class="board-item-replied"><i class="fas fa-reply"></i> 답변완료</span>` : ''}
                </div>
                <div class="board-item-preview">${preview}</div>
                ${replyPreview}
                <div class="board-item-meta">
                    <span class="meta-author"><i class="fas fa-user"></i> ${r.author_id || '익명'}</span>
                    <span><i class="fas fa-calendar-alt"></i> ${dateStr}</span>
                    <span><i class="fas fa-eye"></i> ${r.views || 0}</span>
                    ${hasReply ? `<span class="meta-reply-label"><i class="fas fa-shield-alt"></i> 관리자 답변 있음</span>` : ''}
                </div>
                ${canDelete ? `<button class="board-delete-btn" onclick="event.stopPropagation(); deleteBoardPost('${r.id}', this)" title="삭제"><i class="fas fa-trash"></i></button>` : ''}
            </div>`;
        }).join('');

        // 페이지 버튼
        if (pageEl) {
            if (totalPages <= 1) { pageEl.innerHTML = ''; return; }
            let btns = '';
            for (let i = 1; i <= totalPages; i++) {
                btns += `<button class="board-page-btn ${i === boardCurrentPage ? 'active' : ''}" onclick="boardGoPage(${i})">${i}</button>`;
            }
            pageEl.innerHTML = btns;
        }
    } catch(e) {
        listEl.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>불러오기 실패: ${e.message}</p></div>`;
    }
}

function boardGoPage(page) {
    boardCurrentPage = page;
    renderBoardPage();
    document.getElementById('page-board').scrollTo(0, 0);
    window.scrollTo(0, 0);
}

async function openBoardView(postId) {
    navigateTo('board-view');
    const wrap = document.getElementById('board-view-content');
    if (!wrap) return;
    wrap.innerHTML = `<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>불러오는 중...</p></div>`;

    try {
        // 조회수 증가
        const res = await fetch(apiUrl(`tables/board_posts/${postId}`));
        if (!res.ok) throw new Error('게시글을 찾을 수 없습니다.');
        const post = await res.json();
        const newViews = (post.views || 0) + 1;
        fetch(apiUrl(`tables/board_posts/${postId}`), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ views: newViews })
        });

        const cat = post.category || 'general';
        const catLabel = BOARD_CAT_LABELS[cat] || '💬 일반';
        const catCls   = BOARD_CAT_CLS[cat] || 'cat-general';
        const dateStr  = post.created_at_str || (post.created_at ? new Date(post.created_at).toLocaleDateString('ko-KR') : '');
        const currentUserId = typeof getCurrentUserId === 'function' ? getCurrentUserId() : null;
        const isAdmin = typeof authState !== 'undefined' && authState.isAdmin;
        const isOwner = currentUserId && post.author_id === currentUserId;

        const esc = s => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

        // 비밀글 접근 제어
        const isSecret = post.is_secret === 'true' || post.is_secret === true;
        const canRead  = isAdmin || !isSecret || isOwner;
        if (!canRead) {
            wrap.innerHTML = `
                <div style="text-align:center;padding:60px 20px;">
                    <i class="fas fa-lock" style="font-size:40px;color:#6b7280;margin-bottom:16px;display:block;"></i>
                    <p style="font-size:16px;font-weight:700;color:#1e293b;">비밀글입니다</p>
                    <p style="font-size:13px;color:#6b7280;margin-top:8px;">작성자 또는 관리자만 열람할 수 있습니다.</p>
                    <button onclick="navigateTo('board')" style="margin-top:16px;padding:8px 20px;background:#6366f1;color:#fff;border:none;border-radius:8px;cursor:pointer;">
                        목록으로 돌아가기
                    </button>
                </div>`;
            return;
        }

        const content = esc(post.content || '').replace(/\n/g,'<br>');
        const hasReply = !!(post.admin_reply && post.admin_reply.trim());
        const replyStr = post.admin_reply_at || '';

        // 관리자 답변 HTML
        const replyDisplayHtml = hasReply ? `
            <div class="board-reply-box" id="bv-reply-display">
                <div class="board-reply-meta">
                    <i class="fas fa-shield-alt"></i>
                    <span>관리자</span>
                    ${replyStr ? `<span>· ${replyStr}</span>` : ''}
                    ${isAdmin ? `
                        <button class="board-reply-edit-btn" onclick="startEditAdminReply('${post.id}')"><i class="fas fa-pen"></i> 수정</button>
                        <button class="board-reply-del-btn" onclick="deleteAdminReply('${post.id}')"><i class="fas fa-trash"></i> 삭제</button>
                    ` : ''}
                </div>
                <div class="board-reply-body">${esc(post.admin_reply||'').replace(/\n/g,'<br>')}</div>
            </div>` : '';

        const replyFormHtml = isAdmin ? `
            <div class="board-reply-form" id="bv-reply-form" ${hasReply ? 'style="display:none;"' : ''}>
                <div class="board-reply-form-label"><i class="fas fa-shield-alt" style="color:#0284c7;"></i> 관리자 답변 작성</div>
                <textarea class="board-reply-textarea" id="bv-reply-input" placeholder="답변 내용을 입력하세요..." rows="4">${esc(post.admin_reply||'')}</textarea>
                <button class="board-reply-submit-btn" onclick="submitAdminReply('${post.id}')">
                    <i class="fas fa-paper-plane"></i> 답변 ${hasReply ? '수정' : '등록'}
                </button>
            </div>` : '';

        wrap.innerHTML = `
            <span class="board-view-category ${catCls}">${catLabel}</span>
            <div class="board-view-title">${esc(post.title || '(제목 없음)')}</div>
            <div class="board-view-meta">
                <span class="meta-author"><i class="fas fa-user"></i> ${post.author_id || '익명'}</span>
                <span><i class="fas fa-calendar-alt"></i> ${dateStr}</span>
                <span><i class="fas fa-eye"></i> 조회 ${newViews}</span>
            </div>
            <div class="board-view-body">${content}</div>
            <div class="board-view-actions">
                ${isOwner ? `<button class="board-edit-btn" onclick="openBoardEdit('${post.id}')"><i class="fas fa-pen"></i> 수정</button>` : ''}
                ${isAdmin ? `<button class="board-del-btn" onclick="deleteBoardPost('${post.id}', this)"><i class="fas fa-trash"></i> 삭제</button>` : ''}
            </div>
            <div class="board-reply-section">
                ${replyDisplayHtml}
                ${replyFormHtml}
            </div>`;
    } catch(e) {
        wrap.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>${e.message}</p></div>`;
    }
}

function openBoardWrite() {
    if (!requireLogin('board')) return;
    boardEditingId = null;
    document.getElementById('board-write-title-label').textContent = '새 글 작성';
    _bwSelectCat('general');
    document.getElementById('board-write-subject').value = '';
    document.getElementById('board-write-body').value = '';
    const tc = document.getElementById('bw-title-count');
    const bc = document.getElementById('bw-body-count');
    if (tc) tc.textContent = '0';
    if (bc) bc.textContent = '0';
    navigateTo('board-write');
}

/** 카테고리 카드 선택 함수 */
function _bwSelectCat(cat) {
    // hidden select 동기화
    const sel = document.getElementById('board-write-cat');
    if (sel) sel.value = cat;

    // 카드 UI 토글
    document.querySelectorAll('.bw-cat-card').forEach(card => {
        card.classList.toggle('selected', card.dataset.cat === cat);
        const radio = card.querySelector('input[type=radio]');
        if (radio) radio.checked = (card.dataset.cat === cat);
    });

    // 안내 배너 교체
    const guide = BOARD_CAT_GUIDES[cat];
    const banner = document.getElementById('bw-guide-banner');
    if (banner && guide) {
        banner.className = `bw-guide-banner ${guide.cls}`;
        banner.innerHTML = `<div class="bw-guide-icon">${guide.icon}</div>
            <div class="bw-guide-text"><strong>${guide.title}</strong><span>${guide.desc}</span></div>`;
    }
}

/** 글쓰기 페이지 이벤트 초기화 */
function initBoardWritePage() {
    // 카테고리 카드 클릭
    document.querySelectorAll('.bw-cat-card').forEach(card => {
        card.addEventListener('click', () => _bwSelectCat(card.dataset.cat));
    });

    // 제목 글자 수
    const subj = document.getElementById('board-write-subject');
    const tc   = document.getElementById('bw-title-count');
    if (subj && tc) subj.addEventListener('input', () => { tc.textContent = subj.value.length; });

    // 내용 글자 수
    const body = document.getElementById('board-write-body');
    const bc   = document.getElementById('bw-body-count');
    if (body && bc) body.addEventListener('input', () => { bc.textContent = body.value.length; });
}

function openBoardEdit(postId) {
    if (!requireLogin('board')) return;
    boardEditingId = postId;
    fetch(apiUrl(`tables/board_posts/${postId}`))
        .then(r => r.json())
        .then(post => {
            document.getElementById('board-write-title-label').textContent = '글 수정';
            const cat = post.category || 'general';
            _bwSelectCat(cat);
            document.getElementById('board-write-subject').value = post.title || '';
            document.getElementById('board-write-body').value = post.content || '';
            const tc = document.getElementById('bw-title-count');
            const bc = document.getElementById('bw-body-count');
            if (tc) tc.textContent = (post.title || '').length;
            if (bc) bc.textContent = (post.content || '').length;
            navigateTo('board-write');
        });
}

async function submitBoardPost() {
    // 카드 UI에서 선택된 카테고리 우선, 없으면 hidden select
    const selectedCard = document.querySelector('.bw-cat-card.selected');
    const cat     = selectedCard ? selectedCard.dataset.cat : (document.getElementById('board-write-cat').value || 'general');
    const title   = document.getElementById('board-write-subject').value.trim();
    const content = document.getElementById('board-write-body').value.trim();

    if (!title)   { showToast('❌ 제목을 입력해주세요.'); return; }
    if (!content) { showToast('❌ 내용을 입력해주세요.'); return; }
    if (!requireLogin('board')) return;

    const userId   = typeof getCurrentUserId === 'function' ? getCurrentUserId() : '익명';
    const fullName = (typeof authState !== 'undefined' && authState.currentUser?.full_name) || '';
    const now      = new Date();
    const dateStr  = now.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
    const secretChk = document.getElementById('board-write-secret');
    const isSecretVal = secretChk ? secretChk.checked : false;

    const btn = document.getElementById('btn-board-submit');
    if (btn) btn.disabled = true;

    try {
        if (boardEditingId) {
            // 수정
            await fetch(apiUrl(`tables/board_posts/${boardEditingId}`), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ category: cat, title, content, is_secret: isSecretVal ? 'true' : 'false' })
            });
            showToast('✅ 게시글이 수정되었습니다.');
        } else {
            // 새 등록
            await fetch(apiUrl('tables/board_posts'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    author_id:   userId,
                    author_name: fullName,
                    title,
                    content,
                    category:    cat,
                    views:       0,
                    is_secret:   isSecretVal ? 'true' : 'false',
                    created_at_str: dateStr
                })
            });
            showToast('✅ 게시글이 등록되었습니다.');
        }
        boardEditingId = null;
        boardCurrentPage = 1;
        navigateTo('board');
    } catch(e) {
        showToast('❌ 오류: ' + e.message);
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function deleteBoardPost(postId, btnEl) {
    if (!confirm('이 게시글을 삭제하시겠습니까?')) return;
    if (btnEl) btnEl.disabled = true;
    try {
        await fetch(apiUrl(`tables/board_posts/${postId}`), { method: 'DELETE' });
        showToast('🗑️ 게시글이 삭제되었습니다.');
        navigateTo('board');
        renderBoardPage();
    } catch(e) {
        showToast('❌ 삭제 실패: ' + e.message);
        if (btnEl) btnEl.disabled = false;
    }
}

// ============================================================
// 관리자 답변 기능
// ============================================================
async function submitAdminReply(postId) {
    const isAdmin = typeof authState !== 'undefined' && authState.isAdmin;
    if (!isAdmin) { showToast('⚠️ 관리자만 답변할 수 있습니다.'); return; }

    const input = document.getElementById('bv-reply-input');
    if (!input) return;
    const replyText = input.value.trim();
    if (!replyText) { showToast('❌ 답변 내용을 입력해주세요.'); return; }

    const submitBtn = document.querySelector('.board-reply-submit-btn');
    if (submitBtn) submitBtn.disabled = true;

    try {
        const now = new Date().toLocaleString('ko-KR', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
        await fetch(apiUrl(`tables/board_posts/${postId}`), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                admin_reply:    replyText,
                admin_reply_at: now
            })
        });
        showToast('✅ 답변이 등록되었습니다.');
        // 뷰 새로고침
        openBoardView(postId);
    } catch(e) {
        showToast('❌ 답변 등록 실패: ' + e.message);
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
}

function startEditAdminReply(postId) {
    const display = document.getElementById('bv-reply-display');
    const form    = document.getElementById('bv-reply-form');
    if (display) display.style.display = 'none';
    if (form)    form.style.display    = 'flex';
    const submitBtn = form && form.querySelector('.board-reply-submit-btn');
    if (submitBtn) submitBtn.innerHTML = '<i class="fas fa-check"></i> 답변 수정';
}

async function deleteAdminReply(postId) {
    if (!confirm('답변을 삭제하시겠습니까?')) return;
    try {
        await fetch(apiUrl(`tables/board_posts/${postId}`), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ admin_reply: '', admin_reply_at: '' })
        });
        showToast('🗑️ 답변이 삭제되었습니다.');
        openBoardView(postId);
    } catch(e) {
        showToast('❌ 답변 삭제 실패: ' + e.message);
    }
}

// ============================================================
// 첫 로그인 튜토리얼
// ============================================================

const TUTORIAL_VERSION = 'v1';           // 버전 변경 시 모든 사용자에게 다시 표시
const TUTORIAL_TOTAL   = 4;              // 슬라이드 수 (0~3)
let   _tutStep         = 0;

/**
 * 로그인 직후 호출 – 한 번도 완료하지 않은 사용자에게만 튜토리얼 표시
 * @param {string} userId  - 현재 로그인 사용자 ID
 * @param {boolean} isAdmin - 관리자 여부 (관리자는 건너뜀)
 */
function checkAndShowTutorial(userId, isAdmin) {
    if (isAdmin) return; // 관리자는 튜토리얼 불필요
    const key = `tutorial_done_${userId}_${TUTORIAL_VERSION}`;
    if (localStorage.getItem(key)) return; // 이미 완료
    // 200ms 딜레이 후 표시 (로그인 토스트와 겹치지 않도록)
    setTimeout(() => showTutorial(), 600);
}

function showTutorial() {
    _tutStep = 0;
    const overlay = document.getElementById('tutorial-overlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    _tutRenderStep(0, false);
    // 배경 스크롤 잠금
    document.body.style.overflow = 'hidden';
}

function closeTutorial() {
    const overlay = document.getElementById('tutorial-overlay');
    if (!overlay) return;
    overlay.classList.add('hidden');
    document.body.style.overflow = '';
    // 현재 로그인 사용자에게 완료 표시
    const userId = typeof authState !== 'undefined' && authState.currentUser
        ? authState.currentUser.user_id : 'guest';
    localStorage.setItem(`tutorial_done_${userId}_${TUTORIAL_VERSION}`, '1');
}

function tutNext() {
    if (_tutStep < TUTORIAL_TOTAL - 1) {
        _tutRenderStep(_tutStep + 1, false);
    } else {
        // 마지막 슬라이드 → 완료
        closeTutorial();
        showToast('🎉 튜토리얼 완료! 이제 바로 시작해보세요.');
    }
}

function tutPrev() {
    if (_tutStep > 0) {
        _tutRenderStep(_tutStep - 1, true);
    }
}

function _tutRenderStep(step, isBack) {
    const total = TUTORIAL_TOTAL;

    // 슬라이드 전환
    document.querySelectorAll('.tutorial-slide').forEach((el, i) => {
        el.classList.remove('active', 'slide-back');
        if (i === step) {
            el.classList.add('active');
            if (isBack) el.classList.add('slide-back');
        }
    });

    // 인디케이터
    document.querySelectorAll('.tut-step-dot').forEach((dot, i) => {
        dot.classList.remove('active', 'done');
        if (i === step) dot.classList.add('active');
        else if (i < step) dot.classList.add('done');
    });

    // 진행 바 (슬라이드 끝에 도달하면 100%)
    const pct = step === total - 1 ? 100 : Math.round((step / (total - 1)) * 100);
    const fill = document.getElementById('tutorial-progress-fill');
    if (fill) fill.style.width = pct + '%';

    // 이전 버튼
    const prevBtn = document.getElementById('tut-prev-btn');
    if (prevBtn) {
        if (step === 0) prevBtn.classList.add('hidden');
        else            prevBtn.classList.remove('hidden');
    }

    // 다음/완료 버튼
    const nextBtn = document.getElementById('tut-next-btn');
    if (nextBtn) {
        if (step === total - 1) {
            nextBtn.innerHTML = '<i class="fas fa-rocket"></i> 시작하기!';
            nextBtn.classList.add('finish-btn');
        } else {
            nextBtn.innerHTML = '다음 <i class="fas fa-chevron-right"></i>';
            nextBtn.classList.remove('finish-btn');
        }
    }

    // 건너뛰기 버튼 – 마지막 슬라이드에서 숨김
    const skipBtn = document.getElementById('tut-skip-btn');
    if (skipBtn) {
        skipBtn.style.visibility = step === total - 1 ? 'hidden' : 'visible';
    }

    _tutStep = step;
}

// ============================================================
// ★ 답변 완료 시 최상단 스크롤
// ============================================================
function scrollToAnswerTop() {
    // 답변 페이지의 스크롤 가능한 컨테이너를 찾아 맨 위로 이동
    const answerPage = document.getElementById('page-answer');
    const mainContent = document.querySelector('.main-content');

    // 부드럽게 맨 위로
    if (mainContent) {
        mainContent.scrollTo({ top: 0, behavior: 'smooth' });
    }
    if (answerPage) {
        answerPage.scrollTo({ top: 0, behavior: 'smooth' });
    }
    // 윈도우 자체도 스크롤
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // answer-header-card 가 보이도록 보조 스크롤
    setTimeout(() => {
        const headerCard = document.getElementById('answer-dept-badge');
        if (headerCard) {
            headerCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, 150);
}

// ============================================================
// ★ 피드백 시스템 (도움됨 / 아쉬움 + DB 저장 + Gemini 학습)
// ============================================================

// 현재 피드백 상태 (답변마다 초기화)
let _feedbackState = {
    type: null,           // 'good' | 'bad' | null
    submitted: false,
    sessionId: null
};

/** 피드백 UI 초기화 (새 답변 렌더링 시 호출) */
function resetFeedbackUI() {
    _feedbackState = { type: null, submitted: false, sessionId: state.currentSessionId };

    // 버튼 스타일 초기화
    const goodBtn = document.getElementById('fb-good');
    const badBtn  = document.getElementById('fb-bad');
    if (goodBtn) goodBtn.className = 'feedback-btn';
    if (badBtn)  badBtn.className  = 'feedback-btn';

    // 의견 입력창 숨김
    const badBox = document.getElementById('feedback-bad-box');
    if (badBox) badBox.classList.add('hidden');

    // 완료 메시지 숨김
    const doneMsg = document.getElementById('feedback-done-msg');
    if (doneMsg) { doneMsg.classList.add('hidden'); doneMsg.className = 'feedback-done-msg hidden'; }

    // 버튼 그룹 표시
    const btns = document.getElementById('feedback-buttons');
    if (btns) btns.style.display = '';

    // 텍스트 영역 초기화
    const textarea = document.getElementById('feedback-comment-input');
    if (textarea) { textarea.value = ''; }
    const cnt = document.getElementById('feedback-comment-count');
    if (cnt) cnt.textContent = '0 / 500자';
}

/**
 * 피드백 버튼 클릭 처리
 * @param {'good'|'bad'} type
 */
async function handleFeedback(type) {
    if (_feedbackState.submitted) return; // 이미 제출됨
    _feedbackState.type = type;

    // 버튼 시각 처리
    const goodBtn = document.getElementById('fb-good');
    const badBtn  = document.getElementById('fb-bad');
    if (goodBtn) goodBtn.className = 'feedback-btn' + (type === 'good' ? ' selected-good' : '');
    if (badBtn)  badBtn.className  = 'feedback-btn' + (type === 'bad'  ? ' selected-bad'  : '');

    if (type === 'good') {
        // 도움됨 → 즉시 저장 후 완료 메시지
        await saveFeedbackToDB('good', '');
        showFeedbackDone('good');
    } else {
        // 아쉬움 → 의견 입력창 표시
        const badBox = document.getElementById('feedback-bad-box');
        if (badBox) {
            badBox.classList.remove('hidden');
            // 입력창 포커스
            setTimeout(() => {
                const ta = document.getElementById('feedback-comment-input');
                if (ta) ta.focus();
            }, 200);
        }
    }
}

/** 아쉬움 의견 전송 */
async function submitFeedbackComment(skip = false) {
    const comment = skip ? '' : (document.getElementById('feedback-comment-input')?.value || '').trim();
    await saveFeedbackToDB('bad', comment);
    showFeedbackDone('bad', comment);
}

/** 피드백 완료 메시지 표시 */
function showFeedbackDone(type, comment = '') {
    _feedbackState.submitted = true;

    // 버튼 + 입력창 숨김
    const btns   = document.getElementById('feedback-buttons');
    const badBox = document.getElementById('feedback-bad-box');
    if (btns)   btns.style.display = 'none';
    if (badBox) badBox.classList.add('hidden');

    // 완료 메시지
    const doneMsg = document.getElementById('feedback-done-msg');
    if (doneMsg) {
        if (type === 'good') {
            doneMsg.className = 'feedback-done-msg good-msg';
            doneMsg.innerHTML = '✅ 소중한 피드백 감사합니다! 다음 답변에도 이런 방식을 활용할게요 😊';
        } else {
            doneMsg.className = 'feedback-done-msg bad-msg';
            doneMsg.innerHTML = comment
                ? `📝 의견을 전달받았습니다. "<em>${escHtml(comment.slice(0,60))}${comment.length>60?'…':''}</em>"를 반영해 더 나은 답변을 드릴게요!`
                : '📝 피드백 감사합니다. 더 좋은 답변을 드리기 위해 노력하겠습니다!';
        }
        doneMsg.classList.remove('hidden');
    }
}

/**
 * 피드백 DB 저장 (ai_feedback 테이블 + chat_history 업데이트)
 */
async function saveFeedbackToDB(type, comment) {
    try {
        const userId = typeof authState !== 'undefined' && authState.currentUser
            ? authState.currentUser.user_id : '비로그인';
        const kwStr = (state.userKeywords || []).join(', ');
        const payload = {
            user_id:          userId,
            dept:             state.selectedDept || '',
            question:         (state.questionText || '').slice(0, 500),
            answer_summary:   (state.currentAiAnswer || '').slice(0, 300),
            feedback_type:    type,
            feedback_comment: comment || '',
            keywords:         kwStr,
            created_at:       new Date().toLocaleString('ko-KR')
        };
        const res = await fetch(apiUrl('tables/ai_feedback'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            console.log('[AFTER] 피드백 저장 완료:', type, comment ? '(의견 포함)' : '');
        }

        // ── chat_history의 해당 세션 피드백 업데이트 ──
        if (state.currentSessionId) {
            updateChatHistoryFeedback(state.currentSessionId, type, comment).catch(() => {});
        }
    } catch(e) {
        console.warn('[AFTER] 피드백 저장 실패 (무시):', e.message);
    }
}

/**
 * chat_history에서 session_id가 일치하는 레코드의 feedback 업데이트
 */
async function updateChatHistoryFeedback(sessionId, type, comment) {
    try {
        // session_id 로 검색 (최대 5개)
        const res = await fetch(apiUrl(`tables/chat_history?page=1&limit=5&search=${encodeURIComponent(String(sessionId))}`));
        if (!res.ok) return;
        const data = await res.json();
        const target = (data.data || []).find(r => String(r.session_id) === String(sessionId));
        if (!target) return;

        await fetch(apiUrl(`tables/chat_history/${target.id}`), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                feedback_type:    type,
                feedback_comment: comment || ''
            })
        });
        // 캐시 무효화
        _dbHistoryCache   = null;
        _dbHistoryCacheTs = 0;
    } catch(e) {
        console.warn('[피드백 히스토리 업데이트 실패]', e.message);
    }
}

// ============================================================
// ★ 빠른 검색 → 정밀 검색 전환 후 동일 질문 재실행
// ============================================================
function switchToPreciseAndRetry() {
    // 모드 전환
    setSearchMode('precise');
    showToast('🔬 정밀 검색으로 전환되었습니다. 동일한 질문으로 다시 답변을 생성합니다.');
    // 힌트 배너 숨김
    const hint = document.getElementById('fast-search-hint');
    if (hint) hint.classList.add('hidden');
    // 질문 텍스트와 부서가 남아 있으면 바로 재실행
    if (state.questionText && state.selectedDept) {
        navigateTo('answer');
        startAiAnswer();
    } else {
        // 질문 입력창으로 이동
        navigateTo('question');
    }
}

/** 텍스트 영역 글자 수 표시 (인라인 이벤트용) */
function onFeedbackCommentInput() {
    const ta  = document.getElementById('feedback-comment-input');
    const cnt = document.getElementById('feedback-comment-count');
    if (ta && cnt) cnt.textContent = `${ta.value.length} / 500자`;
}

// ============================================================
// ★ 업로드 유도 모달 (준비중·검색 버튼 클릭 시)
// ============================================================

// 현재 모달에서 다룰 파일 정보를 전역으로 보관
let _nudgeContext = { title: '', dept: '', baseFormId: '' };

/**
 * 자료 준비중 또는 메타데이터만 있는 항목의 버튼 클릭 시 호출
 * @param {string} title      - 파일 제목
 * @param {string} dept       - 부서명
 * @param {string} baseFormId - 매칭되는 base_forms 레코드 ID (없으면 '')
 */
function openUploadNudgeModal(title, dept, baseFormId) {
    if (!isLoggedIn()) {
        showToast('⚠️ 로그인 후 업로드할 수 있습니다.');
        openLoginModal();
        return;
    }
    _nudgeContext = { title, dept: dept || state.selectedDept || '', baseFormId: baseFormId || '' };
    const modal   = document.getElementById('upload-nudge-modal');
    const titleEl = document.getElementById('un-file-title');
    if (titleEl) titleEl.textContent = title || '해당 파일';
    if (modal)  modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeUploadNudgeModal() {
    const modal = document.getElementById('upload-nudge-modal');
    if (modal) modal.classList.add('hidden');
    document.body.style.overflow = '';
}

/** Yes 버튼 클릭 → 기존 업로드 모달을 열어 바로 업로드 */
function onUploadNudgeYes() {
    closeUploadNudgeModal();

    const { title, dept, baseFormId } = _nudgeContext;

    // upload-modal 열기 (부서 사전 선택)
    if (!requireLogin('upload')) return;
    openUploadModal(dept);

    // 제목도 자동 채워서 사용자 편의 증대
    setTimeout(() => {
        const titleInput = document.getElementById('um-input-title');
        if (titleInput && title) {
            titleInput.value = title;
            // umState 동기화
            if (typeof umState !== 'undefined') umState.title = title;
        }
        // baseFormId를 숨김 필드로 저장 (승인 시 메타데이터 매칭 판단용)
        const hiddenInput = document.getElementById('um-base-form-id');
        if (hiddenInput) hiddenInput.value = baseFormId || '';

        // 안내 토스트
        showToast(`📤 "${title}" 파일을 업로드해 주세요. 승인 후 150P가 적립됩니다!`);
    }, 350);
}

// 오버레이 클릭으로 닫기
document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.getElementById('upload-nudge-modal');
    if (overlay) {
        overlay.addEventListener('click', e => {
            if (e.target === overlay) closeUploadNudgeModal();
        });
    }
});

// ============================================================
// 관리자 전용 파일 교체 모달
// ============================================================
const _replaceState = {
    recordId: '',
    title: '',
    dept: '',
    fileType: '',
    currentFileName: '',
    file: null,
    fileData: null
};

/**
 * 교체 모달 열기
 * @param {string} recordId   - base_forms 레코드 ID
 * @param {string} title      - 자료 제목
 * @param {string} dept       - 부서명
 * @param {string} fileType   - 현재 파일 형식 (pdf/hwp 등)
 * @param {string} currentFileName - 현재 저장된 파일명 (없으면 '')
 */
function openReplaceFileModal(recordId, title, dept, fileType, currentFileName) {
    // 관리자만 실행 가능
    const isAdmin = typeof authState !== 'undefined' &&
        (authState.isAdmin || (authState.currentUser && authState.currentUser.user_id === ADMIN_ID));
    if (!isAdmin) { showToast('⚠️ 관리자만 사용할 수 있는 기능입니다.'); return; }

    // 상태 초기화
    _replaceState.recordId       = recordId;
    _replaceState.title          = title;
    _replaceState.dept           = dept;
    _replaceState.fileType       = fileType || 'hwp';
    _replaceState.currentFileName = currentFileName;
    _replaceState.file           = null;
    _replaceState.fileData       = null;

    // UI 업데이트
    const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    setText('replace-info-title', title || '-');
    setText('replace-info-dept',  dept  || '-');
    setText('replace-info-type',  (fileType || 'hwp').toUpperCase());
    setText('replace-file-subtitle', title || '파일을 교체합니다');

    const curRow = document.getElementById('replace-info-current-row');
    const curEl  = document.getElementById('replace-info-current');
    if (currentFileName && currentFileName.trim()) {
        if (curRow) curRow.style.display = 'flex';
        if (curEl)  { curEl.textContent = currentFileName; curEl.classList.remove('replace-info-current'); }
    } else {
        if (curRow) curRow.style.display = 'flex';
        if (curEl)  { curEl.textContent = '없음 (메타데이터만 등록됨)'; curEl.classList.add('replace-info-current'); }
    }

    // 파일 선택 UI 초기화
    clearReplaceFile();
    const warn = document.getElementById('replace-warn');
    if (warn) { warn.style.display = 'none'; warn.textContent = ''; }

    const submitBtn = document.getElementById('replace-submit-btn');
    if (submitBtn) submitBtn.disabled = true;

    // 파일 입력 accept 속성 업데이트
    const fileInput = document.getElementById('replace-file-input');
    const extMap = { pdf: '.pdf', hwp: '.hwp,.hwpx', hwpx: '.hwp,.hwpx',
                     xlsx: '.xlsx,.xls', xls: '.xlsx,.xls',
                     pptx: '.pptx,.ppt', ppt: '.pptx,.ppt' };
    if (fileInput) fileInput.accept = extMap[fileType] || '*';

    document.getElementById('replace-saving') && (document.getElementById('replace-saving').style.display = 'none');

    const modal = document.getElementById('replace-file-modal');
    if (modal) { modal.classList.remove('hidden'); document.body.style.overflow = 'hidden'; }
}

function closeReplaceFileModal() {
    const modal = document.getElementById('replace-file-modal');
    if (modal) { modal.classList.add('hidden'); document.body.style.overflow = ''; }
}

function clearReplaceFile() {
    _replaceState.file     = null;
    _replaceState.fileData = null;

    const drop   = document.getElementById('replace-drop-zone');
    const sel    = document.getElementById('replace-selected-file');
    const input  = document.getElementById('replace-file-input');
    if (drop)  drop.style.display   = 'flex';
    if (sel)   sel.style.display    = 'none';
    if (input) input.value          = '';

    const submitBtn = document.getElementById('replace-submit-btn');
    if (submitBtn) submitBtn.disabled = true;
}

function handleReplaceFileDrop(event) {
    event.preventDefault();
    document.getElementById('replace-drop-zone').classList.remove('dragover');
    const file = event.dataTransfer.files[0];
    if (file) _setReplaceFile(file);
}

function handleReplaceFileSelect(event) {
    const file = event.target.files[0];
    if (file) _setReplaceFile(file);
}

function _setReplaceFile(file) {
    const warn = document.getElementById('replace-warn');
    if (warn) { warn.style.display = 'none'; warn.textContent = ''; }

    // 파일 크기 제한 없음 (모든 용량 허용)

    // 확장자 체크
    const ext = file.name.split('.').pop().toLowerCase();
    const allowed = {
        pdf: ['pdf'], hwp: ['hwp','hwpx'], hwpx: ['hwp','hwpx'],
        xlsx: ['xlsx','xls'], xls: ['xlsx','xls'],
        pptx: ['pptx','ppt'], ppt: ['pptx','ppt']
    };
    const targetType = _replaceState.fileType;
    const validExts  = allowed[targetType] || [];
    if (validExts.length > 0 && !validExts.includes(ext)) {
        if (warn) {
            warn.textContent = `⚠️ "${(targetType).toUpperCase()}" 형식의 파일만 업로드 가능합니다 (허용: ${validExts.join(', ')})`;
            warn.style.display = 'block';
        }
        return;
    }

    _replaceState.file = file;

    // 파일명을 DB 자료명 기반으로 정규화 (title.ext)
    const safeTitle = _replaceState.title.replace(/[\\/:*?"<>|]/g, '_').trim();
    const normalizedName = `${safeTitle}.${ext}`;

    // UI 업데이트
    const drop = document.getElementById('replace-drop-zone');
    const sel  = document.getElementById('replace-selected-file');
    if (drop) drop.style.display = 'none';
    if (sel)  sel.style.display  = 'flex';

    const nameEl = document.getElementById('replace-selected-name');
    const sizeEl = document.getElementById('replace-selected-size');
    if (nameEl) nameEl.textContent = normalizedName + (normalizedName !== file.name ? ` (원본: ${file.name})` : '');
    if (sizeEl) sizeEl.textContent = `${(file.size / 1024).toFixed(1)} KB`;

    // Base64 변환
    const reader = new FileReader();
    reader.onload = (e) => {
        _replaceState.fileData = e.target.result; // data:...;base64,<data>
        const submitBtn = document.getElementById('replace-submit-btn');
        if (submitBtn) submitBtn.disabled = false;
    };
    reader.readAsDataURL(file);
}

async function submitReplaceFile() {
    if (!_replaceState.file || !_replaceState.fileData) {
        showToast('⚠️ 교체할 파일을 먼저 선택해주세요.');
        return;
    }
    const { recordId, title, fileType, file, fileData } = _replaceState;

    const submitBtn  = document.getElementById('replace-submit-btn');
    const savingEl   = document.getElementById('replace-saving');
    if (submitBtn) submitBtn.disabled = true;
    if (savingEl)  savingEl.style.display = 'block';

    try {
        // 파일명 정규화: DB 제목 기반
        const ext = file.name.split('.').pop().toLowerCase();
        const safeTitle = title.replace(/[\\/:*?"<>|]/g, '_').trim();
        const normalizedFileName = `${safeTitle}.${ext}`;

        const fileSize = file.size > 1024 * 1024
            ? `${(file.size / (1024*1024)).toFixed(1)} MB`
            : `${(file.size / 1024).toFixed(1)} KB`;

        const now = new Date().toLocaleString('ko-KR');
        const uploaderId = (authState && authState.currentUser) ? authState.currentUser.id : 'admin';

        // PATCH 요청: 실제 파일 데이터만 교체 (나머지 메타데이터는 보존)
        // fileData 는 FileReader.readAsDataURL() 결과 → "data:...;base64,XXXX" 형태
        // DB에는 순수 base64만 저장해야 하므로 헤더 부분 제거
        const pureBase64 = fileData.includes(',') ? fileData.split(',')[1] : fileData;

        const patchBody = {
            file_name:   normalizedFileName,
            file_size:   fileSize,
            file_data:   pureBase64,
            file_type:   ext === 'hwpx' ? 'hwpx' : (fileType || ext),
            has_file:    true,
            uploaded_by: uploaderId,
            uploaded_at: now
        };

        const resp = await fetch(apiUrl(`tables/base_forms/${recordId}`), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patchBody)
        });

        if (!resp.ok) throw new Error(`서버 오류: ${resp.status}`);

        // 캐시 무효화 후 목록 새로고침
        invalidateDbCache('base_forms');
        showToast(`✅ "${title}" 파일이 교체되었습니다. (${normalizedFileName})`);
        closeReplaceFileModal();

        // 자료실 화면 새로고침
        if (typeof renderFormsPage === 'function') {
            const filterEl = document.getElementById('forms-dept-select');
            const searchEl = document.getElementById('forms-search-input');
            await renderFormsPage(filterEl ? filterEl.value : 'all', searchEl ? searchEl.value : '');
        }
    } catch (err) {
        console.error('[Replace] 파일 교체 오류:', err);
        showToast(`❌ 파일 교체 실패: ${err.message}`);
    } finally {
        if (submitBtn) submitBtn.disabled = false;
        if (savingEl)  savingEl.style.display = 'none';
    }
}

// ════════════════════════════════════════════════════════════════
// ★ 접속자 Presence + 쪽지 + 1:1 대화
// ════════════════════════════════════════════════════════════════

const PRESENCE_TTL    = 3 * 60 * 1000;  // 3분 이내 heartbeat = 접속 중
const HEARTBEAT_INTERVAL = 60 * 1000;   // 60초(1분)마다 heartbeat 갱신
const ONLINE_POLL_INTERVAL = 60 * 1000; // 60초(1분)마다 목록 갱신
const CHAT_POLL_INTERVAL   = 8 * 1000;  // 8초마다 대화 폴링

let _presenceTimer   = null;
let _onlineTimer     = null;
let _chatPollTimer   = null;
let _chatWithTarget  = null; // { user_id, full_name, school, role, vip }
let _chatSessionKey  = null;
let _noteReadTarget  = null; // 현재 읽는 쪽지 발신자
let _noteCurrentTab  = 'received';

// ── 아바타 색상 (user_id 기반 결정적 색) ──────────────────────
const AVATAR_COLORS = ['#3b82f6','#8b5cf6','#ec4899','#f59e0b','#10b981','#06b6d4','#ef4444','#6366f1'];
function _avatarColor(uid) {
    let h = 0;
    for (let i = 0; i < (uid||'').length; i++) h = (h * 31 + uid.charCodeAt(i)) & 0xffffffff;
    return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

// ── 현재 로그인 사용자 정보 가져오기 ─────────────────────────
function _myInfo() {
    if (typeof authState === 'undefined' || !authState.currentUser) return null;
    return authState.currentUser;
}

// ── KST 날짜 문자열 ───────────────────────────────────────────
function _nowKST() {
    return new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
}

// ═══════════════════════════════════════════════════
// 1) Presence 초기화 + Heartbeat
// ═══════════════════════════════════════════════════
async function initPresence() {
    // 접속자 패널 우클릭 이벤트 설정
    document.addEventListener('click', _closeContextMenu);
    document.addEventListener('contextmenu', (e) => {
        const item = e.target.closest('.online-user-item');
        if (item) {
            e.preventDefault();
            _openContextMenu(e, item);
        }
    });

    // 페이지 로드 시 세션 복원 대기 후 초기 heartbeat (새로고침 재접속 처리)
    setTimeout(async () => {
        if (_myInfo()) {
            // 이미 세션 복원된 경우 (페이지 새로고침)
            _myPresenceRecordId = null;
            await _sendHeartbeat();
            await loadOnlineUsers(true);
            _loadUnreadCount();
            // 쪽지함 버튼 표시
            const noteRow = document.getElementById('online-panel-note-row');
            if (noteRow) noteRow.style.display = 'block';
        } else {
            // 미로그인 상태: 접속자 목록만 갱신
            await loadOnlineUsers(true);
        }
        // heartbeat + 목록 갱신 타이머 항상 등록
        if (_presenceTimer) clearInterval(_presenceTimer);
        if (_onlineTimer)   clearInterval(_onlineTimer);
        _presenceTimer = setInterval(async () => {
            if (_myInfo()) await _sendHeartbeat();
        }, HEARTBEAT_INTERVAL);
        _onlineTimer = setInterval(async () => {
            await loadOnlineUsers(false);
        }, ONLINE_POLL_INTERVAL);
        setInterval(_loadUnreadCount, 30000);
    }, 800);  // 1200ms → 800ms로 단축하여 새로고침 후 빠르게 표시
}

// ── Heartbeat 전송 (user_presence 테이블 UPSERT) ───────────
// DB API는 id를 UUID 자동생성하므로, user_id 필드로 검색 후 기존 레코드 id로 PUT
let _myPresenceRecordId = null; // 캐시된 presence 레코드 실제 UUID

async function _sendHeartbeat() {
    const me = _myInfo();
    if (!me) return;
    try {
        const payload = {
            user_id:   me.user_id,
            full_name: me.full_name || me.user_id,
            school:    me.school || '',
            role:      me.role   || 'user',
            vip:       String(me.vip || 'false'),
            last_seen: Date.now(),
            page:      (typeof state !== 'undefined' ? state.currentPage : 'home') || 'home'
        };

        // 1) 캐시된 레코드 ID가 있으면 바로 PUT (PATCH 미지원 → PUT 사용)
        if (_myPresenceRecordId) {
            const r = await fetch(apiUrl(`tables/user_presence/${_myPresenceRecordId}`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (r.ok) return; // 성공 → 종료
            // 실패 시(삭제된 경우) 아래 재탐색
            _myPresenceRecordId = null;
        }

        // 2) user_id 로 기존 레코드 검색
        const searchRes = await fetch(apiUrl(`tables/user_presence?limit=200`));
        if (searchRes.ok) {
            const searchData = await searchRes.json();
            const existing = (searchData.data || []).find(r => r.user_id === me.user_id);
            if (existing) {
                _myPresenceRecordId = existing.id;
                await fetch(apiUrl(`tables/user_presence/${existing.id}`), {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                return;
            }
        }

        // 3) 없으면 신규 POST
        const postRes = await fetch(apiUrl('tables/user_presence'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (postRes.ok) {
            const created = await postRes.json();
            _myPresenceRecordId = created.id; // 생성된 UUID 캐시
        }
    } catch(e) { console.warn('[Presence] heartbeat 실패:', e.message); }
}

// ── 로그아웃 시 presence 삭제 ────────────────────────────────
async function clearPresence() {
    if (_presenceTimer) { clearInterval(_presenceTimer); _presenceTimer = null; }
    if (_onlineTimer)   { clearInterval(_onlineTimer);   _onlineTimer   = null; }
    try {
        // 캐시된 레코드 ID로 삭제
        if (_myPresenceRecordId) {
            await fetch(apiUrl(`tables/user_presence/${_myPresenceRecordId}`), { method: 'DELETE' });
            _myPresenceRecordId = null;
            return;
        }
        // 캐시 없으면 user_id 검색 후 삭제
        const me = _myInfo();
        if (!me) return;
        const res = await fetch(apiUrl('tables/user_presence?limit=200'));
        if (res.ok) {
            const data = await res.json();
            const rec  = (data.data || []).find(r => r.user_id === me.user_id);
            if (rec) await fetch(apiUrl(`tables/user_presence/${rec.id}`), { method: 'DELETE' });
        }
    } catch(e) {}
}

// ═══════════════════════════════════════════════════
// 2) 접속 회원 목록 렌더링
// ═══════════════════════════════════════════════════
async function loadOnlineUsers(force = false) {
    const listEl  = document.getElementById('online-users-list');
    const countEl = document.getElementById('online-count-badge');
    const noteRow = document.getElementById('online-panel-note-row');
    const updateEl= document.getElementById('online-last-update');
    if (!listEl) return;

    const me = _myInfo();

    // 로그인 안 된 경우
    if (!me) {
        listEl.innerHTML = '<div class="online-empty">로그인하면 접속 중인 회원을 볼 수 있습니다.</div>';
        if (countEl)  countEl.textContent = '0';
        if (noteRow)  noteRow.style.display = 'none';
        return;
    }
    if (noteRow) noteRow.style.display = 'block';

    try {
        const res  = await fetch(apiUrl('tables/user_presence?limit=100&sort=last_seen'));
        if (!res.ok) return;
        const data = await res.json();
        const now  = Date.now();

        // PRESENCE_TTL(3분) 이내 last_seen 인 사람만 = 접속 중
        const online = (data.data || [])
            .filter(u => (now - (u.last_seen || 0)) < PRESENCE_TTL)
            .sort((a, b) => {
                // 정렬: 관리자 → VIP → 일반
                const rank = u => (u.role === 'admin' ? 0 : u.vip === 'true' ? 1 : 2);
                return rank(a) - rank(b) || (a.user_id||'').localeCompare(b.user_id||'');
            });

        if (countEl) countEl.textContent = online.length;
        if (updateEl) updateEl.textContent = `${new Date().toLocaleTimeString('ko-KR', {hour:'2-digit',minute:'2-digit'})} 기준`;

        if (online.length === 0) {
            listEl.innerHTML = '<div class="online-empty">현재 접속 중인 회원이 없습니다.</div>';
            return;
        }

        listEl.innerHTML = online.map(u => {
            const isMe    = u.user_id === me.user_id;
            const isAdmin = u.role === 'admin' || u.user_id === (typeof ADMIN_ID !== 'undefined' ? ADMIN_ID : '');
            const isVip   = u.vip === 'true' || u.vip === true;
            const initials = (u.full_name || u.user_id || '?').charAt(0).toUpperCase();
            const avatarBg = _avatarColor(u.user_id);

            let badgeHtml = '';
            if (isAdmin) {
                badgeHtml = `<span class="online-user-badge badge-admin">👑 관리자</span>`;
            } else if (isVip) {
                badgeHtml = `<span class="online-user-badge badge-vip">⭐ VIP</span>`;
            }

            const meLabel = isMe ? ' <span style="font-size:10px;color:#94a3b8;">(나)</span>' : '';

            return `<div class="online-user-item" 
                data-uid="${u.user_id}"
                data-name="${(u.full_name||u.user_id).replace(/"/g,'&quot;')}"
                data-school="${(u.school||'').replace(/"/g,'&quot;')}"
                data-role="${u.role||'user'}"
                data-vip="${u.vip||'false'}"
                title="${u.full_name||''} · ${u.school||''} · 우클릭으로 쪽지/대화">
                <div class="online-user-avatar" style="background:${avatarBg}">${initials}</div>
                <div class="online-user-info">
                    <div class="online-user-id">${u.user_id}${meLabel}</div>
                    <div class="online-user-sub">${u.full_name||''} · ${u.school||''}</div>
                </div>
                ${badgeHtml}
                <div class="online-user-dot"></div>
            </div>`;
        }).join('');

    } catch(e) {
        if (listEl) listEl.innerHTML = '<div class="online-empty">목록 불러오기 실패</div>';
    }
}

// ═══════════════════════════════════════════════════
// 3) 우클릭 컨텍스트 메뉴
// ═══════════════════════════════════════════════════
let _ctxTarget = null;

function _openContextMenu(e, itemEl) {
    const me = _myInfo();
    if (!me) return;

    _ctxTarget = {
        user_id:   itemEl.dataset.uid,
        full_name: itemEl.dataset.name,
        school:    itemEl.dataset.school,
        role:      itemEl.dataset.role,
        vip:       itemEl.dataset.vip
    };

    // 자기 자신에게는 메뉴 안 띄움
    if (_ctxTarget.user_id === me.user_id) return;

    const menu   = document.getElementById('user-context-menu');
    const header = document.getElementById('user-ctx-header');
    if (!menu) return;

    const displayName = `${_ctxTarget.full_name || _ctxTarget.user_id} (${_ctxTarget.school || ''})`;
    if (header) header.textContent = displayName;

    document.getElementById('user-ctx-note').onclick = () => { _closeContextMenu(); openNoteSend(_ctxTarget); };
    document.getElementById('user-ctx-chat').onclick = () => { _closeContextMenu(); openChatWith(_ctxTarget); };

    // 위치 조정 (화면 밖으로 나가지 않도록)
    menu.style.display = 'block';
    const mx = e.clientX, my = e.clientY;
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    menu.style.left = (mx + mw > window.innerWidth  ? mx - mw : mx) + 'px';
    menu.style.top  = (my + mh > window.innerHeight ? my - mh : my) + 'px';
}

function _closeContextMenu() {
    const menu = document.getElementById('user-context-menu');
    if (menu) menu.style.display = 'none';
    _ctxTarget = null;
}

// ═══════════════════════════════════════════════════
// 4) 쪽지 보내기
// ═══════════════════════════════════════════════════
function openNoteSend(target) {
    const me = _myInfo();
    if (!me) { showToast('로그인 후 쪽지를 보낼 수 있습니다.'); return; }

    _ctxTarget = target;
    const modal   = document.getElementById('note-send-modal');
    const toName  = document.getElementById('note-send-to-name');
    const content = document.getElementById('note-send-content');
    const charEl  = document.getElementById('note-send-char');

    if (toName)  toName.textContent = `${target.full_name || target.user_id} (${target.school || ''})`;
    if (content) { content.value = ''; }
    if (charEl)  charEl.textContent = '0';

    content?.addEventListener('input', () => {
        if (charEl) charEl.textContent = content.value.length;
    }, { once: false });

    if (modal) modal.style.display = 'flex';
}

function closeNoteSend() {
    const modal = document.getElementById('note-send-modal');
    if (modal) modal.style.display = 'none';
}

async function submitSendNote() {
    const me = _myInfo();
    if (!me || !_ctxTarget) return;

    const content = document.getElementById('note-send-content')?.value?.trim();
    if (!content) { showToast('쪽지 내용을 입력해주세요.'); return; }

    const btn = document.getElementById('note-send-btn');
    if (btn) btn.disabled = true;

    try {
        const [u1, u2] = [me.user_id, _ctxTarget.user_id].sort();
        await fetch(apiUrl('tables/messages'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                from_user_id: me.user_id,
                from_name:    me.full_name || me.user_id,
                to_user_id:   _ctxTarget.user_id,
                to_name:      _ctxTarget.full_name || _ctxTarget.user_id,
                msg_type:     'note',
                content:      content,
                is_read:      false,
                sent_at:      _nowKST(),
                session_key:  `${u1}__${u2}`
            })
        });
        closeNoteSend();
        showToast(`✅ "${_ctxTarget.full_name || _ctxTarget.user_id}"에게 쪽지를 보냈습니다.`);
    } catch(e) {
        showToast('❌ 쪽지 전송 실패: ' + e.message);
    } finally {
        if (btn) btn.disabled = false;
    }
}

// ═══════════════════════════════════════════════════
// 5) 쪽지함 (받은/보낸 쪽지 목록)
// ═══════════════════════════════════════════════════
function openNoteInbox() {
    const me = _myInfo();
    if (!me) { showToast('로그인이 필요합니다.'); return; }
    const modal = document.getElementById('note-inbox-modal');
    if (modal) modal.style.display = 'flex';
    _noteCurrentTab = 'received';
    _renderNoteTab('received');
}

function closeNoteInbox() {
    const modal = document.getElementById('note-inbox-modal');
    if (modal) modal.style.display = 'none';
}

function switchNoteTab(tab) {
    _noteCurrentTab = tab;
    document.getElementById('inbox-tab-received')?.classList.toggle('active', tab === 'received');
    document.getElementById('inbox-tab-sent')?.classList.toggle('active', tab === 'sent');
    _renderNoteTab(tab);
}

async function _renderNoteTab(tab) {
    const container = document.getElementById('note-list-container');
    if (!container) return;
    const me = _myInfo();
    if (!me) return;

    container.innerHTML = '<div class="msg-loading"><i class="fas fa-spinner fa-spin"></i> 불러오는 중...</div>';

    try {
        const res  = await fetch(apiUrl('tables/messages?limit=50&sort=created_at'));
        if (!res.ok) throw new Error('API 오류');
        const data = await res.json();
        const all  = (data.data || []);

        let notes;
        if (tab === 'received') {
            notes = all.filter(m => m.msg_type === 'note' && m.to_user_id === me.user_id)
                       .sort((a, b) => (b.created_at||0) - (a.created_at||0));
        } else {
            notes = all.filter(m => m.msg_type === 'note' && m.from_user_id === me.user_id)
                       .sort((a, b) => (b.created_at||0) - (a.created_at||0));
        }

        if (notes.length === 0) {
            container.innerHTML = '<div class="msg-empty"><i class="fas fa-inbox" style="font-size:24px;display:block;margin-bottom:8px;"></i>쪽지가 없습니다.</div>';
            return;
        }

        container.innerHTML = notes.map(n => {
            const isRead  = n.is_read === true || n.is_read === 'true';
            const label   = tab === 'received' ? (n.from_name || n.from_user_id) : `→ ${n.to_name || n.to_user_id}`;
            const preview = (n.content || '').slice(0, 60) + ((n.content||'').length > 60 ? '...' : '');
            return `<div class="note-item ${!isRead && tab==='received' ? 'unread' : ''}" 
                onclick="_openNoteRead('${n.id}','${tab}')">
                <div class="note-item-dot ${isRead || tab==='sent' ? 'read' : ''}"></div>
                <div class="note-item-body">
                    <div class="note-item-from">${label}</div>
                    <div class="note-item-preview">${preview}</div>
                    <div class="note-item-time">${n.sent_at || ''}</div>
                </div>
            </div>`;
        }).join('');

    } catch(e) {
        container.innerHTML = `<div class="msg-empty" style="color:#ef4444;">불러오기 실패: ${e.message}</div>`;
    }
}

async function _openNoteRead(noteId, tab) {
    const me = _myInfo();
    if (!me) return;

    try {
        const res  = await fetch(apiUrl(`tables/messages/${noteId}`));
        if (!res.ok) throw new Error('쪽지를 찾을 수 없습니다.');
        const note = await res.json();

        // 읽음 처리
        if (tab === 'received' && (note.is_read === false || note.is_read === 'false')) {
            await fetch(apiUrl(`tables/messages/${noteId}`), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_read: true })
            });
            _loadUnreadCount();
        }

        const body = document.getElementById('note-read-body');
        if (body) {
            body.innerHTML = `
                <div class="note-read-from">
                    ${tab==='received'
                        ? `<i class="fas fa-user"></i> 보낸 사람: <strong>${note.from_name || note.from_user_id}</strong>`
                        : `<i class="fas fa-user"></i> 받은 사람: <strong>${note.to_name || note.to_user_id}</strong>`}
                </div>
                <div class="note-read-time"><i class="fas fa-clock"></i> ${note.sent_at || ''}</div>
                <div class="note-read-content">${(note.content||'').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>`;
        }

        // 답장 버튼: 받은 쪽지만 활성화
        const replyBtn = document.getElementById('note-read-reply-btn');
        if (replyBtn) {
            replyBtn.style.display = tab === 'received' ? 'inline-flex' : 'none';
            if (tab === 'received') {
                _noteReadTarget = { user_id: note.from_user_id, full_name: note.from_name, school: '' };
            }
        }

        const modal = document.getElementById('note-read-modal');
        if (modal) modal.style.display = 'flex';

        // 목록 새로고침 (읽음 표시 반영)
        _renderNoteTab(_noteCurrentTab);

    } catch(e) {
        showToast('❌ ' + e.message);
    }
}

function closeNoteRead() {
    const modal = document.getElementById('note-read-modal');
    if (modal) modal.style.display = 'none';
}

function replyToNote() {
    closeNoteRead();
    if (_noteReadTarget) {
        _ctxTarget = _noteReadTarget;
        openNoteSend(_noteReadTarget);
    }
}

async function _loadUnreadCount() {
    const me = _myInfo();
    if (!me) return;
    try {
        const res  = await fetch(apiUrl('tables/messages?limit=200&sort=created_at'));
        if (!res.ok) return;
        const data = await res.json();
        const cnt  = (data.data||[]).filter(m =>
            m.msg_type === 'note' &&
            m.to_user_id === me.user_id &&
            (m.is_read === false || m.is_read === 'false')
        ).length;

        const badge1 = document.getElementById('note-unread-badge');
        const badge2 = document.getElementById('inbox-unread-count');
        if (badge1) { badge1.textContent = cnt; badge1.classList.toggle('hidden', cnt === 0); }
        if (badge2) { badge2.textContent = cnt; badge2.style.display = cnt > 0 ? 'inline-flex' : 'none'; }
    } catch(e) { /* 무시 */ }
}

// ═══════════════════════════════════════════════════
// 6) 1:1 대화창
// ═══════════════════════════════════════════════════
function openChatWith(target) {
    const me = _myInfo();
    if (!me) { showToast('로그인 후 대화할 수 있습니다.'); return; }
    if (target.user_id === me.user_id) { showToast('자기 자신과는 대화할 수 없습니다.'); return; }

    _chatWithTarget = target;
    const [u1, u2]  = [me.user_id, target.user_id].sort();
    _chatSessionKey = `${u1}__${u2}`;

    const titleEl = document.getElementById('chat-with-title');
    if (titleEl) titleEl.textContent = `${target.full_name || target.user_id} 와(과) 대화`;

    const modal = document.getElementById('chat-with-modal');
    if (modal) modal.style.display = 'flex';

    _loadChatMessages();
    if (_chatPollTimer) clearInterval(_chatPollTimer);
    _chatPollTimer = setInterval(_loadChatMessages, CHAT_POLL_INTERVAL);
}

function closeChatWith() {
    const modal = document.getElementById('chat-with-modal');
    if (modal) modal.style.display = 'none';
    if (_chatPollTimer) { clearInterval(_chatPollTimer); _chatPollTimer = null; }
    _chatWithTarget  = null;
    _chatSessionKey  = null;
}

async function _loadChatMessages() {
    if (!_chatSessionKey) return;
    const me  = _myInfo();
    if (!me)  return;

    const msgEl = document.getElementById('chat-with-messages');
    if (!msgEl) return;

    const wasAtBottom = msgEl.scrollHeight - msgEl.scrollTop <= msgEl.clientHeight + 60;

    try {
        const res  = await fetch(apiUrl('tables/messages?limit=100&sort=created_at'));
        if (!res.ok) return;
        const data = await res.json();
        const msgs = (data.data||[])
            .filter(m => m.msg_type === 'chat' && m.session_key === _chatSessionKey)
            .sort((a, b) => (a.created_at||0) - (b.created_at||0));

        if (msgs.length === 0) {
            msgEl.innerHTML = '<div class="msg-empty"><i class="fas fa-comments" style="font-size:24px;display:block;margin-bottom:8px;"></i>아직 대화 내용이 없습니다.<br>첫 메시지를 보내보세요!</div>';
            return;
        }

        msgEl.innerHTML = msgs.map(m => {
            const isMine = m.from_user_id === me.user_id;
            const name   = isMine ? '나' : (m.from_name || m.from_user_id);
            return `<div class="chat-bubble-wrap ${isMine ? 'mine' : 'theirs'}">
                <div class="chat-bubble ${isMine ? 'mine' : 'theirs'}">${(m.content||'').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>')}</div>
                <div class="chat-bubble-meta">${name} · ${m.sent_at||''}</div>
            </div>`;
        }).join('');

        // 새 메시지 왔을 때 자동 스크롤 (맨 아래 근처였으면)
        if (wasAtBottom) msgEl.scrollTop = msgEl.scrollHeight;

    } catch(e) { /* 폴링 오류 무시 */ }
}

async function submitChatWith() {
    const me = _myInfo();
    if (!me || !_chatWithTarget || !_chatSessionKey) return;

    const inputEl = document.getElementById('chat-with-input');
    const content = (inputEl?.value || '').trim();
    if (!content) return;

    if (inputEl) inputEl.value = '';

    try {
        await fetch(apiUrl('tables/messages'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                from_user_id: me.user_id,
                from_name:    me.full_name || me.user_id,
                to_user_id:   _chatWithTarget.user_id,
                to_name:      _chatWithTarget.full_name || _chatWithTarget.user_id,
                msg_type:     'chat',
                content:      content,
                is_read:      false,
                sent_at:      _nowKST(),
                session_key:  _chatSessionKey
            })
        });
        await _loadChatMessages();
    } catch(e) {
        showToast('❌ 메시지 전송 실패: ' + e.message);
    }
}

// ── 로그아웃 훅 연결 (auth.js 의 logout 함수가 호출 시 presence 삭제) ──
const _origLogout = window.logout;
window.logout = async function(...args) {
    await clearPresence();
    if (typeof _origLogout === 'function') return _origLogout(...args);
};
