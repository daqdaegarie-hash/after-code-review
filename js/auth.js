// ============================================================
// AFTER – 인증 모듈 (로그인 / 회원가입 / 탈퇴 / 관리자)
// ============================================================

// ============================================================
// EmailJS 설정 (회원가입 알림 이메일)
// ※ EmailJS 무료 플랜으로 구현 (월 200건 무료)
//
// ★★★ 관리자 설정 필수 ★★★
// 1. https://www.emailjs.com/ 에 접속하여 회원가입
// 2. "Email Services" → "Add New Service" → Gmail 선택
//    → daqdaegarie@gmail.com 계정으로 연결
//    → Service ID를 'after_gmail'로 설정 (또는 생성된 ID로 아래 변경)
// 3. "Email Templates" → "Create New Template" 클릭
//    템플릿 내용 예시:
//    제목: [AFTER] 새 회원가입 승인 요청 - {{user_id}}
//    본문: 새 회원이 가입 신청했습니다.
//          아이디: {{user_id}} / 성명: {{user_name}}
//          이메일: {{user_email}} / 학교: {{user_school}}
//          신청시각: {{reg_time}}
//          관리자 페이지: {{admin_url}}
//    → Template ID를 'after_register_alert'로 설정
// 4. "Account" → "Public Key" 복사 → 아래 EMAILJS_PUBLIC_KEY에 붙여넣기
// ============================================================
const EMAILJS_SERVICE_ID  = 'after_gmail';             // EmailJS Service ID
const EMAILJS_TEMPLATE_ID = 'after_register_alert';    // EmailJS Template ID
const EMAILJS_PUBLIC_KEY  = 'YOUR_EMAILJS_PUBLIC_KEY'; // ← 여기에 발급받은 Public Key 입력
const ADMIN_EMAIL         = 'daqdaegarie@gmail.com';   // 관리자 이메일 (변경 금지)

// EmailJS 초기화
(function initEmailJS() {
    try {
        if (typeof emailjs !== 'undefined' && EMAILJS_PUBLIC_KEY !== 'YOUR_EMAILJS_PUBLIC_KEY') {
            emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
            console.log('[AFTER] EmailJS 초기화 완료 ✉️');
        } else if (EMAILJS_PUBLIC_KEY === 'YOUR_EMAILJS_PUBLIC_KEY') {
            console.info('[AFTER] EmailJS Public Key 미설정 – 관리자 이메일 알림 비활성. auth.js 상단 설명을 참고하여 설정하세요.');
        }
    } catch(e) { console.warn('[AFTER] EmailJS 초기화 실패:', e.message); }
})();

/**
 * 관리자에게 회원가입 알림 이메일 발송
 * @param {object} userInfo - { userId, fullName, email, school }
 */
async function sendRegisterAlertEmail(userInfo) {
    // EmailJS 설정 완료 여부 확인
    if (typeof emailjs === 'undefined' || EMAILJS_PUBLIC_KEY === 'YOUR_EMAILJS_PUBLIC_KEY') {
        console.warn('[AFTER] EmailJS 미설정 상태 – 이메일 발송 건너뜀');
        return;
    }
    try {
        const templateParams = {
            to_email:    ADMIN_EMAIL,
            to_name:     '관리자',
            user_id:     userInfo.userId,
            user_name:   userInfo.fullName,
            user_email:  userInfo.email,
            user_school: userInfo.school,
            reg_time:    new Date().toLocaleString('ko-KR'),
            admin_url:   window.location.href
        };
        const result = await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, templateParams);
        console.log('[AFTER] 관리자 이메일 발송 성공:', result.status, result.text);
    } catch(e) {
        // 이메일 발송 실패는 회원가입 흐름을 방해하지 않음
        console.warn('[AFTER] 이메일 발송 실패 (회원가입은 정상 완료):', e.message || e.text || e);
    }
}

// ── API URL 헬퍼 (배포 환경 절대경로 보장) ──────────────────────
function apiUrl(path) {
    const origin = window.location.origin;
    const pathname = window.location.pathname;
    const dir = pathname.endsWith('/') ? pathname : pathname.replace(/\/[^/]*$/, '/');
    return origin + dir + path;
}

// ── 페이지네이션 전체 로드 (API 100개 제한 극복) ─────────────────
async function fetchAllPages(tableName) {
    // ★ GenSpark Tables API는 한 번에 최대 200개 반환
    //   → rows.length < PAGE_SIZE 로 break하면 200개에서 멈추는 버그 발생!
    //   → total 기반으로만 종료 조건 판단
    const PAGE_SIZE = 200;
    let allRows = [];
    let page = 1;
    let total = null;
    try {
        while (true) {
            const res = await fetch(apiUrl(`tables/${tableName}?page=${page}&limit=${PAGE_SIZE}`));
            if (!res.ok) break;
            const data = await res.json();
            const rows = data.data || [];
            allRows = allRows.concat(rows);
            if (total === null) total = data.total || 0;
            // chunk가 비어있거나 전체 수에 도달하면 종료 (PAGE_SIZE 기준 break 제거)
            if (rows.length === 0 || allRows.length >= total) break;
            page++;
        }
    } catch(e) {
        console.warn(`[AFTER] fetchAllPages(${tableName}) 오류:`, e.message);
    }
    return allRows;
}

// ── 관리자 자격증명 (하드코딩) ──────────────────────────────
const ADMIN_ID = 'daqdaegarie';
const ADMIN_PW = '70006166';

// ── 공유 API 키 저장 테이블 이름 ──────────────────────────────
const API_KEY_TABLE = 'app_config';
const API_KEY_RECORD_ID_KEY = 'after_api_key_record_id'; // localStorage에 record id 캐시

// ── 현재 로그인 세션 (메모리) ─────────────────────────────────
const authState = {
    currentUser: null,   // { id, user_id, email, school, approved, role, ... }
    isAdmin: false
};

// ============================================================
// 초기화: 페이지 로드 시 localStorage 세션 복원
// ============================================================
function initAuth() {
    const saved = localStorage.getItem('after_session');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            if (parsed && parsed.user_id) {
                authState.currentUser = parsed;
                // 관리자 세션이면 isAdmin 플래그도 복원
                if (parsed.user_id === ADMIN_ID || parsed.role === 'admin') {
                    authState.isAdmin = true;
                }
            }
        } catch(e) {
            localStorage.removeItem('after_session');
        }
    }

    updateLoginStatusUI();
    // 공유 API 키 로드 (서버 → 로컬) – 로그인 여부와 무관하게 항상 실행
    loadSharedApiKey();
}

// ============================================================
// 세션 저장/삭제
// ============================================================
function saveSession(user) {
    authState.currentUser = user;
    // 모든 사용자(관리자 포함) 세션을 localStorage에 저장 → 새로고침 후 로그인 유지
    if (user) {
        localStorage.setItem('after_session', JSON.stringify(user));
    }
    // 로그인 시 공유 API 키 보장 (사용자가 별도 키를 갖고 있지 않으면 공유키 적용)
    if (!localStorage.getItem('gemini_api_key')) {
        localStorage.setItem('gemini_api_key', SHARED_API_KEY);
    }
    if (typeof updateAiStatusBadge === 'function') updateAiStatusBadge();
    if (typeof checkApiWarning === 'function') checkApiWarning();
    if (typeof checkExpiryWarning === 'function') checkExpiryWarning();
    updateLoginStatusUI();

    // ── 로그인 시 presence 즉시 등록 + 접속자 목록 갱신 ──
    if (user) {
        setTimeout(async () => {
            _myPresenceRecordId = null; // 기존 캐시 초기화
            if (typeof _sendHeartbeat === 'function') await _sendHeartbeat();
            if (typeof loadOnlineUsers === 'function') await loadOnlineUsers(true);
            if (typeof _loadUnreadCount === 'function') _loadUnreadCount();
            // 쪽지함 버튼 표시
            const noteRow = document.getElementById('online-panel-note-row');
            if (noteRow) noteRow.style.display = 'block';
        }, 500);
    }
}

function clearSession() {
    // presence 삭제 (로그아웃 시)
    if (typeof clearPresence === 'function') clearPresence();
    authState.currentUser = null;
    authState.isAdmin = false;
    localStorage.removeItem('after_session');
    updateLoginStatusUI();
    // 접속자 패널 초기화
    const listEl  = document.getElementById('online-users-list');
    const noteRow = document.getElementById('online-panel-note-row');
    const countEl = document.getElementById('online-count-badge');
    if (listEl)  listEl.innerHTML  = '<div class="online-empty">로그인하면 접속 중인 회원을 볼 수 있습니다.</div>';
    if (noteRow) noteRow.style.display = 'none';
    if (countEl) countEl.textContent = '0';
}

// ============================================================
// 로그인 상태 UI 업데이트
// ============================================================
function updateLoginStatusUI() {
    const btn  = document.getElementById('login-status-btn');
    const text = document.getElementById('login-status-text');
    if (!btn || !text) return;

    // 관리자 버튼 가시성 제어
    const adminBtn = document.getElementById('btn-admin-mode');

    // AI설정 메뉴 – 관리자 전용
    const navSettings = document.getElementById('nav-settings');

    const signupBtn = document.getElementById('header-signup-btn');

    if (authState.currentUser) {
        const u = authState.currentUser;
        const pts = u.points || 0;
        text.textContent = u.user_id;
        btn.classList.add('logged-in');
        btn.onclick = openProfileMenu;
        // 포인트 배지 업데이트
        let ptsBadge = document.getElementById('header-points-badge');
        if (!ptsBadge) {
            ptsBadge = document.createElement('div');
            ptsBadge.id = 'header-points-badge';
            ptsBadge.className = 'header-points-badge';
            btn.parentNode.insertBefore(ptsBadge, btn.nextSibling);
        }
        ptsBadge.innerHTML = `<i class="fas fa-coins"></i><span>${pts.toLocaleString()}P</span>`;
        ptsBadge.style.display = 'flex';

        const isAdmin = (u.user_id === ADMIN_ID || authState.isAdmin);
        if (adminBtn)  adminBtn.style.display  = isAdmin ? '' : 'none';
        if (navSettings) navSettings.style.display = isAdmin ? '' : 'none';
        // 로그인 시 회원가입 버튼 숨김
        if (signupBtn) signupBtn.style.display = 'none';
        // 관리자 매뉴얼 카드 (홈 화면)
        const adminManualCard = document.getElementById('home-admin-manual-card');
        if (adminManualCard) adminManualCard.style.display = isAdmin ? '' : 'none';
    } else {
        text.textContent = '로그인';
        btn.classList.remove('logged-in');
        btn.onclick = openLoginModal;
        const ptsBadge = document.getElementById('header-points-badge');
        if (ptsBadge) ptsBadge.style.display = 'none';
        if (adminBtn)  adminBtn.style.display  = 'none';
        if (navSettings) navSettings.style.display = 'none';
        // 비로그인 시 회원가입 버튼 표시
        if (signupBtn) signupBtn.style.display = '';
        // 관리자 매뉴얼 카드 숨김
        const adminManualCard = document.getElementById('home-admin-manual-card');
        if (adminManualCard) adminManualCard.style.display = 'none';
    }
}

// ============================================================
// 포인트 적립 (서식 업로드 시 100P)
// ============================================================
// ============================================================
// 포인트 차감 (다운로드·질문 시 사용)
// ============================================================
async function deductPoints(amount = 10, reason = '사용') {
    const u = authState.currentUser;
    if (!u || u.user_id === ADMIN_ID) return true; // 관리자는 차감 없음
    if (String(u.vip) === 'true') return true;     // VIP는 차감 없음

    const currentPts = u.points || 0;
    if (currentPts < amount) {
        const uploadsNeeded = Math.ceil((amount - currentPts) / 100);
        showToast(`❌ 포인트가 부족합니다. (보유: ${currentPts}P / 필요: ${amount}P)\n자료 업로드로 포인트를 적립하세요!`);
        return false;
    }

    try {
        const allUsers = await fetchAllPages('users');
        const user = allUsers.find(r => r.user_id === u.user_id);
        if (!user) return true;

        const newPts = (user.points || 0) - amount;
        const updated = { ...user, points: newPts };
        ['gs_project_id','gs_table_name','created_at','updated_at','deleted'].forEach(k => delete updated[k]);

        const putRes = await fetch(apiUrl(`tables/users/${user.id}`), {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updated)
        });
        if (!putRes.ok) return true; // PUT 실패 시도 허용

        // 세션·UI 갱신
        authState.currentUser.points = newPts;
        saveSession(authState.currentUser);
        updateLoginStatusUI();
        showToast(`💸 ${reason} −${amount}P  (잔여: ${newPts.toLocaleString()}P)`);
        return true;
    } catch(e) {
        console.warn('[AFTER] 포인트 차감 실패:', e.message);
        return true; // 오류 시 허용
    }
}

async function addUploadPoints(userId, amount = 100) {
    try {
        // 현재 유저 레코드 조회
        const allUsers2 = await fetchAllPages('users');
        const user = allUsers2.find(u => u.user_id === userId);
        if (!user) return;

        const newPts = (user.points || 0) + amount;

        // PUT으로 전체 필드 업데이트 (PATCH 스키마 오류 방지)
        const updatedUser = { ...user, points: newPts };
        delete updatedUser.gs_project_id;
        delete updatedUser.gs_table_name;
        delete updatedUser.created_at;
        delete updatedUser.updated_at;
        delete updatedUser.deleted;

        const putRes = await fetch(apiUrl(`tables/users/${user.id}`), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedUser)
        });
        if (!putRes.ok) return;

        // 세션 업데이트
        if (authState.currentUser && authState.currentUser.user_id === userId) {
            authState.currentUser.points = newPts;
            saveSession(authState.currentUser);
            updateLoginStatusUI();
        }
        showToast(`🪙 +${amount}P 적립! 총 ${newPts.toLocaleString()}P`);
    } catch(e) {
        console.warn('[AFTER] 포인트 적립 실패:', e.message);
    }
}

// 관리자가 특정 사용자에게 포인트를 추가로 부여 (승인 시 사용)
// addUploadPoints와 동일하지만 토스트를 별도로 제어하지 않음
async function addUploadPointsForUser(userId, amount, reason) {
    try {
        const allUsers3 = await fetchAllPages('users');
        const user = allUsers3.find(u => u.user_id === userId);
        if (!user) { console.warn('[AFTER] 사용자 미발견:', userId); return; }
        const newPts = (user.points || 0) + amount;
        const updatedUser = { ...user, points: newPts };
        ['gs_project_id','gs_table_name','created_at','updated_at','deleted'].forEach(k => delete updatedUser[k]);
        const putRes = await fetch(apiUrl(`tables/users/${user.id}`), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedUser)
        });
        if (!putRes.ok) return;
        // 세션 업데이트
        if (authState.currentUser && authState.currentUser.user_id === userId) {
            authState.currentUser.points = newPts;
            saveSession(authState.currentUser);
            updateLoginStatusUI();
        }
        console.log(`[AFTER] ${userId}에게 +${amount}P 지급 (${reason}) → 총 ${newPts}P`);
    } catch(e) {
        console.warn('[AFTER] 포인트 추가 부여 실패:', e.message);
    }
}

// ============================================================
// 비밀번호 해싱 (SHA-256, Web Crypto API)
// ============================================================
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data     = encoder.encode(password);
    const hashBuf  = await crypto.subtle.digest('SHA-256', data);
    const hashArr  = Array.from(new Uint8Array(hashBuf));
    return hashArr.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ============================================================
// 공유 API 키 – 항상 SHARED_API_KEY를 사용 (gemini.js에 내장됨)
// DB에 별도 키가 저장되어 있으면 그것을 우선 사용.
// ============================================================
async function loadSharedApiKey() {
    // 1) 항상 내장 공유키를 먼저 localStorage에 적용
    //    (이미 저장된 키가 없을 때만 덮어씀 – 관리자가 다른 키를 저장했다면 유지)
    if (!localStorage.getItem('gemini_api_key')) {
        localStorage.setItem('gemini_api_key', SHARED_API_KEY);
    }

    // 2) DB에서 관리자가 별도로 저장한 키가 있으면 그것으로 교체
    try {
        const res = await fetch(apiUrl('tables/app_config?limit=10'));
        if (res.ok) {
            const data = await res.json();
            const rows = data.data || [];
            const keyRow = rows.find(r => r.config_key === 'gemini_api_key');
            if (keyRow && keyRow.config_value) {
                localStorage.setItem('gemini_api_key', keyRow.config_value);
                localStorage.setItem(API_KEY_RECORD_ID_KEY, keyRow.id);
            }
        }
    } catch(e) { /* 네트워크 오류 무시 – SHARED_API_KEY 계속 사용 */ }

    // 3) UI 갱신
    if (typeof updateAiStatusBadge === 'function') updateAiStatusBadge();
    if (typeof checkApiWarning === 'function') checkApiWarning();
}

// ============================================================
// 관리자: 공유 API 키 저장 (DB에 upsert)
// ============================================================
async function adminSaveApiKey() {
    const input = document.getElementById('admin-api-key-input');
    const val = (input ? input.value.trim() : '');
    if (!val) { showToast('❌ API 키를 입력해주세요.'); return; }
    if (!val.startsWith('AIza')) { showToast('❌ AIza로 시작하는 키를 입력해주세요.'); return; }

    try {
        const existingId = localStorage.getItem(API_KEY_RECORD_ID_KEY);
        let res;
        if (existingId) {
            // PUT으로 업데이트
            res = await fetch(apiUrl(`tables/app_config/${existingId}`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ config_key: 'gemini_api_key', config_value: val })
            });
        } else {
            // 먼저 기존 레코드 확인
            const listRes = await fetch(apiUrl('tables/app_config?limit=20'));
            const listData = listRes.ok ? await listRes.json() : { data: [] };
            const existing = (listData.data || []).find(r => r.config_key === 'gemini_api_key');
            if (existing) {
                localStorage.setItem(API_KEY_RECORD_ID_KEY, existing.id);
                res = await fetch(apiUrl(`tables/app_config/${existing.id}`), {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ config_key: 'gemini_api_key', config_value: val })
                });
            } else {
                res = await fetch(apiUrl('tables/app_config'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ config_key: 'gemini_api_key', config_value: val })
                });
                if (res.ok) {
                    const created = await res.json();
                    localStorage.setItem(API_KEY_RECORD_ID_KEY, created.id);
                }
            }
        }
        // 로컬에도 즉시 적용
        localStorage.setItem('gemini_api_key', val);
        if (typeof updateAiStatusBadge === 'function') updateAiStatusBadge();
        if (typeof checkApiWarning === 'function') checkApiWarning();
        updateAdminApiKeyStatus();
        showToast('✅ API 키가 저장되었습니다. 모든 사용자가 즉시 사용 가능합니다.');
        if (input) input.value = '';
    } catch(e) {
        showToast('❌ 저장 오류: ' + e.message);
    }
}

async function adminClearApiKey() {
    if (!confirm('API 키를 삭제하시겠습니까? 모든 사용자의 AI 기능이 중단됩니다.')) return;
    try {
        const existingId = localStorage.getItem(API_KEY_RECORD_ID_KEY);
        if (existingId) {
            await fetch(apiUrl(`tables/app_config/${existingId}`), { method: 'DELETE' });
            localStorage.removeItem(API_KEY_RECORD_ID_KEY);
        }
        clearApiKey();
        if (typeof updateAiStatusBadge === 'function') updateAiStatusBadge();
        if (typeof checkApiWarning === 'function') checkApiWarning();
        updateAdminApiKeyStatus();
        showToast('🗑️ API 키가 삭제되었습니다.');
    } catch(e) {
        showToast('❌ 삭제 오류: ' + e.message);
    }
}

function updateAdminApiKeyStatus() {
    const el = document.getElementById('admin-api-key-status');
    if (!el) return;
    const key = getApiKey();
    el.textContent = key ? `설정됨 (${key.slice(0,8)}...)` : '미설정';
    el.style.color = key ? '#059669' : '#dc2626';
}

// ============================================================
// 로그인 모달
// ============================================================
function openLoginModal() {
    document.getElementById('auth-modal').classList.remove('hidden');
    switchAuthTab('login');
}

// 헤더 회원가입 버튼에서 직접 회원가입 탭 열기
function openRegisterModal() {
    document.getElementById('auth-modal').classList.remove('hidden');
    switchAuthTab('register');
}

function closeLoginModal() {
    document.getElementById('auth-modal').classList.add('hidden');
    clearAuthErrors();
}

function switchAuthTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.auth-panel').forEach(p => p.classList.remove('active'));

    document.getElementById(`tab-${tab}`).classList.add('active');
    document.getElementById(`auth-panel-${tab}`).classList.add('active');
    clearAuthErrors();
}

function clearAuthErrors() {
    ['login-error','register-error','register-success','delete-error','admin-login-error'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.textContent = ''; el.classList.add('hidden'); }
    });
}

// ============================================================
// 로그인
// ============================================================
async function doLogin() {
    const userId = (document.getElementById('login-id').value || '').trim();
    const pw     = (document.getElementById('login-pw').value || '').trim();
    const errEl  = document.getElementById('login-error');

    if (!userId || !pw) {
        showAuthError(errEl, '아이디와 비밀번호를 입력해주세요.');
        return;
    }

    const btn = document.getElementById('btn-login');
    setAuthBtnLoading(btn, true, '로그인 중...');

    try {
        // ══════════════════════════════════════════════════════
        // 관리자 계정 직접 처리: DB 조회 없이 즉시 로그인
        // 비밀번호도 평문으로 바로 비교 (해싱 불필요)
        // ══════════════════════════════════════════════════════
        if (userId === ADMIN_ID && pw === ADMIN_PW) {
            const adminUser = {
                id: 'admin-built-in',
                user_id: ADMIN_ID,
                email: 'admin@after.edu',
                school: '관리자',
                approved: 'true',
                role: 'admin',
                points: 0,
                registered_at: '시스템 관리자'
            };
            authState.isAdmin = true;
            // 관리자 세션도 localStorage에 저장 → 새로고침 후에도 로그인 유지
            saveSession(adminUser);
            closeLoginModal();
            showToast('🛡️ 관리자로 로그인되었습니다. 왼쪽 [관리자] 버튼으로 관리자 메뉴에 접근하세요.');

            const activeFilter = document.querySelector('.filter-btn.active')?.dataset.filter || 'all';
            if (typeof renderFormsPage === 'function') renderFormsPage(activeFilter);
            return; // 일반 로그인 로직 건너뜀
        }

        // ── 일반 회원 로그인: DB에서 조회 ──────────────────────
        const pwHash = await hashPassword(pw);

        let user = null;
        let page = 1;
        const pageSize = 100;
        while (true) {
            const res = await fetch(apiUrl(`tables/users?limit=${pageSize}&page=${page}`));
            if (!res.ok) {
                let errBody = '';
                try { errBody = await res.text(); } catch(e) {}
                throw new Error(`DB 조회 실패 (${res.status})${errBody ? ': ' + errBody.slice(0,100) : ''}`);
            }
            const data = await res.json();
            const rows = data.data || [];
            const found = rows.find(r => r.user_id === userId);
            if (found) { user = found; break; }
            if (rows.length < pageSize) break;
            page++;
        }

        if (!user) {
            showAuthError(errEl, '아이디 또는 비밀번호가 올바르지 않습니다.');
            return;
        }
        if (user.password_hash !== pwHash) {
            showAuthError(errEl, '아이디 또는 비밀번호가 올바르지 않습니다.');
            return;
        }

        // approved: 문자열 'true' 또는 boolean true 모두 허용
        const isApproved = String(user.approved) === 'true';
        if (!isApproved) {
            showAuthError(errEl, '관리자 승인 대기 중입니다. 승인 후 로그인 가능합니다.');
            return;
        }

        saveSession(user);
        closeLoginModal();
        showToast(`👋 ${user.user_id}님, 환영합니다!`);

        // 만료일 체크 후 경고 표시
        if (typeof checkExpiryWarning === 'function') checkExpiryWarning();

        const activeFilter = document.querySelector('.filter-btn.active')?.dataset.filter || 'all';
        if (typeof renderFormsPage === 'function') renderFormsPage(activeFilter);

        // ★ 첫 로그인 튜토리얼 표시
        if (typeof checkAndShowTutorial === 'function') {
            checkAndShowTutorial(user.user_id, false);
        }

    } catch(e) {
        console.error('[AFTER] 로그인 오류:', e);
        showAuthError(errEl, '로그인 오류: ' + e.message);
    } finally {
        setAuthBtnLoading(btn, false, '<i class="fas fa-sign-in-alt"></i> 로그인');
    }
}

// ============================================================
// 비밀번호 강도 체크 (실시간)
// ============================================================
function checkPwStrength(pw) {
    const fill = document.getElementById('pw-strength-fill');
    const text = document.getElementById('pw-strength-text');
    if (!fill || !text) return;

    const hasLen = pw.length >= 8;
    const hasAlpha = /[A-Za-z]/.test(pw);
    const hasNum   = /[0-9]/.test(pw);
    const hasSpc   = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(pw);
    const hasLong  = pw.length >= 12;

    const score = [hasLen, hasAlpha, hasNum, hasSpc, hasLong].filter(Boolean).length;

    const levels = [
        { pct: '20%',  color: '#ef4444', label: '매우 약함' },
        { pct: '40%',  color: '#f97316', label: '약함' },
        { pct: '60%',  color: '#eab308', label: '보통' },
        { pct: '80%',  color: '#22c55e', label: '강함' },
        { pct: '100%', color: '#16a34a', label: '매우 강함 ✅' },
    ];
    const lv = levels[Math.max(0, score - 1)];

    fill.style.width = pw.length === 0 ? '0%' : lv.pct;
    fill.style.background = lv.color;
    text.textContent = pw.length === 0 ? '' : lv.label;
    text.style.color = lv.color;
}

// ============================================================
// 회원가입
// ============================================================
async function doRegister() {
    const userId   = (document.getElementById('reg-id').value || '').trim();
    const pw       = (document.getElementById('reg-pw').value || '').trim();
    const pw2      = (document.getElementById('reg-pw2').value || '').trim();
    const fullName = (document.getElementById('reg-fullname')?.value || '').trim();
    const email    = (document.getElementById('reg-email').value || '').trim();
    const school   = (document.getElementById('reg-school').value || '').trim();
    const consent  = document.getElementById('reg-consent').checked;
    const errEl    = document.getElementById('register-error');
    const sucEl    = document.getElementById('register-success');

    // 유효성 검사
    if (!userId || !pw || !email || !school) {
        showAuthError(errEl, '모든 필수 항목을 입력해주세요.'); return;
    }
    if (!fullName) {
        showAuthError(errEl, '성명을 입력해주세요.'); return;
    }
    if (!/^[a-zA-Z0-9_]{4,20}$/.test(userId)) {
        showAuthError(errEl, '아이디는 영문·숫자·밑줄 4~20자만 허용됩니다.'); return;
    }
    if (pw.length < 8) {
        showAuthError(errEl, '비밀번호는 8자 이상이어야 합니다.'); return;
    }
    // 영문 + 숫자 + 특수문자 조합 필수
    const hasupper = /[A-Za-z]/.test(pw);
    const hasNum   = /[0-9]/.test(pw);
    const hasSpc   = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(pw);
    if (!hasupper || !hasNum || !hasSpc) {
        showAuthError(errEl, '비밀번호는 영문자 + 숫자 + 특수문자(!@#$% 등)를 모두 포함해야 합니다.'); return;
    }
    if (pw !== pw2) {
        showAuthError(errEl, '비밀번호가 일치하지 않습니다.'); return;
    }
    if (!email.includes('@')) {
        showAuthError(errEl, '올바른 이메일 주소를 입력해주세요.'); return;
    }
    if (!consent) {
        showAuthError(errEl, '개인정보 수집 및 이용에 동의해주세요.'); return;
    }

    const btn = document.getElementById('btn-register');
    setAuthBtnLoading(btn, true, '처리 중...');

    try {
        // 중복 아이디 확인 (전체 페이지 조회 후 클라이언트 필터)
        const allUsersChk = await fetchAllPages('users');
        const dup = allUsersChk.find(r => r.user_id === userId);
        if (dup) { showAuthError(errEl, '이미 사용 중인 아이디입니다.'); return; }

        const pwHash = await hashPassword(pw);
        const payload = {
            user_id: userId,
            password_hash: pwHash,
            full_name: fullName,
            email: email,
            school: school,
            approved: 'false',   // 문자열로 저장 (bool 타입 오류 방지)
            role: 'user',
            points: 1000,        // 신규 가입 기본 지급 포인트
            registered_at: new Date().toLocaleString('ko-KR')
        };

        const res = await fetch(apiUrl('tables/users'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            let errMsg = res.status + '';
            try { const t = await res.text(); errMsg = res.status + ': ' + t; } catch(e){}
            throw new Error('서버 오류 (' + errMsg + ')');
        }

        errEl.classList.add('hidden');
        sucEl.textContent = '✅ 회원가입 신청이 완료되었습니다! 관리자 승인 후 로그인 가능합니다.';
        sucEl.classList.remove('hidden');

        // ★ 관리자에게 이메일 알림 발송 (비동기, 실패해도 회원가입에 영향 없음)
        sendRegisterAlertEmail({
            userId:   userId,
            fullName: fullName,
            email:    email,
            school:   school
        });

        // 입력 초기화
        ['reg-id','reg-pw','reg-pw2','reg-fullname','reg-email','reg-school'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        document.getElementById('reg-consent').checked = false;

    } catch(e) {
        showAuthError(errEl, '가입 오류: ' + e.message);
    } finally {
        setAuthBtnLoading(btn, false, '<i class="fas fa-user-plus"></i> 회원가입 신청');
    }
}

// ============================================================
// 로그아웃 (프로필 메뉴에서 호출)
// ============================================================
function doLogout() {
    clearSession();
    showToast('👋 로그아웃되었습니다.');
    if (typeof renderFormsPage === 'function') {
        const activeFilter = document.querySelector('.filter-btn.active')?.dataset.filter || 'all';
        renderFormsPage(activeFilter);
    }
}

// 프로필 메뉴 (로그인된 상태에서 상단 버튼 클릭 시)
function openProfileMenu() {
    const u = authState.currentUser;
    if (!u) { openLoginModal(); return; }
    openProfileModal();
}

// ============================================================
// 프로필 모달 열기/닫기
// ============================================================
function openProfileModal() {
    const u = authState.currentUser;
    if (!u) { openLoginModal(); return; }
    // VIP 여부에 따라 연장 버튼 숨김/표시
    const purchaseBtn = document.getElementById('btn-purchase-access');
    if (purchaseBtn) purchaseBtn.style.display = (String(u.vip) === 'true') ? 'none' : '';

    // 기본 정보 채우기
    const el = id => document.getElementById(id);
    if (el('profile-user-id'))   el('profile-user-id').textContent   = u.user_id;
    if (el('profile-user-name')) el('profile-user-name').textContent = u.full_name || '(이름 미등록)';
    if (el('profile-school-val')) el('profile-school-val').textContent = u.school || '-';
    if (el('profile-points-val')) el('profile-points-val').textContent = (u.points || 0).toLocaleString() + 'P';

    // VIP 배지 표시
    const isVip = String(u.vip) === 'true';
    const profileUserId = el('profile-user-id');
    if (profileUserId) {
        // 기존 VIP 배지 제거 후 재삽입
        const existingBadge = profileUserId.parentElement.querySelector('.profile-vip-badge');
        if (existingBadge) existingBadge.remove();
        if (isVip) {
            const badge = document.createElement('span');
            badge.className = 'profile-vip-badge';
            badge.innerHTML = '👑 VIP';
            badge.style.cssText = 'background:linear-gradient(135deg,#fef3c7,#fde68a);color:#92400e;border:1px solid #f59e0b;padding:2px 10px;border-radius:20px;font-size:12px;font-weight:700;margin-left:8px;';
            profileUserId.parentElement.appendChild(badge);
        }
    }

    // 만료일 표시
    const expiryEl = el('profile-expiry-val');
    if (expiryEl) {
        if (isVip) {
            expiryEl.innerHTML = `<span style="color:#f59e0b;font-weight:700;"><i class="fas fa-infinity"></i> VIP – 무제한 이용 (포인트 차감 없음)</span>`;
        } else {
            const status = checkUserExpiry(u);
            if (!u.expires_at || status === 'no_expiry') {
                expiryEl.innerHTML = `<span style="color:#6b7280;">미설정</span>`;
            } else {
                const exp = new Date(u.expires_at);
                const dateStr = exp.toLocaleDateString('ko-KR', { year:'numeric', month:'long', day:'numeric' });
                if (status === 'expired') {
                    expiryEl.innerHTML = `<span style="color:#dc2626;font-weight:600;">⛔ ${dateStr} (만료됨)</span>`;
                } else if (status === 'expiring_soon') {
                    expiryEl.innerHTML = `<span style="color:#f59e0b;font-weight:600;">⚠️ ${dateStr} (곧 만료)</span>`;
                } else {
                    expiryEl.innerHTML = `<span style="color:#059669;font-weight:600;">✅ ${dateStr}</span>`;
                }
            }
        }
    }

    // 입력 필드 초기화
    ['profile-new-pw','profile-new-pw2','profile-new-school'].forEach(i => {
        const inp = el(i);
        if (inp) inp.value = '';
    });
    if (el('profile-school-inp')) el('profile-school-inp').value = u.school || '';

    // 패널 초기화
    ['profile-panel-pw','profile-panel-school'].forEach(pid => {
        const p = el(pid);
        if (p) p.style.display = 'none';
    });

    el('profile-modal').classList.remove('hidden');
}

function closeProfileModal() {
    document.getElementById('profile-modal').classList.add('hidden');
}

function toggleProfilePanel(panelId) {
    const panels = ['profile-panel-pw', 'profile-panel-school'];
    panels.forEach(pid => {
        const p = document.getElementById(pid);
        if (!p) return;
        if (pid === panelId) {
            p.style.display = p.style.display === 'none' ? '' : 'none';
        } else {
            p.style.display = 'none';
        }
    });
}

// 비밀번호 변경
async function doChangePassword() {
    const u = authState.currentUser;
    if (!u) return;
    const newPw  = (document.getElementById('profile-new-pw')?.value  || '').trim();
    const newPw2 = (document.getElementById('profile-new-pw2')?.value || '').trim();
    if (!newPw || newPw.length < 8) { showToast('❌ 비밀번호는 8자 이상이어야 합니다.'); return; }
    if (newPw !== newPw2)           { showToast('❌ 비밀번호가 일치하지 않습니다.'); return; }
    const hasupper = /[A-Za-z]/.test(newPw);
    const hasNum   = /[0-9]/.test(newPw);
    const hasSpc   = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(newPw);
    if (!hasupper || !hasNum || !hasSpc) { showToast('❌ 영문 + 숫자 + 특수문자를 모두 포함해야 합니다.'); return; }

    const btn = document.getElementById('btn-change-pw');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 변경 중...'; }

    try {
        const pwHash = await hashPassword(newPw);
        const getRes = await fetch(apiUrl(`tables/users/${u.id}`));
        if (!getRes.ok) throw new Error('사용자 정보 조회 실패');
        const userData = await getRes.json();

        const updated = { ...userData, password_hash: pwHash };
        ['gs_project_id','gs_table_name','created_at','updated_at','deleted'].forEach(k => delete updated[k]);

        const putRes = await fetch(apiUrl(`tables/users/${u.id}`), {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updated)
        });
        if (!putRes.ok) throw new Error('비밀번호 변경 실패');

        authState.currentUser.password_hash = pwHash;
        saveSession(authState.currentUser);
        showToast('✅ 비밀번호가 변경되었습니다.');
        document.getElementById('profile-panel-pw').style.display = 'none';
        document.getElementById('profile-new-pw').value  = '';
        document.getElementById('profile-new-pw2').value = '';
    } catch(e) {
        showToast('❌ 변경 오류: ' + e.message);
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-key"></i> 비밀번호 변경'; }
    }
}

// 소속 학교 변경
async function doChangeSchool() {
    const u = authState.currentUser;
    if (!u) return;
    const newSchool = (document.getElementById('profile-school-inp')?.value || '').trim();
    if (!newSchool) { showToast('❌ 소속 학교를 입력해주세요.'); return; }

    const btn = document.getElementById('btn-change-school');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 변경 중...'; }

    try {
        const getRes = await fetch(apiUrl(`tables/users/${u.id}`));
        if (!getRes.ok) throw new Error('사용자 정보 조회 실패');
        const userData = await getRes.json();

        const updated = { ...userData, school: newSchool };
        ['gs_project_id','gs_table_name','created_at','updated_at','deleted'].forEach(k => delete updated[k]);

        const putRes = await fetch(apiUrl(`tables/users/${u.id}`), {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updated)
        });
        if (!putRes.ok) throw new Error('학교 변경 실패');

        authState.currentUser.school = newSchool;
        saveSession(authState.currentUser);
        document.getElementById('profile-school-val').textContent = newSchool;
        showToast('✅ 소속 학교가 변경되었습니다.');
        document.getElementById('profile-panel-school').style.display = 'none';
    } catch(e) {
        showToast('❌ 변경 오류: ' + e.message);
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-school"></i> 학교 변경'; }
    }
}

// 이용 기간 1,000포인트로 연장
async function doPurchaseAccess() {
    const u = authState.currentUser;
    if (!u) return;

    const MONTHLY_COST = 1500; // 월 이용권 포인트
    const currentPts = u.points || 0;
    if (currentPts < MONTHLY_COST) {
        // 포인트 부족 → 자료 업로드 안내
        const need = MONTHLY_COST - currentPts;
        const uploadsNeeded = Math.ceil(need / 100); // 업로드 1건당 100P
        const msg = [
            `포인트가 부족합니다.`,
            ``,
            `  현재 보유: ${currentPts.toLocaleString()} P`,
            `  필요 포인트: 1,500 P`,
            `  부족분: ${need.toLocaleString()} P (약 ${uploadsNeeded}건 업로드 필요)`,
            ``,
            `자료실에 자료를 업로드하면 건당 100P가 적립됩니다.`,
            `포인트를 모은 뒤 다시 연장해 주세요!`
        ].join('\n');
        alert(msg);
        return;
    }

    const confirmed = confirm(`포인트 1,500P를 사용하여 이용 기간을 1개월 연장하시겠습니까?\n현재 포인트: ${currentPts.toLocaleString()}P → ${(currentPts-MONTHLY_COST).toLocaleString()}P`);
    if (!confirmed) return;

    const btn = document.getElementById('btn-purchase-access');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 처리 중...'; }

    try {
        const getRes = await fetch(apiUrl(`tables/users/${u.id}`));
        if (!getRes.ok) throw new Error('사용자 정보 조회 실패');
        const userData = await getRes.json();

        // 현재 만료일 기준으로 연장 (이미 만료됐으면 오늘부터 1개월)
        let baseDate = new Date();
        if (userData.expires_at) {
            const exp = new Date(userData.expires_at);
            if (!isNaN(exp.getTime()) && exp > baseDate) {
                baseDate = exp; // 아직 유효하면 만료일부터 연장
            }
        }
        baseDate.setMonth(baseDate.getMonth() + 1);

        const updated = { ...userData, points: currentPts - MONTHLY_COST, expires_at: baseDate.toISOString() };
        ['gs_project_id','gs_table_name','created_at','updated_at','deleted'].forEach(k => delete updated[k]);

        const putRes = await fetch(apiUrl(`tables/users/${u.id}`), {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updated)
        });
        if (!putRes.ok) throw new Error('연장 실패');

        authState.currentUser.points    = currentPts - MONTHLY_COST;
        authState.currentUser.expires_at = baseDate.toISOString();
        saveSession(authState.currentUser);
        updateLoginStatusUI();

        showToast(`✅ 이용 기간이 1개월 연장되었습니다! (잔여: ${(currentPts-MONTHLY_COST).toLocaleString()}P)`);
        openProfileModal();
    } catch(e) {
        showToast('❌ 연장 오류: ' + e.message);
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-calendar-plus"></i> 1,500P로 1개월 연장'; }
    }
}

// ============================================================
// 회원 탈퇴
// ============================================================
function openDeleteAccountModal() {
    document.getElementById('delete-account-modal').classList.remove('hidden');
    document.getElementById('auth-modal').classList.add('hidden');
}

function closeDeleteAccountModal() {
    document.getElementById('delete-account-modal').classList.add('hidden');
    ['del-id','del-pw'].forEach(id => { document.getElementById(id).value = ''; });
    const errEl = document.getElementById('delete-error');
    if (errEl) { errEl.textContent = ''; errEl.classList.add('hidden'); }
}

async function doDeleteAccount() {
    const userId = (document.getElementById('del-id').value || '').trim();
    const pw     = (document.getElementById('del-pw').value || '').trim();
    const errEl  = document.getElementById('delete-error');

    if (!userId || !pw) { showAuthError(errEl, '아이디와 비밀번호를 입력해주세요.'); return; }

    const btn = document.getElementById('btn-delete-account');
    setAuthBtnLoading(btn, true, '처리 중...');

    try {
        const pwHash = await hashPassword(pw);
        // 전체 페이지 조회 후 클라이언트 필터 (search 파라미터 오동작 방지)
        const allUsersDel = await fetchAllPages('users');
        const user = allUsersDel.find(r => r.user_id === userId);

        if (!user) { showAuthError(errEl, '아이디 또는 비밀번호가 올바르지 않습니다.'); return; }
        if (user.password_hash !== pwHash) { showAuthError(errEl, '아이디 또는 비밀번호가 올바르지 않습니다.'); return; }

        if (!confirm(`정말로 "${userId}" 계정을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) return;

        const delRes = await fetch(apiUrl(`tables/users/${user.id}`), { method: 'DELETE' });
        if (!delRes.ok && delRes.status !== 204) throw new Error('삭제 실패');

        // 현재 로그인 세션도 해제
        if (authState.currentUser && authState.currentUser.user_id === userId) {
            clearSession();
        }
        closeDeleteAccountModal();
        showToast('🗑️ 계정이 삭제되었습니다.');

    } catch(e) {
        showAuthError(errEl, '탈퇴 오류: ' + e.message);
    } finally {
        setAuthBtnLoading(btn, false, '<i class="fas fa-trash-alt"></i> 탈퇴하기');
    }
}

// ============================================================
// 관리자 모달
// ============================================================
function openAdminModal() {
    document.getElementById('admin-modal').classList.remove('hidden');

    // 이미 관리자로 로그인된 경우(메모리 또는 세션 복원) → 바로 대시보드 진입
    if (authState.isAdmin && authState.currentUser &&
        (authState.currentUser.user_id === ADMIN_ID || authState.currentUser.role === 'admin')) {
        document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
        document.getElementById('admin-panel-dashboard').classList.add('active');
        loadAdminMembers();
        updateAdminApiKeyStatus();
        switchAdminTab('members');
        return;
    }

    // 비관리자: 로그인 패널 표시
    document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
    document.getElementById('admin-panel-login').classList.add('active');
    document.getElementById('admin-id-input').value = '';
    document.getElementById('admin-pw-input').value = '';
    const errEl = document.getElementById('admin-login-error');
    if (errEl) { errEl.textContent = ''; errEl.classList.add('hidden'); }
}

function closeAdminModal() {
    document.getElementById('admin-modal').classList.add('hidden');
    // isAdmin 플래그는 유지 – 창을 닫아도 관리자 세션 유지
    // (로그아웃 시에만 clearSession()에서 false로 전환)
    // 패널 닫힐 때 홈 화면으로 이동
    if (typeof navigateTo === 'function') navigateTo('home');
}

function doAdminLogin() {
    const id = (document.getElementById('admin-id-input').value || '').trim();
    const pw = (document.getElementById('admin-pw-input').value || '').trim();
    const errEl = document.getElementById('admin-login-error');

    if (id === ADMIN_ID && pw === ADMIN_PW) {
        const adminUser = {
            id: 'admin-built-in',
            user_id: ADMIN_ID,
            email: 'admin@after.edu',
            school: '관리자',
            approved: 'true',
            role: 'admin',
            points: 0,
            registered_at: '시스템 관리자'
        };
        authState.isAdmin = true;
        saveSession(adminUser); // localStorage에 저장 → 새로고침 후에도 유지
        document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
        document.getElementById('admin-panel-dashboard').classList.add('active');
        loadAdminMembers();
        updateAdminApiKeyStatus();
        // 기본 탭: 회원 관리
        switchAdminTab('members');
    } else {
        showAuthError(errEl, '관리자 아이디 또는 비밀번호가 올바르지 않습니다.');
    }
}

function doAdminLogout() {
    clearSession(); // localStorage 세션 완전 제거 + isAdmin = false
    closeAdminModal();
    showToast('🔓 관리자 로그아웃 되었습니다.');
}

function switchAdminTab(tab) {
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));
    // 탭 순서: members(0), notices(1), useruploads(2), baseforms(3), apikey(4), backup(5), github(6)
    const tabs = document.querySelectorAll('.admin-tab');
    const idxMap = { members: 0, notices: 1, useruploads: 2, baseforms: 3, apikey: 4, backup: 5, github: 6 };
    const idx = idxMap[tab] ?? 0;
    if (tabs[idx]) tabs[idx].classList.add('active');
    const content = document.getElementById(`admin-tab-${tab}`);
    if (content) content.classList.add('active');
    if (tab === 'apikey') updateAdminApiKeyStatus();
    if (tab === 'baseforms') { initAbfEvents(); loadAdminBaseForms(); }
    if (tab === 'useruploads') loadAdminUserUploads();
    if (tab === 'notices') loadAdminNotices();
    if (tab === 'backup') initBackupTab();
    if (tab === 'github') initGithubTab();
}

// ============================================================
// 관리자 서식 DB - 업로드 모드 전환 (다중/단일)
// ============================================================
function switchAbfMode(mode) {
    const multiPanel  = document.getElementById('abf-panel-multi');
    const singlePanel = document.getElementById('abf-panel-single');
    const tabMulti    = document.getElementById('abf-tab-multi');
    const tabSingle   = document.getElementById('abf-tab-single');
    if (mode === 'multi') {
        multiPanel.style.display  = '';
        singlePanel.style.display = 'none';
        tabMulti.classList.add('active');
        tabSingle.classList.remove('active');
    } else {
        multiPanel.style.display  = 'none';
        singlePanel.style.display = '';
        tabSingle.classList.add('active');
        tabMulti.classList.remove('active');
    }
}

// ============================================================
// 관리자: 다중 파일 업로드 (base_forms)
// ============================================================
let _abfMultiFiles = []; // { file, title, ext, size, ok } – 개수 제한 없음

function abfMultiFilesSelected(fileList) {
    const allowed = ['hwp','hwpx','pdf','xlsx','xls','docx','doc','ppt','pptx'];
    // ★ 기존 목록에 추가(누적) 방식 – 이미 같은 파일명이면 건너뜀 (중복 방지)
    const existingNames = new Set(_abfMultiFiles.map(f => f.file.name));
    let added = 0;
    for (let i = 0; i < fileList.length; i++) {
        const f   = fileList[i];
        if (existingNames.has(f.name)) continue; // 중복 파일 스킵
        const ext = f.name.split('.').pop().toLowerCase();
        const ok  = allowed.includes(ext); // 개수·용량 제한 없음
        const title = f.name.replace(/\.[^/.]+$/, ''); // 확장자 제거
        _abfMultiFiles.push({ file: f, title, ext, size: f.size, ok });
        existingNames.add(f.name);
        added++;
    }
    if (added > 0) showToast(`📂 ${added}개 추가 (총 ${_abfMultiFiles.length}개 선택됨)`);
    renderAbfMultiFileList();
}

function abfFormatSize2(bytes) {
    if (bytes < 1024) return bytes + 'B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + 'KB';
    return (bytes / 1048576).toFixed(1) + 'MB';
}

// ★ 제목 정규화: 앞 번호(01., 1., (1), ① 등) 제거 + 공백 통일
// 예) "01. 기간제 호봉책정방법" → "기간제 호봉책정방법"
//     "(2024) 학교폭력 예방 지침" → "학교폭력 예방 지침"
function abfNormalizeTitle(title) {
    return (title || '')
        .trim()
        // 앞 번호: "01. " / "1) " / "(1) " / "(1). " 형태
        .replace(/^[([]?\d{1,3}[.)\]]\s*/, '')
        // 원문자 번호: ① ② … ⑳
        .replace(/^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]\s*/, '')
        // 한글 번호: "가. " "나. "
        .replace(/^[가나다라마바사아자차카타파하][.]\s*/, '')
        // 연도 괄호: "(2024) " 앞에 붙은 것
        .replace(/^\(\d{4}\)\s*/, '')
        // 앞뒤 공백 정리
        .trim()
        // 내부 연속 공백 → 1칸
        .replace(/\s+/g, ' ')
        .toLowerCase();
}

function renderAbfMultiFileList() {
    const listEl = document.getElementById('abf-multi-file-list');
    const itemsEl = document.getElementById('abf-multi-file-items');
    if (!listEl || !itemsEl) return;
    if (_abfMultiFiles.length === 0) { listEl.style.display = 'none'; return; }
    listEl.style.display = '';

    const typeInfo = {
        pdf: '📕', hwp: '📘', hwpx: '📘', xlsx: '📗', xls: '📗',
        docx: '📄', doc: '📄', ppt: '📊', pptx: '📊'
    };

    const validCnt   = _abfMultiFiles.filter(f => f.ok).length;
    const invalidCnt  = _abfMultiFiles.length - validCnt;

    // 가상 스크롤: 500개 초과면 앞 500개만 렌더링 (DOM 성능)
    const RENDER_LIMIT = 500;
    const displayFiles = _abfMultiFiles.slice(0, RENDER_LIMIT);
    const hiddenCnt    = _abfMultiFiles.length - displayFiles.length;

    itemsEl.innerHTML = `
        <div style="font-size:12px;font-weight:700;color:#6b7280;margin-bottom:6px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span>선택된 파일 <strong style="color:#1a56db;">${_abfMultiFiles.length}개</strong></span>
            <span style="color:#16a34a;">✓ 등록 가능 ${validCnt}개</span>
            ${invalidCnt > 0 ? `<span style="color:#dc2626;">✗ 불가 ${invalidCnt}개</span>` : ''}
            <button onclick="_abfMultiFiles=[];renderAbfMultiFileList();document.getElementById('abf-multi-input').value='';"
                style="margin-left:auto;background:none;border:none;color:#dc2626;cursor:pointer;font-size:11px;">
                <i class="fas fa-times"></i> 전체 취소
            </button>
        </div>
        ${displayFiles.map((f, i) => `
            <div class="abf-multi-item ${f.ok ? '' : 'abf-multi-item-error'}">
                <span class="abf-multi-icon">${typeInfo[f.ext] || '📄'}</span>
                <div class="abf-multi-info">
                    <span class="abf-multi-title">${authEscHtml(f.title)}</span>
                    <span class="abf-multi-meta">${f.ext.toUpperCase()} · ${abfFormatSize2(f.size)}</span>
                </div>
                ${f.ok
                    ? `<span class="abf-multi-badge ok">✓ 등록 가능</span>`
                    : `<span class="abf-multi-badge err">✗ 불가 형식</span>`}
                <button onclick="_abfMultiFiles.splice(${i},1);renderAbfMultiFileList();"
                    style="background:none;border:none;cursor:pointer;color:#9ca3af;padding:4px;">
                    <i class="fas fa-times"></i>
                </button>
            </div>`).join('')}
        ${hiddenCnt > 0 ? `<div style="text-align:center;padding:8px;font-size:12px;color:#6b7280;">... 외 ${hiddenCnt}개 더 있음 (모두 등록 버튼 클릭 시 전부 처리됩니다)</div>` : ''}
    `;
}

async function adminMultiUpload() {
    const dept   = (document.getElementById('abf-multi-dept')?.value || '').trim();
    const source = (document.getElementById('abf-multi-source')?.value || '').trim();
    const errEl  = document.getElementById('abf-multi-error');

    if (!dept)  { showAuthError(errEl, '부서를 선택해주세요.'); return; }
    const validFiles = _abfMultiFiles.filter(f => f.ok);
    if (validFiles.length === 0) { showAuthError(errEl, '등록 가능한 파일을 선택해주세요.'); return; }
    errEl.classList.add('hidden');

    const btn      = document.getElementById('btn-abf-multi-upload');
    const progWrap = document.getElementById('abf-multi-progress');
    const progBar  = document.getElementById('abf-progress-bar');
    const progText = document.getElementById('abf-progress-text');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> DB 확인 중...'; }
    if (progWrap) progWrap.style.display = '';
    if (progBar)  progBar.style.width = '5%';
    if (progText) progText.textContent = '기존 DB 전체 조회 중...';

    // ══════════════════════════════════════════════════════════════
    // STEP 1 : 기존 DB 전체 로드 (캐시 우선, 없으면 직접 페이징)
    // ══════════════════════════════════════════════════════════════
    let existingForms = [];
    try {
        const cached = (typeof _dbCache !== 'undefined' && _dbCache.base_forms) || null;
        if (cached && cached.length > 0) {
            existingForms = cached;
        } else {
            // ★ GenSpark API 최대 200개 제한 → PAGE=200, total 기반 종료
            const PAGE = 200; let page = 1; let tot = null;
            while (true) {
                const r = await fetch(apiUrl(`tables/base_forms?page=${page}&limit=${PAGE}`));
                if (!r.ok) break;
                const d = await r.json();
                const chunk = d.data || [];
                existingForms = existingForms.concat(chunk);
                if (tot === null) tot = d.total || 0;
                if (chunk.length === 0 || existingForms.length >= tot) break;
                page++;
            }
            console.log(`[Admin] 기존 base_forms ${existingForms.length}건 로드 (서버 total: ${tot})`);
        }
    } catch(e) { /* DB 로드 실패 시 그냥 진행 */ }

    if (progBar) progBar.style.width = '15%';
    if (progText) progText.textContent = `DB ${existingForms.length}건 확인 완료. 분류 중...`;

    // ══════════════════════════════════════════════════════════════
    // STEP 2 : 파일을 3가지로 분류
    //   ① dupSkip  : 파일명+크기 완전 일치 → 건너뜀 (완전 중복)
    //   ② toReplace: 제목 일치 + 기존 항목에 파일 없음 → PATCH 교체
    //   ③ toUpload : 신규 → POST 등록
    // ══════════════════════════════════════════════════════════════

    // ★ 기존 파일 맵: "파일명소문자|크기" → true  (완전 중복 판단용)
    const existingFileKeySet = new Set(
        existingForms
            .filter(r => r.file_name && r.file_name.trim())
            .map(r => `${r.file_name.trim().toLowerCase()}|${(r.file_size||'').trim()}`)
    );

    // ★ 기존 항목 중 파일 없는 것: 정규화 제목 → { id, ... }  (교체 대상)
    const noFileByTitle = new Map();
    existingForms.forEach(r => {
        const hasFile = (r.file_name && r.file_name.trim()) ||
                        (r.download_url && r.download_url.trim()) ||
                        (r.search_url && r.search_url.trim());
        if (!hasFile) {
            // 원본 제목과 정규화 제목 둘 다 등록 (더 넓게 매칭)
            const normKey  = abfNormalizeTitle(r.title);
            const plainKey = (r.title||'').trim().toLowerCase();
            noFileByTitle.set(normKey, r);
            if (plainKey !== normKey) noFileByTitle.set(plainKey, r);
        }
    });

    // ★ 기존 항목 중 파일 있는 것: 정규화 제목 → true  (신규 중복 판단)
    const existingTitleWithFile = new Set();
    existingForms.forEach(r => {
        const hasFile = (r.file_name && r.file_name.trim()) ||
                        (r.download_url && r.download_url.trim());
        if (hasFile) {
            existingTitleWithFile.add(abfNormalizeTitle(r.title));
            existingTitleWithFile.add((r.title||'').trim().toLowerCase());
        }
    });

    const dupSkip    = [];   // ① 완전 중복 → 건너뜀
    const toReplace  = [];   // ② 파일 없는 항목과 제목 일치 → PATCH 교체
    const toUpload   = [];   // ③ 신규 → POST

    for (const f of validFiles) {
        const sizeStr      = abfFormatSize2(f.size);
        const fileKey      = `${f.file.name.trim().toLowerCase()}|${sizeStr}`;
        const titleNorm    = abfNormalizeTitle(f.title);   // 앞 번호 제거 정규화
        const titlePlain   = f.title.trim().toLowerCase(); // 원본 소문자

        if (existingFileKeySet.has(fileKey)) {
            // 파일명+크기 완전 동일 → 진짜 중복
            dupSkip.push(f);
        } else if (noFileByTitle.has(titleNorm) || noFileByTitle.has(titlePlain)) {
            // 기존에 파일 없는 항목과 제목 일치 (정규화 포함) → 교체
            const existRow = noFileByTitle.get(titleNorm) || noFileByTitle.get(titlePlain);
            toReplace.push({ f, existRow });
        } else if (existingTitleWithFile.has(titleNorm) || existingTitleWithFile.has(titlePlain)) {
            // 이미 파일 있는 항목과 제목 일치 → 중복
            dupSkip.push(f);
        } else {
            // 완전 신규
            toUpload.push(f);
        }
    }

    if (progBar) progBar.style.width = '20%';

    const totalWork = toReplace.length + toUpload.length;
    if (totalWork === 0) {
        const msg = `⛔ 선택한 파일 ${dupSkip.length}건 모두 이미 등록된 파일입니다.`;
        if (progText) progText.textContent = msg;
        showToast(msg);
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-layer-group"></i> 선택한 파일 모두 등록'; }
        return;
    }

    // 중복 건너뜀 안내
    if (dupSkip.length > 0) {
        const names = dupSkip.slice(0,3).map(f=>f.title||f.file?.name).join(', ');
        const more  = dupSkip.length > 3 ? ` 외 ${dupSkip.length-3}건` : '';
        if (progText) progText.textContent =
            `⚠️ "${names}"${more} 중복 → 건너뜀. 교체 ${toReplace.length}건 + 신규 ${toUpload.length}건 등록 시작...`;
        await new Promise(r => setTimeout(r, 1500));
    }

    // ══════════════════════════════════════════════════════════════
    // STEP 3 : 교체 (PATCH) – 파일 없는 기존 항목에 파일 데이터 주입
    // ══════════════════════════════════════════════════════════════
    let replaced = 0, replFail = 0;
    const BATCH = 3; // GitHub API 속도 제한 고려 (병렬 3개)
    const successIds = [];

    // GitHub Token 사용 가능 여부 확인
    const useGitHub = typeof githubUploadFile === 'function' && typeof getGithubToken === 'function' && !!getGithubToken();
    if (useGitHub && progText) progText.textContent = '🐙 GitHub 연동 활성 – 파일을 GitHub에 저장합니다';
    else if (!useGitHub && progText) progText.textContent = '💾 GitHub 미설정 – DB에 직접 저장합니다';
    await new Promise(r => setTimeout(r, 800));

    if (toReplace.length > 0) {
        if (progText) progText.textContent = `🔄 파일 없는 항목 ${toReplace.length}건 자동 교체 중...`;
        for (let i = 0; i < toReplace.length; i += BATCH) {
            const batch = toReplace.slice(i, i + BATCH);
            const pct = 20 + Math.round((i / toReplace.length) * 35);
            if (progBar) progBar.style.width = `${pct}%`;
            if (progText) progText.textContent =
                `🔄 교체 (${i+1}~${Math.min(i+BATCH, toReplace.length)}/${toReplace.length})...`;

            // 순차 처리 (GitHub API 속도 제한 방지)
            for (const { f, existRow } of batch) {
                try {
                    const base64 = await new Promise((res, rej) => {
                        const rd = new FileReader();
                        rd.onload  = e => res(e.target.result.split(',')[1]);
                        rd.onerror = rej;
                        rd.readAsDataURL(f.file);
                    });

                    let patch;
                    if (useGitHub) {
                        // ★ GitHub에 업로드 → raw URL만 DB에 저장
                        const ghResult = await githubUploadFile(dept, f.file.name, base64);
                        if (ghResult.success) {
                            patch = {
                                file_type:    f.ext,
                                file_name:    f.file.name,
                                file_size:    abfFormatSize2(f.size),
                                file_data:    '',      // DB에 base64 저장 안 함
                                github_path:  ghResult.path,
                                download_url: ghResult.url, // raw URL
                                has_file:     true,
                                source:       source || existRow.source || '',
                                uploaded_by:  'admin',
                                uploaded_at:  new Date().toLocaleString('ko-KR')
                            };
                        } else {
                            console.warn(`[GitHub 교체 실패] ${f.title}: ${ghResult.error} → DB 직접 저장으로 fallback`);
                            patch = {
                                file_type:   f.ext, file_name: f.file.name,
                                file_size:   abfFormatSize2(f.size), file_data: base64,
                                has_file:    true, source: source || existRow.source || '',
                                uploaded_by: 'admin', uploaded_at: new Date().toLocaleString('ko-KR')
                            };
                        }
                    } else {
                        // GitHub 미설정 → 기존 방식 (DB 직접 저장)
                        patch = {
                            file_type:   f.ext,
                            file_name:   f.file.name,
                            file_size:   abfFormatSize2(f.size),
                            file_data:   base64,
                            has_file:    true,
                            source:      source || existRow.source || '',
                            uploaded_by: 'admin',
                            uploaded_at: new Date().toLocaleString('ko-KR')
                        };
                    }

                    const r = await fetch(apiUrl(`tables/base_forms/${existRow.id}`), {
                        method:  'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body:    JSON.stringify(patch)
                    });
                    if (r.ok) {
                        replaced++;
                        successIds.push({ id: existRow.id, title: f.title, ext: f.ext, base64 });
                    } else { replFail++; console.warn(`[교체 실패] ${f.title}: HTTP ${r.status}`); }
                } catch(e) { replFail++; console.warn(`[교체 오류] ${f.title}:`, e.message); }
            }
        }
    }

    // ══════════════════════════════════════════════════════════════
    // STEP 4 : 신규 등록 (POST)
    // ══════════════════════════════════════════════════════════════
    let success = 0, fail = 0;

    if (toUpload.length > 0) {
        if (progText) progText.textContent = `📥 신규 ${toUpload.length}건 등록 중...`;
        let globalIdx = 0;
        for (let i = 0; i < toUpload.length; i += BATCH) {
            const batch = toUpload.slice(i, i + BATCH);
            const pct = 55 + Math.round((i / toUpload.length) * 40);
            if (progBar) progBar.style.width = `${pct}%`;
            if (progText) progText.textContent =
                `📥 신규 등록 (${i+1}~${Math.min(i+BATCH, toUpload.length)}/${toUpload.length})...`;

            // 순차 처리 (GitHub API 속도 제한 방지)
            for (const f of batch) {
                try {
                    const base64 = await new Promise((res, rej) => {
                        const rd = new FileReader();
                        rd.onload  = e => res(e.target.result.split(',')[1]);
                        rd.onerror = rej;
                        rd.readAsDataURL(f.file);
                    });

                    let ghPath = '', ghUrl = '';
                    if (useGitHub) {
                        // ★ GitHub에 업로드
                        const ghResult = await githubUploadFile(dept, f.file.name, base64);
                        if (ghResult.success) {
                            ghPath = ghResult.path;
                            ghUrl  = ghResult.url; // raw URL
                            console.log(`[GitHub 업로드] ${f.title} → ${ghUrl}`);
                        } else {
                            console.warn(`[GitHub 신규 실패] ${f.title}: ${ghResult.error} → DB 직접 저장으로 fallback`);
                        }
                    }

                    const payload = {
                        title:        f.title,
                        dept,
                        desc:         '',
                        source,
                        file_type:    f.ext,
                        file_name:    f.file.name,
                        file_size:    abfFormatSize2(f.size),
                        // GitHub 성공 시 raw URL만 저장, 실패/미설정 시 base64 직접 저장
                        file_data:    ghUrl ? '' : base64,
                        github_path:  ghPath,
                        download_url: ghUrl,
                        has_file:     true,
                        search_url:   '',
                        sort_order:   ++globalIdx,
                        uploaded_by:  'admin',
                        uploaded_at:  new Date().toLocaleString('ko-KR')
                    };
                    const r = await fetch(apiUrl('tables/base_forms'), {
                        method:  'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body:    JSON.stringify(payload)
                    });
                    if (r.ok) {
                        success++;
                        const saved = await r.json().catch(() => ({}));
                        if (saved.id) successIds.push({ id: saved.id, title: f.title, ext: f.ext, base64 });
                    } else { fail++; console.warn(`[신규 실패] ${f.title}: HTTP ${r.status}`); }
                } catch(e) { fail++; console.warn(`[신규 오류] ${f.title}:`, e.message); }
            }
        }
    }

    // ══════════════════════════════════════════════════════════════
    // STEP 5 : 완료 처리
    // ══════════════════════════════════════════════════════════════
    if (progBar) progBar.style.width = '100%';

    const parts = [];
    if (replaced > 0)    parts.push(`교체 ${replaced}건`);
    if (success > 0)     parts.push(`신규 ${success}건`);
    if (dupSkip.length)  parts.push(`중복 건너뜀 ${dupSkip.length}건`);
    const failTotal = fail + replFail;
    if (failTotal > 0)   parts.push(`실패 ${failTotal}건`);
    const resultMsg = parts.join(' / ');

    if (progText) progText.textContent = `✅ 완료: ${resultMsg}`;
    showToast(`✅ ${resultMsg}`);

    // Gemini 지식 추출 (백그라운드)
    if (successIds.length > 0 && typeof extractAndSaveFormKnowledge === 'function') {
        (async () => {
            for (const item of successIds) {
                await extractAndSaveFormKnowledge(item.id, 'base_forms', dept, item.title, item.ext, item.base64);
                await new Promise(r => setTimeout(r, 500));
            }
        })();
    }

    // 캐시 무효화 → 전체 DB 새로 로드
    if (typeof invalidateDbCache === 'function') {
        invalidateDbCache('base_forms');
        invalidateDbCache('user_forms');
    }
    if (typeof window._resetFormsCounts === 'function') window._resetFormsCounts();

    setTimeout(() => {
        if (progWrap) progWrap.style.display = 'none';
        if (progBar)  progBar.style.width = '0%';
        _abfMultiFiles = [];
        renderAbfMultiFileList();
        document.getElementById('abf-multi-input').value = '';
        document.getElementById('abf-multi-dept').value  = '';
        if (document.getElementById('abf-multi-source')) document.getElementById('abf-multi-source').value = '';
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-layer-group"></i> 선택한 파일 모두 등록'; }
        loadAdminBaseForms();
        if (typeof loadFormsPageCounts === 'function') loadFormsPageCounts();
    }, 2000);
}

// ============================================================
// 관리자: base_forms 업로드 (서식 DB 관리)
// ============================================================
let _abfEventsInit = false;
let _abfFile = null;

function initAbfEvents() {
    if (_abfEventsInit) return;
    _abfEventsInit = true;

    // 다중 드롭
    const multiDrop = document.getElementById('abf-multi-drop');
    if (multiDrop) {
        multiDrop.addEventListener('dragover', e => { e.preventDefault(); multiDrop.classList.add('drag-over'); });
        multiDrop.addEventListener('dragleave', () => multiDrop.classList.remove('drag-over'));
        multiDrop.addEventListener('drop', e => {
            e.preventDefault();
            multiDrop.classList.remove('drag-over');
            abfMultiFilesSelected(e.dataTransfer.files);
        });
    }

    const drop = document.getElementById('abf-file-drop');
    const input = document.getElementById('abf-file-input');
    if (!drop || !input) return;

    drop.addEventListener('click', () => input.click());
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag-over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('drag-over'));
    drop.addEventListener('drop', e => {
        e.preventDefault();
        drop.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) abfSetFile(file);
    });
    input.addEventListener('change', () => {
        if (input.files[0]) abfSetFile(input.files[0]);
    });
}

function abfSetFile(file) {
    const allowed = ['hwp','hwpx','pdf','xlsx','xls','docx','doc','ppt','pptx'];
    const ext = file.name.split('.').pop().toLowerCase();
    if (!allowed.includes(ext)) { showToast('❌ 지원하지 않는 형식입니다.'); return; }
    // 파일 크기 제한 없음 (모든 용량 허용)
    _abfFile = file;

    const drop = document.getElementById('abf-file-drop');
    const sel  = document.getElementById('abf-file-selected');
    const nm   = document.getElementById('abf-file-name');
    const sz   = document.getElementById('abf-file-size');
    if (drop) drop.style.display = 'none';
    if (sel)  sel.style.display  = 'flex';
    if (nm)   nm.textContent = file.name;
    if (sz)   sz.textContent = abfFormatSize(file.size);
}

function abfClearFile() {
    _abfFile = null;
    const drop  = document.getElementById('abf-file-drop');
    const sel   = document.getElementById('abf-file-selected');
    const input = document.getElementById('abf-file-input');
    if (drop)  drop.style.display  = '';
    if (sel)   sel.style.display   = 'none';
    if (input) input.value = '';
}

function abfFormatSize(bytes) {
    if (bytes < 1024)      return bytes + 'B';
    if (bytes < 1048576)   return (bytes / 1024).toFixed(1) + 'KB';
    return (bytes / 1048576).toFixed(1) + 'MB';
}

async function adminUploadBaseForm() {
    const title       = (document.getElementById('abf-title')?.value || '').trim();
    const dept        = (document.getElementById('abf-dept')?.value || '').trim();
    const desc        = (document.getElementById('abf-desc')?.value || '').trim();
    const source      = (document.getElementById('abf-source')?.value || '').trim();
    const order       = parseInt(document.getElementById('abf-order')?.value || '10', 10);
    const dlUrl       = (document.getElementById('abf-download-url')?.value || '').trim();
    const searchUrl   = (document.getElementById('abf-search-url')?.value || '').trim();
    const errEl       = document.getElementById('abf-error');

    // 유효성 검사
    if (!title) { showAuthError(errEl, '서식 제목을 입력해주세요.'); return; }
    if (!dept)  { showAuthError(errEl, '부서를 선택해주세요.'); return; }
    if (!_abfFile && !dlUrl && !searchUrl) {
        showAuthError(errEl, '파일 또는 URL(직접 다운로드/검색) 중 하나는 입력해주세요.');
        return;
    }
    errEl.classList.add('hidden');

    const btn = document.getElementById('btn-abf-upload');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 중복 확인 중...'; }

    try {
        let base64 = '';
        let ext    = 'hwp';
        let fname  = '';
        let fsize  = '';

        if (_abfFile) {
            base64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload  = e => resolve(e.target.result.split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(_abfFile);
            });
            ext   = _abfFile.name.split('.').pop().toLowerCase();
            fname = _abfFile.name;
            fsize = abfFormatSize(_abfFile.size);
        }

        // ── ★ 단건 중복 감지 ──────────────────────────────────
        if (fname || title) {
            try {
                const existRows = (typeof _dbCache !== 'undefined' && _dbCache.base_forms) || [];
                const isDupTitle = existRows.some(r => (r.title||'').trim().toLowerCase() === title.toLowerCase());
                const isDupFile  = fname && existRows.some(r =>
                    (r.file_name||'').trim().toLowerCase() === fname.trim().toLowerCase() &&
                    (r.file_size||'').trim() === fsize.trim()
                );
                if (isDupTitle || isDupFile) {
                    const confirmed = window.confirm(
                        `⚠️ 중복 파일 감지!\n\n` +
                        `"${title}"${isDupFile ? ' (파일명·크기 동일)' : ' (제목 동일)'}\n` +
                        `이미 동일한 서식이 등록되어 있습니다.\n그래도 등록하시겠습니까?`
                    );
                    if (!confirmed) {
                        showToast('⛔ 중복 파일 등록이 취소되었습니다.');
                        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-upload"></i> 서식 DB에 등록'; }
                        return;
                    }
                }
            } catch(ce) { /* 중복 체크 실패 시 그냥 진행 */ }
        }

        if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 등록 중...';

        // ★ GitHub 연동: 파일이 있으면 GitHub에 업로드 후 raw URL만 DB에 저장
        let ghPath = '', ghUrl = '';
        const useGitHub = _abfFile && typeof githubUploadFile === 'function' && typeof getGithubToken === 'function' && !!getGithubToken();
        if (useGitHub && base64) {
            if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> GitHub에 업로드 중...';
            const ghResult = await githubUploadFile(dept, fname, base64);
            if (ghResult.success) {
                ghPath = ghResult.path;
                ghUrl  = ghResult.url;
                console.log(`[GitHub 단건 업로드] ${title} → ${ghUrl}`);
            } else {
                console.warn('[GitHub 단건 업로드 실패]', ghResult.error, '→ DB 직접 저장으로 fallback');
            }
            if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> DB에 등록 중...';
        }

        const payload = {
            title,
            dept,
            desc,
            source,
            file_type:    ext,
            file_name:    fname || title + '.' + ext,
            file_size:    fsize,
            // GitHub 성공 시 raw URL 저장, 실패 시 base64 직접 저장
            file_data:    ghUrl ? '' : base64,
            github_path:  ghPath,
            has_file:     !!(base64 && base64.length > 50),
            download_url: ghUrl || dlUrl,
            search_url:   searchUrl,
            sort_order:   order,
            uploaded_by:  'admin',
            uploaded_at:  new Date().toLocaleString('ko-KR')
        };

        const res = await fetch(apiUrl('tables/base_forms'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('등록 실패 (HTTP ' + res.status + ')');

        const saved = await res.json().catch(() => ({}));
        showToast(`✅ "${title}" (${ext.toUpperCase()}) 등록 완료!`);

        // ★ Gemini 지식 추출 (비동기)
        if (saved.id && typeof extractAndSaveFormKnowledge === 'function') {
            extractAndSaveFormKnowledge(saved.id, 'base_forms', dept, title, ext, base64);
        }
        // 입력 초기화
        document.getElementById('abf-title').value = '';
        document.getElementById('abf-desc').value  = '';
        if (document.getElementById('abf-source')) document.getElementById('abf-source').value = '';
        document.getElementById('abf-order').value = '10';
        document.getElementById('abf-dept').value  = '';
        if (document.getElementById('abf-download-url')) document.getElementById('abf-download-url').value = '';
        if (document.getElementById('abf-search-url')) document.getElementById('abf-search-url').value = '';
        abfClearFile();
        // ★ 캐시 즉시 무효화 (다른 부서 데이터 포함 전체 DB 새로 로드)
        if (typeof invalidateDbCache === 'function') {
            invalidateDbCache('base_forms');
        }
        if (typeof window._resetFormsCounts === 'function') window._resetFormsCounts();
        loadAdminBaseForms();
        if (typeof loadFormsPageCounts === 'function') loadFormsPageCounts();

    } catch(e) {
        showAuthError(errEl, '등록 오류: ' + e.message);
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-upload"></i> 서식 DB에 등록'; }
    }
}

// ============================================================
// DB 정밀 검수: 상세 API로 file_data 실제 확인 → 불가 항목 삭제
//              + 앞 번호 제거 기준 제목 중복 탐지 → 구버전 삭제
// ============================================================
async function runDeepDbAudit() {
    const auditBtn  = document.getElementById('btn-deep-audit');
    const auditLog  = document.getElementById('deep-audit-log');
    const auditBar  = document.getElementById('deep-audit-bar');
    const auditPct  = document.getElementById('deep-audit-pct');

    if (auditBtn) { auditBtn.disabled = true; auditBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 검수 중...'; }
    const log = (msg, type='info') => {
        if (!auditLog) return;
        const color = type==='del'?'#dc2626': type==='dup'?'#d97706': type==='ok'?'#16a34a':'#374151';
        auditLog.innerHTML += `<div style="color:${color};font-size:12px;line-height:1.6;">${msg}</div>`;
        auditLog.scrollTop = auditLog.scrollHeight;
    };
    const setBar = (pct, label) => {
        if (auditBar) auditBar.style.width = pct + '%';
        if (auditPct) auditPct.textContent = label;
    };

    if (auditLog) auditLog.innerHTML = '';
    log('🔍 DB 전체 목록 조회 중...');
    setBar(2, '목록 조회 중...');

    // ── 1) 전체 목록 로드 ──
    let allRows = [];
    try {
        // ★ GenSpark API 최대 200개 제한 → PAGE=200, total 기반 종료
        const PAGE = 200; let page = 1; let tot = null;
        while (true) {
            const r = await fetch(apiUrl(`tables/base_forms?page=${page}&limit=${PAGE}`));
            if (!r.ok) break;
            const d = await r.json();
            const chunk = d.data || [];
            allRows = allRows.concat(chunk);
            if (tot === null) tot = d.total || 0;
            if (chunk.length === 0 || allRows.length >= tot) break;
            page++;
        }
    } catch(e) { log('❌ 목록 조회 실패: ' + e.message, 'del'); }

    log(`📋 총 ${allRows.length}건 로드 완료 (서버 total 기준)`);
    setBar(10, `${allRows.length}건 로드`);

    // ── 2) 앞 번호 제거 기준 제목 중복 탐지 ──
    // 정규화 제목 → [레코드 배열] 맵 구성
    const titleMap = new Map();
    allRows.forEach(r => {
        const key = abfNormalizeTitle(r.title);
        if (!titleMap.has(key)) titleMap.set(key, []);
        titleMap.get(key).push(r);
    });

    const toDeleteIds  = new Set(); // 삭제 예정 ID
    let   dupCount     = 0;

    // 중복 그룹: 파일 있는 것 남기고 나머지 삭제
    for (const [key, group] of titleMap.entries()) {
        if (group.length <= 1) continue;
        // 파일 있는 것(file_name 존재)과 없는 것 분리
        const withFile    = group.filter(r => r.file_name && r.file_name.trim());
        const withoutFile = group.filter(r => !(r.file_name && r.file_name.trim()));

        if (withFile.length > 0) {
            // 파일 있는 것 중 최신 1개 남기고 나머지 + 파일 없는 것 전부 삭제
            const keep = withFile.sort((a,b) => (b.created_at||0)-(a.created_at||0))[0];
            [...withFile.slice(1), ...withoutFile].forEach(r => {
                if (!toDeleteIds.has(r.id)) {
                    toDeleteIds.add(r.id);
                    dupCount++;
                    log(`🔁 중복 삭제 예정: "${r.title}" (정규화:"${key}") → 최신 "${keep.title}" 유지`, 'dup');
                }
            });
        } else {
            // 모두 파일 없음: 최신 1개 남기고 나머지 삭제
            const keep = withoutFile.sort((a,b) => (b.created_at||0)-(a.created_at||0))[0];
            withoutFile.slice(1).forEach(r => {
                if (!toDeleteIds.has(r.id)) {
                    toDeleteIds.add(r.id);
                    dupCount++;
                    log(`🔁 중복(파일없음) 삭제 예정: "${r.title}"`, 'dup');
                }
            });
        }
    }

    log(`🔁 중복 탐지: ${dupCount}건 삭제 예정`);
    setBar(20, '상세 검수 시작...');

    // ── 3) 상세 조회: file_data 실제 존재 확인 (중복 예정 제외) ──
    const remaining = allRows.filter(r => !toDeleteIds.has(r.id));
    let noFileCount = 0;
    const BATCH = 5; // 동시 5건씩 조회

    for (let i = 0; i < remaining.length; i += BATCH) {
        const chunk = remaining.slice(i, i + BATCH);
        const pct   = 20 + Math.round((i / remaining.length) * 70);
        setBar(pct, `${i+1}/${remaining.length} 검수 중...`);

        await Promise.all(chunk.map(async row => {
            try {
                const res  = await fetch(apiUrl(`tables/base_forms/${row.id}`));
                if (!res.ok) {
                    // 조회 자체 실패 → 삭제
                    toDeleteIds.add(row.id); noFileCount++;
                    log(`❌ 조회 실패(${res.status}) → 삭제: "${row.title}"`, 'del');
                    return;
                }
                const detail = await res.json();
                const hasData = detail.file_data && detail.file_data.length > 20;
                const hasUrl  = (detail.download_url && detail.download_url.trim().length > 5) ||
                                (detail.search_url   && detail.search_url.trim().length > 5);
                const hasFname= detail.file_name && detail.file_name.trim().length > 0;

                if (!hasData && !hasUrl && !hasFname) {
                    toDeleteIds.add(row.id); noFileCount++;
                    log(`🗑️ 파일 없음 → 삭제: "${row.title}"`, 'del');
                }
                // has_file 플래그 보정
                if (hasData && (!detail.has_file || detail.has_file === 'false')) {
                    await fetch(apiUrl(`tables/base_forms/${row.id}`), {
                        method: 'PATCH',
                        headers: {'Content-Type':'application/json'},
                        body: JSON.stringify({ has_file: true })
                    }).catch(()=>{});
                }
            } catch(e) {
                log(`⚠️ 검수 오류(${row.title}): ${e.message}`);
            }
        }));

        // 과부하 방지: 50건마다 100ms 대기
        if (i % 50 === 0 && i > 0) await new Promise(r => setTimeout(r, 100));
    }

    log(`🗑️ 다운로드 불가 탐지: ${noFileCount}건`);
    setBar(90, '삭제 실행 중...');

    // ── 4) 실제 삭제 실행 ──
    const deleteArr = [...toDeleteIds];
    let deleted = 0, delFail = 0;
    for (let i = 0; i < deleteArr.length; i += 10) {
        await Promise.all(deleteArr.slice(i, i+10).map(async id => {
            try {
                const r = await fetch(apiUrl(`tables/base_forms/${id}`), { method: 'DELETE' });
                if (r.ok || r.status === 204) { deleted++; }
                else { delFail++; log(`⚠️ 삭제 실패 (${id}): HTTP ${r.status}`); }
            } catch(e) { delFail++; }
        }));
    }

    setBar(100, '완료');

    const summary = `✅ 검수 완료 — 총 ${allRows.length}건 검사 / 중복 ${dupCount}건 + 파일없음 ${noFileCount}건 = 총 ${deleted}건 삭제${delFail > 0 ? ` (실패 ${delFail}건)` : ''}`;
    log(summary, 'ok');
    showToast(summary);

    // 캐시 무효화 후 목록 갱신
    if (typeof invalidateDbCache === 'function') {
        invalidateDbCache('base_forms');
        invalidateDbCache('user_forms');
    }
    if (typeof window._resetFormsCounts === 'function') window._resetFormsCounts();
    await loadAdminBaseForms();
    if (typeof loadFormsPageCounts === 'function') loadFormsPageCounts();

    if (auditBtn) { auditBtn.disabled = false; auditBtn.innerHTML = '<i class="fas fa-microscope"></i> DB 정밀 검수 실행'; }
}

async function loadAdminBaseForms() {
    const container  = document.getElementById('admin-bf-list');
    const countEl    = document.getElementById('abf-list-count');
    if (!container) return;
    container.innerHTML = `<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>로딩 중...</p></div>`;

    try {
        // ★ forceRefresh=true: 업로드/삭제 후 항상 최신 DB에서 직접 조회 (캐시 무시)
        const rows = (await fetchAllPages('base_forms', true))
            .sort((a,b) => (a.dept||'').localeCompare(b.dept||'') || (a.sort_order||0) - (b.sort_order||0));

        if (countEl) countEl.textContent = `총 ${rows.length}개`;

        if (rows.length === 0) {
            container.innerHTML = `<div class="empty-state"><i class="fas fa-folder-open"></i><p>등록된 서식이 없습니다</p></div>`;
            return;
        }

        container.innerHTML = rows.map(r => {
            const ext = (r.file_type || '').toUpperCase();
            const extCls = r.file_type === 'pdf' ? 'ext-pdf' : (r.file_type?.startsWith('hw') ? 'ext-hwp' : 'ext-other');
            // file_name 존재 여부로 파일 업로드 판단 (목록 API에서 file_data는 잘려서 옴)
            const hasFile = !!(r.file_name && r.file_name.trim());
            const hasUrl  = !!(r.download_url || r.search_url);
            const typeBadge = hasFile
                ? `<span class="abf-type-badge abf-has-file" title="파일 저장됨">💾 파일</span>`
                : hasUrl
                    ? `<span class="abf-type-badge abf-has-url" title="외부 URL 연결">🔗 링크</span>`
                    : `<span class="abf-type-badge abf-no-data" title="데이터 없음">⚠️ 미등록</span>`;
            return `<div class="admin-bf-item">
                <div class="admin-bf-info">
                    <span class="admin-bf-dept">${authEscHtml(r.dept)}</span>
                    <strong>${authEscHtml(r.title)}</strong>
                    <span class="admin-bf-ext ${extCls}">${ext}</span>
                    ${typeBadge}
                    <span style="font-size:11px;color:#9ca3af;">${authEscHtml(r.file_size||'')}</span>
                </div>
                <button class="btn-del-member" title="삭제" onclick="deleteBaseForm('${r.id}','${authEscHtml(r.title)}', this)">
                    <i class="fas fa-trash"></i>
                </button>
            </div>`;
        }).join('');

    } catch(e) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>오류: ${e.message}</p></div>`;
    }
}

async function deleteBaseForm(id, title, btn) {
    if (!confirm(`"${title}" 서식을 삭제하시겠습니까?`)) return;
    if (btn) btn.disabled = true;
    try {
        const res = await fetch(apiUrl(`tables/base_forms/${id}`), { method: 'DELETE' });
        if (!res.ok && res.status !== 204) throw new Error('삭제 실패');
        showToast(`🗑️ "${title}" 삭제 완료`);
        loadAdminBaseForms();
    } catch(e) {
        showToast('❌ ' + e.message);
        if (btn) btn.disabled = false;
    }
}

// ============================================================
// 관리자: 회원 목록 로드 & 승인
// ============================================================
async function loadAdminMembers() {
    const container = document.getElementById('admin-members-list');
    if (!container) return;
    container.innerHTML = `<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>로딩 중...</p></div>`;

    try {
        const allRows = await fetchAllPages('users');

        // ── 등급 분류 ──
        const vipUsers     = allRows.filter(u => String(u.vip) === 'true');
        const pendingUsers = allRows.filter(u => String(u.vip) !== 'true' && String(u.approved) !== 'true');
        const approvedUsers= allRows.filter(u => String(u.vip) !== 'true' && String(u.approved) === 'true');

        // 각 그룹 내 등록일 최신순 정렬
        const sortByDate = arr => arr.sort((a,b) => (b.registered_at||'').localeCompare(a.registered_at||''));
        sortByDate(vipUsers); sortByDate(pendingUsers); sortByDate(approvedUsers);

        // 총 회원 수 표시
        const countEl = document.getElementById('admin-member-count');
        if (countEl) {
            countEl.textContent = `전체 ${allRows.length}명 (대기 ${pendingUsers.length} / 승인 ${approvedUsers.length} / VIP ${vipUsers.length})`;
        }

        if (allRows.length === 0) {
            container.innerHTML = `<div class="empty-state"><i class="fas fa-users"></i><p>회원이 없습니다</p></div>`;
            return;
        }

        // ── 회원 카드 HTML 생성 ──
        function memberCard(u) {
            const isApproved = String(u.approved) === 'true';
            const isVip      = String(u.vip) === 'true';
            const nameDisplay = u.full_name
                ? `<span style="color:#6366f1;font-weight:600;font-size:12px;">(${authEscHtml(u.full_name)})</span>` : '';
            const vipBadge = isVip
                ? `<span class="admin-member-badge badge-vip"><i class="fas fa-crown"></i> VIP</span>` : '';
            const cardClass = isVip ? 'vip' : (isApproved ? 'approved' : 'pending');

            return `
            <div class="admin-member-card ${cardClass}" id="member-card-${u.id}">
                <div class="admin-member-info">
                    <div class="admin-member-id">
                        ${isVip ? '<i class="fas fa-crown" style="color:#f59e0b;"></i>' : (isApproved ? '<i class="fas fa-user-check" style="color:#22c55e;"></i>' : '<i class="fas fa-user-clock" style="color:#f59e0b;"></i>')}
                        <strong>${authEscHtml(u.user_id)}</strong>
                        ${nameDisplay}
                        <span class="admin-member-badge ${isApproved ? 'badge-approved' : 'badge-pending'}">
                            ${isVip ? '👑 VIP' : (isApproved ? '✅ 승인됨' : '⏳ 대기 중')}
                        </span>
                        ${vipBadge && !isVip ? vipBadge : ''}
                    </div>
                    <div class="admin-member-detail">
                        <span><i class="fas fa-envelope"></i> ${authEscHtml(u.email||'-')}</span>
                        <span><i class="fas fa-school"></i> ${authEscHtml(u.school||'-')}</span>
                        <span><i class="fas fa-calendar"></i> ${authEscHtml(u.registered_at||'-')}</span>
                        <span><i class="fas fa-coins"></i> ${(u.points||0).toLocaleString()}P</span>
                        ${isVip
                            ? `<span style="color:#f59e0b;font-weight:700;"><i class="fas fa-infinity"></i> VIP – 무제한 이용</span>`
                            : (u.expires_at ? `<span><i class="fas fa-calendar-check"></i> 만료: ${new Date(u.expires_at).toLocaleDateString('ko-KR')}</span>` : '')
                        }
                    </div>
                </div>
                <div class="admin-member-actions">
                    ${!isApproved
                        ? `<button class="btn-approve" onclick="approveUser('${u.id}', this)">
                               <i class="fas fa-check"></i> 승인
                           </button>`
                        : `<button class="btn-revoke" onclick="revokeUser('${u.id}', this)">
                               <i class="fas fa-ban"></i> 승인취소
                           </button>`
                    }
                    <button class="btn-member-withdraw" onclick="withdrawUserByAdmin('${u.id}', '${authEscHtml(u.user_id)}', this)" title="강제 탈퇴 처리">
                        <i class="fas fa-user-slash"></i> 탈퇴
                    </button>
                    ${!isVip
                        ? `<button class="btn-member-vip" onclick="setVipUser('${u.id}', '${authEscHtml(u.user_id)}', this)" title="VIP 지정">
                               <i class="fas fa-crown"></i> VIP
                           </button>`
                        : `<button class="btn-member-unvip" onclick="unsetVipUser('${u.id}', '${authEscHtml(u.user_id)}', this)" title="VIP 해제">
                               <i class="fas fa-crown"></i> VIP해제
                           </button>`
                    }
                    <button class="btn-action" style="padding:5px 10px;font-size:11px;background:#6366f1;color:#fff;border:none;border-radius:6px;cursor:pointer;display:flex;align-items:center;gap:4px;"
                        onclick="openMemberEditModal('${u.id}','${authEscHtml(u.user_id)}','${authEscHtml(u.full_name||'')}','${authEscHtml(u.email||'')}','${authEscHtml(u.school||'')}','${u.approved||'false'}','${u.role||'user'}',${u.points||0},'${authEscHtml(u.expires_at||'')}')">
                        <i class="fas fa-edit"></i> 수정
                    </button>
                    <button class="btn-del-member" onclick="deleteUserByAdmin('${u.id}', '${authEscHtml(u.user_id)}', this)" title="회원 영구 삭제">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>`;
        }

        let html = '';

        // ── 1) 승인 대기 (최우선) ──
        if (pendingUsers.length > 0) {
            html += `<div class="member-group-header pending-group">
                <i class="fas fa-user-clock"></i> 승인 대기 <span class="member-group-count">${pendingUsers.length}명</span>
            </div>`;
            html += pendingUsers.map(memberCard).join('');
        }

        // ── 2) VIP ──
        if (vipUsers.length > 0) {
            html += `<div class="member-group-header vip-group" style="margin-top:${pendingUsers.length?'16px':'0'};">
                <i class="fas fa-crown"></i> VIP 회원 <span class="member-group-count">${vipUsers.length}명</span>
            </div>`;
            html += vipUsers.map(memberCard).join('');
        }

        // ── 3) 일반 승인 회원 ──
        if (approvedUsers.length > 0) {
            html += `<div class="member-group-header approved-group" style="margin-top:${(pendingUsers.length||vipUsers.length)?'16px':'0'};">
                <i class="fas fa-user-check"></i> 승인된 회원 <span class="member-group-count">${approvedUsers.length}명</span>
            </div>`;
            html += approvedUsers.map(memberCard).join('');
        }

        container.innerHTML = html;

    } catch(e) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>로딩 오류: ${e.message}</p></div>`;
    }
}

async function approveUser(userId, btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 처리 중...';
    const card = document.getElementById(`member-card-${userId}`);

    try {
        // 1단계: 현재 유저 레코드 전체 조회
        const getRes = await fetch(apiUrl(`tables/users/${userId}`));
        if (!getRes.ok) {
            const errText = await getRes.text();
            throw new Error(`유저 조회 실패 (${getRes.status}): ${errText}`);
        }
        const userData = await getRes.json();

        // 2단계: 전체 필드를 PUT으로 업데이트
        const expiresDate = new Date();
        expiresDate.setMonth(expiresDate.getMonth() + 1);
        const updatedData = { ...userData, approved: 'true', expires_at: expiresDate.toISOString() };
        delete updatedData.gs_project_id; delete updatedData.gs_table_name;
        delete updatedData.created_at;    delete updatedData.updated_at; delete updatedData.deleted;

        const res = await fetch(apiUrl(`tables/users/${userId}`), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedData)
        });
        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`승인 실패 (${res.status}): ${errText}`);
        }
        const expStr = expiresDate.toLocaleDateString('ko-KR');
        showToast(`✅ 승인 완료! 이용 기간: ${expStr}까지`);

        // ── 카드 즉시 UI 갱신 (전체 재로드 없이) ──
        if (card) {
            card.classList.remove('pending');
            card.classList.add('approved');
            // 배지 업데이트
            const badge = card.querySelector('.admin-member-badge.badge-pending');
            if (badge) { badge.className = 'admin-member-badge badge-approved'; badge.textContent = '✅ 승인됨'; }
            // 아이콘 업데이트
            const icon = card.querySelector('.admin-member-id i');
            if (icon) { icon.className = 'fas fa-user-check'; icon.style.color = '#22c55e'; }
            // 버튼 교체
            const approveBtn = card.querySelector('.btn-approve');
            if (approveBtn) {
                const revokeBtn = document.createElement('button');
                revokeBtn.className = 'btn-revoke';
                revokeBtn.innerHTML = '<i class="fas fa-ban"></i> 승인취소';
                revokeBtn.onclick = () => revokeUser(userId, revokeBtn);
                approveBtn.replaceWith(revokeBtn);
            }
            // 승인 대기 그룹에서 승인된 회원 그룹으로 이동
            const pendingGroup = card.previousElementSibling;
            let approvedGroupHeader = document.querySelector('.approved-group');
            if (!approvedGroupHeader) {
                approvedGroupHeader = document.createElement('div');
                approvedGroupHeader.className = 'member-group-header approved-group';
                approvedGroupHeader.innerHTML = '<i class="fas fa-user-check"></i> 승인된 회원 <span class="member-group-count">0명</span>';
                document.getElementById('admin-members-list').appendChild(approvedGroupHeader);
            }
            approvedGroupHeader.insertAdjacentElement('afterend', card);
            // 카운트 업데이트
            const pendingHeader = document.querySelector('.pending-group');
            if (pendingHeader) {
                const remaining = document.querySelectorAll('.admin-member-card.pending').length;
                const cnt = pendingHeader.querySelector('.member-group-count');
                if (cnt) cnt.textContent = remaining + '명';
                if (remaining === 0) pendingHeader.style.display = 'none';
            }
            const approvedHeader = document.querySelector('.approved-group');
            if (approvedHeader) {
                const approvedCnt = document.querySelectorAll('.admin-member-card.approved').length;
                const cnt = approvedHeader.querySelector('.member-group-count');
                if (cnt) cnt.textContent = approvedCnt + '명';
                approvedHeader.style.display = '';
            }
            // 상단 요약 업데이트
            const countEl = document.getElementById('admin-member-count');
            if (countEl) {
                const t = document.querySelectorAll('.admin-member-card').length;
                const p = document.querySelectorAll('.admin-member-card.pending').length;
                const a = document.querySelectorAll('.admin-member-card.approved').length;
                const v = document.querySelectorAll('.admin-member-card.vip').length;
                countEl.textContent = `전체 ${t}명 (대기 ${p} / 승인 ${a} / VIP ${v})`;
            }
        } else {
            loadAdminMembers(); // 카드를 못 찾으면 전체 재로드
        }
    } catch(e) {
        console.error('[AFTER] approveUser 오류:', e);
        showToast('❌ 오류: ' + e.message);
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check"></i> 승인';
    }
}

async function revokeUser(userId, btn) {
    btn.disabled = true;
    try {
        // 현재 레코드 전체 조회 후 PUT으로 업데이트
        const getRes = await fetch(apiUrl(`tables/users/${userId}`));
        if (!getRes.ok) throw new Error(`유저 조회 실패 (${getRes.status})`);
        const userData = await getRes.json();

        const updatedData = { ...userData, approved: 'false' };  // 반드시 문자열
        delete updatedData.gs_project_id;
        delete updatedData.gs_table_name;
        delete updatedData.created_at;
        delete updatedData.updated_at;
        delete updatedData.deleted;

        const res = await fetch(apiUrl(`tables/users/${userId}`), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedData)
        });
        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`취소 실패 (${res.status}): ${errText}`);
        }
        showToast('⚠️ 승인이 취소되었습니다.');
        loadAdminMembers();
    } catch(e) {
        showToast('❌ 오류: ' + e.message);
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-ban"></i> 취소';
    }
}

async function deleteUserByAdmin(userId, userIdText, btn) {
    if (!confirm(`"${userIdText}" 회원을 삭제하시겠습니까?`)) return;
    btn.disabled = true;
    try {
        const res = await fetch(apiUrl(`tables/users/${userId}`), { method: 'DELETE' });
        if (!res.ok && res.status !== 204) throw new Error('삭제 실패');
        showToast('🗑️ 회원이 삭제되었습니다.');
        loadAdminMembers();
    } catch(e) {
        showToast('❌ 오류: ' + e.message);
        btn.disabled = false;
    }
}

// ============================================================
// VIP 지정 / 해제
// ============================================================
async function setVipUser(userId, userIdText, btn) {
    if (!confirm(`"${userIdText}" 회원을 VIP로 지정하시겠습니까?\nVIP는 포인트 차감 없이 모든 기능을 무료로 이용합니다.`)) return;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    try {
        const res = await fetch(apiUrl(`tables/users/${userId}`));
        if (!res.ok) throw new Error('회원 정보 조회 실패');
        const user = await res.json();
        const updated = { ...user, vip: 'true', approved: 'true' };
        ['gs_project_id','gs_table_name','created_at','updated_at','deleted'].forEach(k => delete updated[k]);
        const putRes = await fetch(apiUrl(`tables/users/${userId}`), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updated)
        });
        if (!putRes.ok) throw new Error('업데이트 실패');
        // 현재 로그인 사용자가 VIP가 된 경우 세션 갱신
        if (authState.currentUser && authState.currentUser.id === userId) {
            authState.currentUser.vip = 'true';
            saveSession(authState.currentUser);
        }
        showToast(`👑 "${userIdText}" 회원이 VIP로 지정되었습니다!`);
        loadAdminMembers();
    } catch(e) {
        showToast('❌ VIP 지정 오류: ' + e.message);
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-crown"></i> VIP';
    }
}

async function unsetVipUser(userId, userIdText, btn) {
    if (!confirm(`"${userIdText}" 회원의 VIP를 해제하시겠습니까?`)) return;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    try {
        const res = await fetch(apiUrl(`tables/users/${userId}`));
        if (!res.ok) throw new Error('회원 정보 조회 실패');
        const user = await res.json();
        const updated = { ...user, vip: 'false' };
        ['gs_project_id','gs_table_name','created_at','updated_at','deleted'].forEach(k => delete updated[k]);
        const putRes = await fetch(apiUrl(`tables/users/${userId}`), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updated)
        });
        if (!putRes.ok) throw new Error('업데이트 실패');
        // 현재 로그인 사용자의 VIP가 해제된 경우 세션 갱신
        if (authState.currentUser && authState.currentUser.id === userId) {
            authState.currentUser.vip = 'false';
            saveSession(authState.currentUser);
        }
        showToast(`✅ "${userIdText}" 회원의 VIP가 해제되었습니다.`);
        loadAdminMembers();
    } catch(e) {
        showToast('❌ VIP 해제 오류: ' + e.message);
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-crown"></i> VIP해제';
    }
}

// ============================================================
// 강제 탈퇴 처리 (회원 비활성화)
// ============================================================
async function withdrawUserByAdmin(userId, userIdText, btn) {
    if (!confirm(`"${userIdText}" 회원을 강제 탈퇴 처리하시겠습니까?\n(승인 취소 및 계정이 잠금됩니다)`)) return;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    try {
        const res = await fetch(apiUrl(`tables/users/${userId}`));
        if (!res.ok) throw new Error('회원 정보 조회 실패');
        const user = await res.json();
        const updated = { ...user, approved: 'false', vip: 'false' };
        ['gs_project_id','gs_table_name','created_at','updated_at','deleted'].forEach(k => delete updated[k]);
        const putRes = await fetch(apiUrl(`tables/users/${userId}`), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updated)
        });
        if (!putRes.ok) throw new Error('업데이트 실패');
        showToast(`🚫 "${userIdText}" 회원이 탈퇴 처리되었습니다.`);
        loadAdminMembers();
    } catch(e) {
        showToast('❌ 탈퇴 처리 오류: ' + e.message);
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-user-slash"></i> 탈퇴';
    }
}

// ============================================================
// 서비스 이용 전 로그인 요구 체크 (만료일 포함)
// ============================================================
function requireLogin(action) {
    if (!authState.currentUser) {
        showToast('⚠️ 로그인 후 이용 가능합니다.');
        openLoginModal();
        return false;
    }
    // approved는 문자열 'true' 또는 boolean true 모두 처리
    if (String(authState.currentUser.approved) !== 'true') {
        showToast('⚠️ 관리자 승인 후 이용 가능합니다.');
        return false;
    }
    // 관리자 또는 VIP는 만료 체크 없음
    if (authState.isAdmin || authState.currentUser.user_id === ADMIN_ID) return true;
    if (String(authState.currentUser.vip) === 'true') return true; // VIP 무제한
    // 만료일 체크
    const expiryStatus = checkUserExpiry(authState.currentUser);
    if (expiryStatus === 'expired') {
        showToast('⏰ 이용 기간이 만료되었습니다. 프로필에서 이용 기간을 연장해주세요.');
        openProfileModal();
        return false;
    }
    return true;
}

// 만료일 상태 반환: 'valid' | 'expiring_soon' | 'expired' | 'no_expiry'
function checkUserExpiry(user) {
    if (!user) return 'no_expiry';
    if (!user.expires_at) return 'no_expiry';
    const now = new Date();
    const exp = new Date(user.expires_at);
    if (isNaN(exp.getTime())) return 'no_expiry';
    const diff = exp - now;
    if (diff < 0) return 'expired';
    if (diff < 7 * 24 * 60 * 60 * 1000) return 'expiring_soon'; // 7일 이내
    return 'valid';
}

// 현재 로그인 사용자 ID 반환
function getCurrentUserId() {
    return authState.currentUser ? authState.currentUser.user_id : null;
}
function isLoggedIn() {
    if (!authState.currentUser) return false;
    return String(authState.currentUser.approved) === 'true';
}

// ============================================================
// 유틸
// ============================================================
function showAuthError(el, msg) {
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
}

function setAuthBtnLoading(btn, loading, html) {
    if (!btn) return;
    btn.disabled = loading;
    if (!loading) btn.innerHTML = html;
    else btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + html;
}

function authEscHtml(s) {
    return String(s||'')
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ============================================================
// 관리자 – 사용자 업로드 자료 승인 관리
// ============================================================
async function loadAdminUserUploads() {
    const container = document.getElementById('admin-useruploads-list');
    if (!container) return;
    container.innerHTML = `<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>로딩 중...</p></div>`;

    try {
        const rows = (await fetchAllPages('user_forms'))
            .sort((a,b) => (b.uploaded_at||'').localeCompare(a.uploaded_at||''));

        const countEl = document.getElementById('admin-useruploads-count');
        const pending = rows.filter(r => !r.approved || r.approved === 'pending');
        const approved = rows.filter(r => r.approved === 'approved');
        if (countEl) countEl.textContent = `전체 ${rows.length}개 (대기 ${pending.length} / 승인 ${approved.length})`;

        if (rows.length === 0) {
            container.innerHTML = `<div class="empty-state"><i class="fas fa-folder-open"></i><p>등록된 자료가 없습니다</p></div>`;
            return;
        }

        container.innerHTML = rows.map(r => {
            const isApproved = r.approved === 'approved';
            const isPending  = !r.approved || r.approved === 'pending';
            const isRejected = r.approved === 'rejected';
            // ★ 메타데이터 매칭 업로드 여부 (base_form_ref 필드 존재 + 실제 파일 데이터 있음)
            const isMetaMatchUpload = !!(r.base_form_ref && r.base_form_ref.trim() && r.file_data && r.file_data.length > 10);

            const statusBadge = isApproved
                ? `<span class="admin-member-badge badge-approved">✅ 승인됨</span>`
                : isPending
                    ? `<span class="admin-member-badge badge-pending">⏳ 검토 대기</span>`
                    : `<span class="admin-member-badge" style="background:#fee2e2;color:#dc2626;">❌ 반려됨</span>`;
            // ★ 가치있는 자료 배지
            const valueBadge = (isMetaMatchUpload && isPending)
                ? `<span class="meta-match-badge">⭐ 희귀자료</span>` : '';
            const ext = (r.file_type||'').toUpperCase();
            return `<div class="admin-member-card ${isApproved ? 'approved' : 'pending'}${isMetaMatchUpload && isPending ? ' meta-highlight' : ''}">
                <div class="admin-member-info">
                    <div class="admin-member-id">
                        <i class="fas fa-file"></i>
                        <strong>${authEscHtml(r.name||r.file_name||'(제목없음)')}</strong>
                        ${statusBadge}${valueBadge}
                    </div>
                    <div class="admin-member-detail">
                        <span><i class="fas fa-user"></i> ${authEscHtml(r.uploader_id||'-')}</span>
                        <span><i class="fas fa-building"></i> ${authEscHtml(r.dept||'-')}</span>
                        <span><i class="fas fa-file-alt"></i> ${ext}</span>
                        <span><i class="fas fa-calendar"></i> ${authEscHtml(r.uploaded_at||'-')}</span>
                        ${isMetaMatchUpload ? `<span style="color:#f59e0b;font-weight:700;"><i class="fas fa-star"></i> 기존 메타데이터 매칭 (승인 시 +50P 추가)</span>` : ''}
                    </div>
                </div>
                <div class="admin-member-actions">
                    ${(r.file_data && r.file_data.length > 10)
                        ? `<button class="btn-admin-dl" title="파일 다운로드하여 내용 확인"
                               onclick="adminDownloadUserUpload('${r.id}', '${authEscHtml(r.file_name||r.name||'file')}', '${authEscHtml(r.file_type||'hwp')}', this)">
                               <i class="fas fa-download"></i> 다운로드
                           </button>`
                        : `<button class="btn-admin-dl" disabled title="저장된 파일 없음" style="opacity:.4;cursor:not-allowed;">
                               <i class="fas fa-file-slash"></i> 파일없음
                           </button>`
                    }
                    ${isPending || isRejected
                        ? `<button class="btn-approve${isMetaMatchUpload ? ' meta-match-glow' : ''}" onclick="adminApproveUserUpload('${r.id}', this)">
                               <i class="fas fa-check"></i> 승인${isMetaMatchUpload ? ' ✨' : ''}
                           </button>`
                        : `<button class="btn-revoke" onclick="adminRejectUserUpload('${r.id}', this)">
                               <i class="fas fa-ban"></i> 취소
                           </button>`
                    }
                    <button class="btn-del-member" title="삭제 (50P 차감 벌점)" onclick="adminDeleteUserUpload('${r.id}', '${authEscHtml(r.name||r.file_name||'')}', '${authEscHtml(r.uploader_id||'')}', this)">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>`;
        }).join('');

    } catch(e) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>로딩 오류: ${e.message}</p></div>`;
    }
}

async function adminApproveUserUpload(uploadId, btn) {
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
    try {
        const getRes = await fetch(apiUrl(`tables/user_forms/${uploadId}`));
        if (!getRes.ok) throw new Error('조회 실패');
        const data = await getRes.json();

        // ★ 메타데이터 매칭 여부 확인 (base_form_ref 필드)
        const isMetaMatch = !!(data.base_form_ref && data.base_form_ref.trim());

        // ① user_forms 승인 상태 업데이트
        const updated = { ...data, approved: 'approved', approved_by: ADMIN_ID, approved_at: new Date().toLocaleString('ko-KR') };
        ['gs_project_id','gs_table_name','created_at','updated_at','deleted'].forEach(k => delete updated[k]);
        const res = await fetch(apiUrl(`tables/user_forms/${uploadId}`), {
            method: 'PUT', headers: {'Content-Type':'application/json'},
            body: JSON.stringify(updated)
        });
        if (!res.ok) throw new Error('승인 실패');

        // ② base_forms에 자동 복사 (AI 학습 DB 반영)
        // 이미 base_forms에 동일 파일이 있는지 확인 (uploader_id + file_name 기준)
        try {
            const alreadyExists = await (async () => {
                const chkRes = await fetch(apiUrl(`tables/base_forms?limit=5&search=${encodeURIComponent(data.name || data.file_name || '')}`));
                if (!chkRes.ok) return false;
                const chkData = await chkRes.json();
                return (chkData.data || []).some(r => r.file_name === (data.file_name || '') && r.dept === (data.dept || ''));
            })();

            if (!alreadyExists) {
                const basePayload = {
                    title:        data.name  || data.file_name || '(제목없음)',
                    dept:         data.dept  || '',
                    desc:         data.desc  || `사용자 ${data.uploader_id || ''}님이 등록한 자료`,
                    source:       data.uploader_id ? `사용자 기여 (${data.uploader_id})` : '사용자 기여',
                    file_type:    data.file_type  || 'hwp',
                    file_name:    data.file_name  || (data.name + '.' + (data.file_type || 'hwp')),
                    file_size:    data.file_size  || '',
                    file_data:    data.file_data  || '',   // Base64 그대로 복사
                    download_url: '',
                    search_url:   '',
                    sort_order:   9999,
                    uploaded_by:  data.uploader_id || 'user',
                    uploaded_at:  new Date().toLocaleString('ko-KR')
                };
                const cpRes = await fetch(apiUrl('tables/base_forms'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(basePayload)
                });
                if (cpRes.ok) {
                    console.log('[AFTER] base_forms에 자동 복사 완료:', basePayload.title);
                } else {
                    console.warn('[AFTER] base_forms 복사 실패 (무시):', await cpRes.text());
                }
            }
        } catch(cpErr) {
            console.warn('[AFTER] base_forms 자동 복사 오류 (무시):', cpErr.message);
        }

        // ★ 메타데이터 매칭 업로드이면 150P 부여, 아니면 기본 100P (이미 업로드시 100P 적립)
        const uploaderId = data.uploader_id;
        if (uploaderId && isMetaMatch) {
            // 50P 추가 적립 (업로드 시 100P 이미 적립 → 총 150P)
            await addUploadPointsForUser(uploaderId, 50, '희귀 자료 기여 보너스 +50P (총 150P 달성)');
            showToast('✅ 자료가 승인되었습니다! 🎁 메타데이터 매칭 자료이므로 업로더에게 보너스 50P가 추가 지급됩니다. (누적 150P)');
        } else {
            showToast('✅ 자료가 승인되었습니다. 자료실에 공개되고 AI 학습 DB에도 반영됩니다.');
        }
        loadAdminUserUploads();
    } catch(e) {
        showToast('❌ 오류: ' + e.message);
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> 승인'; }
    }
}

async function adminRejectUserUpload(uploadId, btn) {
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
    try {
        const getRes = await fetch(apiUrl(`tables/user_forms/${uploadId}`));
        if (!getRes.ok) throw new Error('조회 실패');
        const data = await getRes.json();
        const updated = { ...data, approved: 'pending' };
        ['gs_project_id','gs_table_name','created_at','updated_at','deleted'].forEach(k => delete updated[k]);
        await fetch(apiUrl(`tables/user_forms/${uploadId}`), {
            method: 'PUT', headers: {'Content-Type':'application/json'},
            body: JSON.stringify(updated)
        });
        showToast('⚠️ 승인이 취소되었습니다. (자료실에서 비공개)');
        loadAdminUserUploads();
    } catch(e) {
        showToast('❌ 오류: ' + e.message);
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-ban"></i> 취소'; }
    }
}

// 관리자가 사용자 업로드 자료 삭제 → 업로더에게 50P 벌점
async function adminDeleteUserUpload(uploadId, title, uploaderId, btn) {
    if (!confirm(`"${title}" 자료를 삭제하고 업로더(${uploaderId})에게 50P 벌점을 부과하시겠습니까?`)) return;
    if (btn) btn.disabled = true;
    try {
        // 1) 자료 삭제
        const delRes = await fetch(apiUrl(`tables/user_forms/${uploadId}`), { method: 'DELETE' });
        if (!delRes.ok && delRes.status !== 204) throw new Error('삭제 실패');

        // 2) 업로더 포인트 차감 (-50)
        if (uploaderId) {
            await deductUserPoints(uploaderId, 50, '관리자 자료 삭제 벌점');
        }

        showToast(`🗑️ 삭제 완료. ${uploaderId ? uploaderId + '님에게 50P 벌점 부과.' : ''}`);
        loadAdminUserUploads();
        // 자료실도 갱신
        if (typeof renderFormsPage === 'function') {
            const activeFilter = document.querySelector('.filter-btn.active')?.dataset.filter || 'all';
            renderFormsPage(activeFilter);
        }
    } catch(e) {
        showToast('❌ 오류: ' + e.message);
        if (btn) btn.disabled = false;
    }
}

// 관리자 – 사용자 업로드 파일 다운로드 (검토용)
async function adminDownloadUserUpload(uploadId, fileName, fileType, btn) {
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
    try {
        const res = await fetch(apiUrl(`tables/user_forms/${uploadId}`));
        if (!res.ok) throw new Error('파일 조회 실패');
        const form = await res.json();

        if (!form.file_data || form.file_data.length < 10) {
            showToast('❌ 저장된 파일 데이터가 없습니다.');
            return;
        }

        // Base64 → Blob → 다운로드
        const byteStr = atob(form.file_data);
        const bytes   = new Uint8Array(byteStr.length);
        for (let i = 0; i < byteStr.length; i++) bytes[i] = byteStr.charCodeAt(i);

        const mimeMap = {
            pdf:  'application/pdf',
            xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            xls:  'application/vnd.ms-excel',
            hwpx: 'application/octet-stream',
            hwp:  'application/octet-stream',
            hwt:  'application/octet-stream',
            docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            doc:  'application/msword',
            pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            ppt:  'application/vnd.ms-powerpoint'
        };
        const ext  = (fileType || 'hwp').toLowerCase();
        const mime = mimeMap[ext] || 'application/octet-stream';
        const blob = new Blob([bytes], { type: mime });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = fileName || `upload_${uploadId}.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('📥 다운로드 완료! 내용을 확인 후 승인해 주세요.');
    } catch(e) {
        showToast('❌ 다운로드 오류: ' + e.message);
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-download"></i> 다운로드'; }
    }
}

// ============================================================
// 관리자 – 공지사항 CRUD
// ============================================================

let _noticeEditId = null; // 수정 중인 공지 ID

async function loadAdminNotices() {
    const listEl = document.getElementById('admin-notices-list');
    if (!listEl) return;
    listEl.innerHTML = `<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>로딩 중...</p></div>`;
    try {
        const res = await fetch(apiUrl('tables/notices?limit=200'));
        if (!res.ok) throw new Error(`서버 오류 (${res.status})`);
        const data = await res.json();
        const rows = (data.data || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || (b.created_at || 0) - (a.created_at || 0));
        if (rows.length === 0) {
            listEl.innerHTML = `<div class="empty-state"><i class="fas fa-bullhorn"></i><p>등록된 공지가 없습니다</p></div>`;
            return;
        }
        listEl.innerHTML = rows.map(n => {
            const isActive = String(n.is_active) !== 'false';
            // content를 data 속성에 base64로 안전하게 저장 (특수문자·개행 등 onclick 파싱 오류 방지)
            const contentB64 = btoa(unescape(encodeURIComponent(n.content || '')));
            const titleB64   = btoa(unescape(encodeURIComponent(n.title || '')));
            return `<div class="notice-admin-item ${isActive ? '' : 'notice-inactive'}">
                <div style="flex:1;min-width:0;">
                    <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
                        <span class="notice-status-badge ${isActive ? 'notice-badge-on' : 'notice-badge-off'}">${isActive ? '● 공개' : '○ 비공개'}</span>
                        <strong style="font-size:13px;">${authEscHtml(n.title || '')}</strong>
                    </div>
                    <p style="font-size:12px;color:#6b7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${authEscHtml((n.content || '').slice(0,60))}</p>
                    <span style="font-size:11px;color:#9ca3af;">${authEscHtml(n.created_at_str || '')}</span>
                </div>
                <div style="display:flex;gap:6px;flex-shrink:0;">
                    <button class="btn-action" style="padding:4px 10px;font-size:11px;"
                        data-nid="${n.id}"
                        data-ntitle="${titleB64}"
                        data-ncontent="${contentB64}"
                        data-nactive="${n.is_active || 'true'}"
                        onclick="adminEditNoticeFromBtn(this)">
                        <i class="fas fa-edit"></i> 수정
                    </button>
                    <button class="btn-del-member" onclick="adminDeleteNotice('${n.id}', this)">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>`;
        }).join('');
    } catch(e) {
        listEl.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>오류: ${e.message}</p></div>`;
    }
}

async function adminSaveNotice() {
    const title   = (document.getElementById('notice-title-input')?.value || '').trim();
    const content = (document.getElementById('notice-content-input')?.value || '').trim();
    const isActive = document.getElementById('notice-active-input')?.value || 'true';

    if (!title)   { showToast('❌ 공지 제목을 입력해주세요.'); return; }
    if (!content) { showToast('❌ 공지 내용을 입력해주세요.'); return; }

    const payload = {
        title, content,
        author_id: ADMIN_ID,
        is_active: isActive,
        created_at_str: new Date().toLocaleString('ko-KR'),
        sort_order: 0
    };

    try {
        let res;
        if (_noticeEditId) {
            // 수정
            const getRes = await fetch(apiUrl(`tables/notices/${_noticeEditId}`));
            if (!getRes.ok) throw new Error('공지 조회 실패');
            const existing = await getRes.json();
            const updated = { ...existing, title, content, is_active: isActive };
            ['gs_project_id','gs_table_name','created_at','updated_at','deleted'].forEach(k => delete updated[k]);
            res = await fetch(apiUrl(`tables/notices/${_noticeEditId}`), {
                method: 'PUT', headers: {'Content-Type':'application/json'},
                body: JSON.stringify(updated)
            });
        } else {
            // 신규 등록
            res = await fetch(apiUrl('tables/notices'), {
                method: 'POST', headers: {'Content-Type':'application/json'},
                body: JSON.stringify(payload)
            });
        }
        if (!res.ok) throw new Error(`저장 실패 (${res.status})`);
        showToast(_noticeEditId ? '✅ 공지가 수정되었습니다.' : '✅ 공지가 등록되었습니다.');
        adminCancelNoticeEdit();
        loadAdminNotices();
        // 홈 + 게시판 티커 갱신
        if (typeof loadNoticeTicker === 'function') loadNoticeTicker();
        if (typeof loadBoardPinnedNotices === 'function') loadBoardPinnedNotices();
    } catch(e) {
        showToast('❌ 오류: ' + e.message);
    }
}

// data 속성에서 base64로 저장된 공지 내용을 읽어 수정 폼에 채움
function adminEditNoticeFromBtn(btn) {
    try {
        const id       = btn.dataset.nid;
        const title    = decodeURIComponent(escape(atob(btn.dataset.ntitle || '')));
        const content  = decodeURIComponent(escape(atob(btn.dataset.ncontent || '')));
        const isActive = btn.dataset.nactive || 'true';
        adminEditNotice(id, title, content, isActive);
    } catch(e) {
        showToast('❌ 공지 내용을 불러오는 중 오류가 발생했습니다: ' + e.message);
    }
}

function adminEditNotice(id, title, content, isActive) {
    _noticeEditId = id;
    const titleEl   = document.getElementById('notice-title-input');
    const contentEl = document.getElementById('notice-content-input');
    const activeEl  = document.getElementById('notice-active-input');
    const labelEl   = document.getElementById('notice-save-label');
    const iconEl    = document.getElementById('notice-save-icon');
    const cancelBtn = document.getElementById('notice-cancel-btn');

    if (titleEl)   titleEl.value   = title;
    if (contentEl) contentEl.value = content;
    if (activeEl)  activeEl.value  = isActive;
    if (labelEl)   labelEl.textContent = '공지 수정 저장';
    if (iconEl)    iconEl.className = 'fas fa-save';
    if (cancelBtn) cancelBtn.style.display = '';

    // 관리자 패널 내 공지 탭 폼 상단으로 스크롤
    document.getElementById('notice-title-input')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function adminCancelNoticeEdit() {
    _noticeEditId = null;
    const titleEl   = document.getElementById('notice-title-input');
    const contentEl = document.getElementById('notice-content-input');
    const activeEl  = document.getElementById('notice-active-input');
    const labelEl   = document.getElementById('notice-save-label');
    const iconEl    = document.getElementById('notice-save-icon');
    const cancelBtn = document.getElementById('notice-cancel-btn');

    if (titleEl)   titleEl.value   = '';
    if (contentEl) contentEl.value = '';
    if (activeEl)  activeEl.value  = 'true';
    if (labelEl)   labelEl.textContent = '공지 등록';
    if (iconEl)    iconEl.className = 'fas fa-bullhorn';
    if (cancelBtn) cancelBtn.style.display = 'none';
}

async function adminDeleteNotice(id, btn) {
    if (!confirm('공지사항을 삭제하시겠습니까?')) return;
    if (btn) btn.disabled = true;
    try {
        const res = await fetch(apiUrl(`tables/notices/${id}`), { method: 'DELETE' });
        if (!res.ok && res.status !== 204) throw new Error('삭제 실패');
        showToast('🗑️ 공지가 삭제되었습니다.');
        loadAdminNotices();
        if (typeof loadNoticeTicker === 'function') loadNoticeTicker();
        if (typeof loadBoardPinnedNotices === 'function') loadBoardPinnedNotices();
    } catch(e) {
        showToast('❌ ' + e.message);
        if (btn) btn.disabled = false;
    }
}

// 포인트 차감 헬퍼
async function deductUserPoints(userId, amount, reason) {
    try {
        const allUsersDup = await fetchAllPages('users');
        const user = allUsersDup.find(u => u.user_id === userId);
        if (!user) return;

        const newPts = Math.max(0, (user.points || 0) - amount);
        const updated = { ...user, points: newPts };
        ['gs_project_id','gs_table_name','created_at','updated_at','deleted'].forEach(k => delete updated[k]);

        await fetch(apiUrl(`tables/users/${user.id}`), {
            method: 'PUT', headers: {'Content-Type':'application/json'},
            body: JSON.stringify(updated)
        });

        // 현재 로그인된 사용자가 대상이면 세션 업데이트
        if (authState.currentUser && authState.currentUser.user_id === userId) {
            authState.currentUser.points = newPts;
            saveSession(authState.currentUser);
        }
    } catch(e) {
        console.warn('[AFTER] 포인트 차감 실패:', e.message);
    }
}

// ============================================================
// 이벤트 바인딩 (DOMContentLoaded 이후 app.js initApp에서 호출)
// ============================================================
function initAuthEvents() {
    // 로그인 모달 닫기
    const authClose = document.getElementById('auth-close');
    if (authClose) authClose.addEventListener('click', closeLoginModal);

    // 모달 배경 클릭 닫기
    const authOverlay = document.getElementById('auth-modal');
    if (authOverlay) authOverlay.addEventListener('click', e => {
        if (e.target === authOverlay) closeLoginModal();
    });

    // 로그인 버튼
    const btnLogin = document.getElementById('btn-login');
    if (btnLogin) btnLogin.addEventListener('click', doLogin);

    // Enter 키로 로그인
    ['login-id','login-pw'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
    });

    // 회원가입 버튼
    const btnRegister = document.getElementById('btn-register');
    if (btnRegister) btnRegister.addEventListener('click', doRegister);

    // 탈퇴 링크
    const btnDelLink = document.getElementById('btn-delete-account-link');
    if (btnDelLink) btnDelLink.addEventListener('click', openDeleteAccountModal);

    // 탈퇴 실행
    const btnDel = document.getElementById('btn-delete-account');
    if (btnDel) btnDel.addEventListener('click', doDeleteAccount);

    // 관리자 모드 버튼 (왼쪽 사이드바)
    const btnAdmin = document.getElementById('btn-admin-mode');
    if (btnAdmin) btnAdmin.addEventListener('click', openAdminModal);

    // 관리자 로그인 버튼
    const btnAdminLogin = document.getElementById('btn-admin-login');
    if (btnAdminLogin) btnAdminLogin.addEventListener('click', doAdminLogin);

    // Enter 키로 관리자 로그인
    ['admin-id-input','admin-pw-input'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') doAdminLogin(); });
    });

    // 관리자 로그아웃
    const btnAdminLogout = document.getElementById('btn-admin-logout');
    if (btnAdminLogout) btnAdminLogout.addEventListener('click', doAdminLogout);

    // 프로필 모달 닫기
    const profileClose = document.getElementById('profile-modal-close');
    if (profileClose) profileClose.addEventListener('click', closeProfileModal);
    const profileOverlay = document.getElementById('profile-modal');
    if (profileOverlay) profileOverlay.addEventListener('click', e => {
        if (e.target === profileOverlay) closeProfileModal();
    });

    // 비밀번호 변경 버튼
    const btnChangePw = document.getElementById('btn-change-pw');
    if (btnChangePw) btnChangePw.addEventListener('click', doChangePassword);

    // 학교 변경 버튼
    const btnChangeSchool = document.getElementById('btn-change-school');
    if (btnChangeSchool) btnChangeSchool.addEventListener('click', doChangeSchool);

    // 이용 기간 연장 버튼
    const btnPurchase = document.getElementById('btn-purchase-access');
    if (btnPurchase) btnPurchase.addEventListener('click', doPurchaseAccess);

    // 프로필 내 로그아웃
    const btnProfileLogout = document.getElementById('btn-profile-logout');
    if (btnProfileLogout) btnProfileLogout.addEventListener('click', () => { closeProfileModal(); doLogout(); });
}

// ============================================================
// 관리자 – 회원 정보 수정 모달
// ============================================================
function openMemberEditModal(recordId, userId, fullName, email, school, approved, role, points, expiresAt) {
    document.getElementById('me-user-record-id').value = recordId;
    document.getElementById('me-user-id').value        = userId;
    document.getElementById('me-full-name').value      = fullName;
    document.getElementById('me-email').value          = email;
    document.getElementById('me-school').value         = school;
    document.getElementById('me-approved').value       = String(approved) === 'true' ? 'true' : 'false';
    document.getElementById('me-role').value           = role || 'user';
    document.getElementById('me-points').value         = points || 0;
    // expires_at: ISO -> YYYY-MM-DD 변환 (date input 형식)
    const expiresEl = document.getElementById('me-expires-at');
    if (expiresEl) {
        if (expiresAt) {
            try { expiresEl.value = new Date(expiresAt).toISOString().split('T')[0]; } catch(e) { expiresEl.value = ''; }
        } else { expiresEl.value = ''; }
    }
    document.getElementById('member-edit-modal').classList.remove('hidden');
}

function closeMemberEditModal() {
    document.getElementById('member-edit-modal').classList.add('hidden');
}

async function saveMemberEdit() {
    const recordId = document.getElementById('me-user-record-id').value;
    const fullName = (document.getElementById('me-full-name').value || '').trim();
    const email    = (document.getElementById('me-email').value || '').trim();
    const school   = (document.getElementById('me-school').value || '').trim();
    const approved = document.getElementById('me-approved').value;
    const role     = document.getElementById('me-role').value;
    const points   = parseInt(document.getElementById('me-points').value) || 0;

    if (!recordId) { showToast('❌ 오류: 레코드 ID 없음'); return; }

    const saveBtn = document.querySelector('.me-save-btn');
    if (saveBtn) saveBtn.disabled = true;

    try {
        // 현재 레코드 전체 가져오기 (PUT으로 전체 업데이트)
        const getRes = await fetch(apiUrl(`tables/users/${recordId}`));
        if (!getRes.ok) throw new Error('회원 정보 조회 실패');
        const user = await getRes.json();

        const expiresEl = document.getElementById('me-expires-at');
        const expiresAtVal = expiresEl && expiresEl.value ? new Date(expiresEl.value + 'T00:00:00').toISOString() : (user.expires_at || '');
        const updated = { ...user, full_name: fullName, email, school, approved, role, points, expires_at: expiresAtVal };
        delete updated.gs_project_id;
        delete updated.gs_table_name;
        delete updated.created_at;
        delete updated.updated_at;
        delete updated.deleted;

        const putRes = await fetch(apiUrl(`tables/users/${recordId}`), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updated)
        });
        if (!putRes.ok) throw new Error('저장 실패 (' + putRes.status + ')');

        showToast('✅ 회원 정보가 수정되었습니다.');
        closeMemberEditModal();
        loadAdminMembers();
    } catch(e) {
        showToast('❌ 수정 오류: ' + e.message);
    } finally {
        if (saveBtn) saveBtn.disabled = false;
    }
}

// ============================================================
// 관리자 – 회원 직접 추가 (DB 재구축 후 복구용)
// ============================================================
function openAddMemberModal() {
    ['add-user-id','add-user-pw','add-user-fullname','add-user-email','add-user-school'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const apEl = document.getElementById('add-user-approved');
    if (apEl) apEl.value = 'true';
    document.getElementById('add-member-modal').classList.remove('hidden');
}

function closeAddMemberModal() {
    document.getElementById('add-member-modal').classList.add('hidden');
}

async function adminAddMember() {
    const userId   = (document.getElementById('add-user-id')?.value || '').trim();
    const pw       = (document.getElementById('add-user-pw')?.value || '').trim();
    const fullName = (document.getElementById('add-user-fullname')?.value || '').trim();
    const email    = (document.getElementById('add-user-email')?.value || '').trim();
    const school   = (document.getElementById('add-user-school')?.value || '').trim();
    const approved = document.getElementById('add-user-approved')?.value || 'true';

    if (!userId) { showToast('❌ 아이디를 입력하세요.'); return; }
    if (!pw)     { showToast('❌ 비밀번호를 입력하세요.'); return; }

    const saveBtn = document.querySelector('#add-member-modal .me-save-btn');
    if (saveBtn) saveBtn.disabled = true;

    try {
        // 중복 확인 (전체 페이지 조회)
        const allUsersAdd = await fetchAllPages('users');
        const dup = allUsersAdd.find(r => r.user_id === userId);
        if (dup) { showToast('❌ 이미 존재하는 아이디입니다.'); return; }

        const pwHash = await hashPassword(pw);
        const payload = {
            user_id:       userId,
            password_hash: pwHash,
            full_name:     fullName,
            email:         email,
            school:        school,
            approved:      approved,
            role:          'user',
            points:        0,
            registered_at: new Date().toLocaleString('ko-KR')
        };

        const res = await fetch(apiUrl('tables/users'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(`서버 오류 (${res.status})`);

        showToast(`✅ "${userId}" 회원이 추가되었습니다.`);
        closeAddMemberModal();
        loadAdminMembers();
    } catch(e) {
        showToast('❌ 추가 오류: ' + e.message);
    } finally {
        if (saveBtn) saveBtn.disabled = false;
    }
}

// ============================================================
// 백업 / 복구 탭
// ============================================================

// 백업 대상 테이블 목록 (file_data 포함 여부)
const BACKUP_TABLES = [
    { name: 'users',        label: '👥 회원' },
    { name: 'notices',      label: '📢 공지사항' },
    { name: 'board_posts',  label: '💬 게시판' },
    { name: 'chat_history', label: '🗂️ AI대화이력' },
    { name: 'base_forms',   label: '📁 자료실' },
    { name: 'user_forms',   label: '📤 사용자자료' },
    { name: 'ai_feedback',  label: '📊 AI피드백' },
    { name: 'app_config',   label: '⚙️ 설정' },
];
// ※ file_data(Base64 파일 본체)는 JSON 크기 폭발 문제로 백업에서 제외
// ※ 대신 file_data가 있던 항목에 has_file:true 플래그를 남겨 복구 후 재업로드 안내 가능
// ※ 자료실 메타(제목·부서·URL·파일명 등)는 완전히 복구됨

let _restoreData = null; // 복구용 파싱된 JSON 데이터

/** 행 정리: _ 시작 필드 전부 제거 + 시스템 필드 제거
 *  - _self, _rid, _rowId 등 미리보기 전용 내부 필드 제거
 *  - file_data: JSON 크기 폭발 방지를 위해 백업에서 항상 제외
 *    (파일이 있었던 행에는 has_file:true 플래그를 남겨 복구 후 재업로드 안내)
 */
function _sanitizeRow(row) {
    const SYSTEM_FIELDS = new Set([
        'deleted','updated_at','gs_project_id','gs_table_name',
        '_self','_rid','_rowId','_rowid','_id','__v',
        'category',   // 스키마 미존재 필드
        'has_file'    // 아래에서 직접 계산해서 넣음
    ]);
    const copy = {};
    for (const [k, v] of Object.entries(row)) {
        if (k.startsWith('_') || SYSTEM_FIELDS.has(k)) continue;
        // file_data 는 크기 무관 항상 제외
        if (k === 'file_data') continue;
        copy[k] = v;
    }
    // 파일이 있었으면 has_file:true 플래그만 기록 (복구 후 재업로드 안내용)
    if (row.file_data && row.file_data.length > 10) {
        copy.has_file = true;
    }
    return copy;
}

/** ☁️ 클라우드 데이터 현황 카드 렌더링 */
async function loadDbStats() {
    const grid = document.getElementById('db-stats-grid');
    if (!grid) return;
    grid.innerHTML = '<div style="text-align:center;padding:10px;"><i class="fas fa-spinner fa-spin" style="color:#16a34a;"></i></div>';

    const ALL_TABLES = [
        { name: 'base_forms',   label: '📁 자료실',    color: '#7c3aed' },
        { name: 'users',        label: '👥 회원',      color: '#2563eb' },
        { name: 'chat_history', label: '💬 대화이력',  color: '#0891b2' },
        { name: 'board_posts',  label: '📋 게시판',    color: '#16a34a' },
        { name: 'notices',      label: '📢 공지',      color: '#d97706' },
        { name: 'ai_feedback',  label: '📊 피드백',    color: '#dc2626' },
        { name: 'app_config',   label: '⚙️ 설정',     color: '#64748b' },
        { name: 'user_forms',   label: '📤 사용자자료',color: '#9333ea' },
        { name: 'cloud_backups',label: '☁️ 백업이력', color: '#0f766e' },
    ];

    const results = await Promise.all(ALL_TABLES.map(async t => {
        try {
            const r = await fetch(apiUrl(`tables/${t.name}?limit=1`));
            if (!r.ok) return { ...t, count: '오류' };
            const d = await r.json();
            return { ...t, count: d.total ?? 0 };
        } catch { return { ...t, count: '?' }; }
    }));

    const total = results.reduce((s, r) => s + (typeof r.count === 'number' ? r.count : 0), 0);

    grid.innerHTML = results.map(r => `
        <div style="background:white;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;text-align:center;border-top:3px solid ${r.color};">
            <div style="font-size:11px;color:#64748b;margin-bottom:4px;">${r.label}</div>
            <div style="font-size:18px;font-weight:800;color:${r.color};">${typeof r.count === 'number' ? r.count.toLocaleString() : r.count}</div>
            <div style="font-size:10px;color:#94a3b8;">건</div>
        </div>`).join('')
        + `<div style="background:linear-gradient(135deg,#1e293b,#334155);border-radius:10px;padding:10px 12px;text-align:center;">
            <div style="font-size:11px;color:#94a3b8;margin-bottom:4px;">📦 전체 레코드</div>
            <div style="font-size:18px;font-weight:800;color:white;">${total.toLocaleString()}</div>
            <div style="font-size:10px;color:#64748b;">건</div>
           </div>`;
}

async function initBackupTab() {
    const listEl  = document.getElementById('backup-table-list');
    const clearEl = document.getElementById('clear-table-grid');
    if (!listEl || !clearEl) return;

    // DB 현황 자동 로드
    loadDbStats();

    listEl.innerHTML  = BACKUP_TABLES.map(t =>
        `<div class="backup-table-card">
            <span class="backup-table-name">${t.label}</span>
            <span class="backup-table-count" id="btc-${t.name}">-</span>
            <button class="backup-table-dl-btn" onclick="backupSingleTable('${t.name}')" title="${t.name} 단독 백업">
                <i class="fas fa-download"></i>
            </button>
         </div>`).join('');

    clearEl.innerHTML = BACKUP_TABLES.map(t =>
        `<div class="clear-table-item">
            <span class="clear-table-item-name">${t.label}</span>
            <button class="clear-table-item-btn" onclick="clearSingleTable('${t.name}','${t.label}')">
                <i class="fas fa-trash-alt"></i> 초기화
            </button>
         </div>`).join('');

    BACKUP_TABLES.forEach(async t => {
        try {
            const res  = await fetch(apiUrl(`tables/${t.name}?limit=1`));
            if (!res.ok) { document.getElementById(`btc-${t.name}`).textContent = '오류'; return; }
            const data = await res.json();
            document.getElementById(`btc-${t.name}`).textContent = `${data.total ?? '?'}건`;
        } catch { document.getElementById(`btc-${t.name}`).textContent = '?'; }
    });

    // 클라우드 백업 이력 로드
    loadCloudBackupList();
}

/** ☁️ 클라우드 백업 이력 목록 렌더링 */
async function loadCloudBackupList() {
    const el = document.getElementById('cloud-backup-list');
    if (!el) return;
    el.innerHTML = '<div style="text-align:center;padding:16px;"><i class="fas fa-spinner fa-spin"></i> 불러오는 중...</div>';
    try {
        const res  = await fetch(apiUrl('tables/cloud_backups?limit=30&sort=created_at'));
        if (!res.ok) throw new Error('API 오류');
        const data = await res.json();
        const rows = (data.data || []).sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

        if (rows.length === 0) {
            el.innerHTML = '<div style="text-align:center;padding:20px;color:#94a3b8;"><i class="fas fa-inbox" style="font-size:24px;display:block;margin-bottom:8px;"></i>아직 클라우드 백업 이력이 없습니다.<br><small>백업 실행 시 자동으로 이곳에 기록됩니다.</small></div>';
            return;
        }

        const typeLabel = { full: '전체', single: '단독' };

        // 각 행의 data_json 유무 여부 (다운로드/복원 가능 여부 판단)
        el.innerHTML = `
          <div style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:600px;">
            <thead>
              <tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0;">
                <th style="padding:7px 10px;text-align:left;color:#475569;font-weight:700;">백업 레이블</th>
                <th style="padding:7px 6px;text-align:center;color:#475569;font-weight:700;">유형</th>
                <th style="padding:7px 6px;text-align:right;color:#475569;font-weight:700;">레코드</th>
                <th style="padding:7px 6px;text-align:right;color:#475569;font-weight:700;">크기</th>
                <th style="padding:7px 6px;text-align:center;color:#475569;font-weight:700;">일시</th>
                <th style="padding:7px 10px;text-align:center;color:#475569;font-weight:700;">☁️ 작업</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((r, i) => {
                const hasData = r.data_json && r.data_json.length > 10;
                const escapedId = (r.id || '').replace(/'/g, "\\'");
                const escapedLabel = (r.backup_label || '-').replace(/'/g, "\\'");
                return `
                <tr style="border-bottom:1px solid #f1f5f9;background:${i % 2 === 0 ? 'white' : '#f8fafc'}">
                  <td style="padding:7px 10px;color:#1e293b;font-weight:600;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${r.backup_label || '-'}">
                    ${r.backup_type === 'full' ? '🗃️' : '📄'} ${r.backup_label || '-'}
                  </td>
                  <td style="padding:7px 6px;text-align:center;">
                    <span style="background:${r.backup_type === 'full' ? '#ede9fe' : '#dbeafe'};color:${r.backup_type === 'full' ? '#5b21b6' : '#1d4ed8'};padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;">
                      ${typeLabel[r.backup_type] || r.backup_type}
                    </span>
                  </td>
                  <td style="padding:7px 6px;text-align:right;color:#0f172a;font-weight:600;">${(r.record_count || 0).toLocaleString()}건</td>
                  <td style="padding:7px 6px;text-align:right;color:#64748b;">${r.size_kb > 1024 ? (r.size_kb/1024).toFixed(1)+'MB' : (r.size_kb||0)+'KB'}</td>
                  <td style="padding:7px 6px;text-align:center;color:#94a3b8;white-space:nowrap;font-size:11px;">${r.backed_up_at || '-'}</td>
                  <td style="padding:7px 10px;text-align:center;white-space:nowrap;">
                    ${hasData ? `
                      <button onclick="downloadCloudBackup('${escapedId}','${escapedLabel}')"
                        style="background:linear-gradient(135deg,#3b82f6,#2563eb);color:white;border:none;border-radius:7px;padding:4px 10px;font-size:11px;font-weight:700;cursor:pointer;margin-right:4px;"
                        title="이 시점의 백업을 JSON 파일로 다운로드">
                        <i class="fas fa-download"></i> 다운로드
                      </button>
                      <button onclick="restoreFromCloud('${escapedId}','${escapedLabel}')"
                        style="background:linear-gradient(135deg,#f59e0b,#d97706);color:white;border:none;border-radius:7px;padding:4px 10px;font-size:11px;font-weight:700;cursor:pointer;"
                        title="이 시점으로 데이터 복원">
                        <i class="fas fa-undo-alt"></i> 복원
                      </button>
                    ` : `<span style="color:#94a3b8;font-size:11px;" title="대용량으로 data_json 미저장">⚠️ 대용량<br>직접업로드</span>`}
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
          </div>
          <div style="margin-top:8px;color:#94a3b8;font-size:11px;text-align:right;">총 ${rows.length}건 · 최근 30건 유지</div>`;
    } catch(e) {
        el.innerHTML = `<div style="color:#ef4444;padding:12px;text-align:center;"><i class="fas fa-exclamation-triangle"></i> 이력 조회 실패: ${e.message}</div>`;
    }
}

/** 단일 테이블 백업 JSON 다운로드 (스트리밍 직렬화 방식) */
async function backupSingleTable(tableName) {
    const tInfo = BACKUP_TABLES.find(t => t.name === tableName);
    showToast(`⏳ ${tInfo?.label || tableName} 백업 중...`);
    try {
        const rows    = await _fetchAllPagesSimple(tableName);
        const cleaned = rows.map(_sanitizeRow);
        // 헤더 부분
        const header  = JSON.stringify({ table: tableName, exported_at: new Date().toISOString(), count: cleaned.length });
        // header 끝 "}" 제거 후 rows 배열 이어붙이기
        const parts = [
            new Blob([header.slice(0, -1) + ',"rows":['], { type: 'application/json' })
        ];
        const CHUNK = 50;
        for (let i = 0; i < cleaned.length; i += CHUNK) {
            const inner = JSON.stringify(cleaned.slice(i, i + CHUNK)).slice(1, -1);
            parts.push(new Blob([(i > 0 ? ',' : '') + inner], { type: 'application/json' }));
        }
        parts.push(new Blob([']}'], { type: 'application/json' }));

        const blob   = new Blob(parts, { type: 'application/json' });
        const sizeMB = (blob.size / 1024 / 1024).toFixed(1);
        const a      = document.createElement('a');
        a.href       = URL.createObjectURL(blob);
        a.download   = `backup_${tableName}_${_dateStamp()}.json`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 5000);

        // ── 클라우드에도 동시 저장 ──
        const label = `${tInfo?.label || tableName} 단독백업_${_dateStamp()}`;
        const jsonObj = { table: tableName, exported_at: new Date().toISOString(), rows: cleaned };
        await _saveCloudBackup(label, 'single', tableName, cleaned.length, jsonObj);

        showToast(`✅ ${tInfo?.label || tableName} 백업 완료 (${cleaned.length}건 · ${sizeMB}MB) ☁️ 클라우드 저장됨`);
    } catch(e) {
        showToast(`❌ 백업 실패: ${e.message}`);
    }
}

/** 전체 테이블 단일 JSON으로 묶어서 다운로드 */
async function backupAllTables() {
    const btn      = document.querySelector('#admin-tab-backup .backup-btn-main');
    const progWrap = document.getElementById('backup-progress');
    const progFill = document.getElementById('backup-progress-fill');
    const progText = document.getElementById('backup-progress-text');

    if (btn) btn.disabled = true;
    if (progWrap) progWrap.style.display = 'block';

    const result = { exported_at: new Date().toISOString(), tables: {} };
    const total  = BACKUP_TABLES.length;

    for (let i = 0; i < total; i++) {
        const t = BACKUP_TABLES[i];
        if (progText) progText.textContent = `[${i+1}/${total}] ${t.label} 백업 중...`;
        if (progFill) progFill.style.width = `${Math.round(((i + 0.5) / total) * 90)}%`;
        await new Promise(r => setTimeout(r, 30)); // UI 렌더링 기회 부여
        try {
            const rows = await _fetchAllPagesSimple(t.name);
            result.tables[t.name] = rows.map(_sanitizeRow);
            if (progText) progText.textContent = `[${i+1}/${total}] ${t.label} ${rows.length}건 완료`;
        } catch(e) {
            result.tables[t.name] = [];
            console.warn(`[Backup] ${t.name} 실패:`, e.message);
        }
    }

    if (progText) progText.textContent = '📦 파일 생성 중...';
    if (progFill) progFill.style.width = '95%';
    await new Promise(r => setTimeout(r, 100));

    try {
        if (progText) progText.textContent = '📦 파일 조각 생성 중... (대용량 안전 모드)';
        // ── 스트리밍 직렬화: 테이블별로 청크를 나눠 Blob 배열 생성 ──
        // JSON.stringify(전체)는 수백MB 문자열로 "invalid string length" 오류 발생
        // → 헤더 + 각 테이블 행을 개별 JSON 청크로 나눠 Blob.concat 으로 합침
        const parts = []; // Blob 조각 배열
        const tableNames = Object.keys(result.tables);
        parts.push(new Blob(
            [`{"exported_at":${JSON.stringify(result.exported_at)},"tables":{`],
            { type: 'application/json' }
        ));
        tableNames.forEach((name, ti) => {
            const rows = result.tables[name];
            // 테이블 키 + 배열 시작
            parts.push(new Blob(
                [`${ti > 0 ? ',' : ''}${JSON.stringify(name)}:[`],
                { type: 'application/json' }
            ));
            // 행을 50개 단위 청크로 직렬화
            const CHUNK = 50;
            for (let i = 0; i < rows.length; i += CHUNK) {
                const slice = rows.slice(i, i + CHUNK);
                const sep   = i === 0 ? '' : ',';
                // JSON.stringify(배열).slice(1,-1) → "[...]"
                const inner = JSON.stringify(slice).slice(1, -1);
                parts.push(new Blob([sep + inner], { type: 'application/json' }));
            }
            parts.push(new Blob([']'], { type: 'application/json' }));
        });
        parts.push(new Blob(['}}'], { type: 'application/json' }));

        const blob   = new Blob(parts, { type: 'application/json' });
        const sizeMB = (blob.size / 1024 / 1024).toFixed(1);
        const a      = document.createElement('a');
        a.href       = URL.createObjectURL(blob);
        a.download   = `AFTER_fullbackup_${_dateStamp()}.json`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 5000);

        if (progFill) progFill.style.width = '100%';
        if (progText) progText.textContent = `✅ 백업 완료! (${sizeMB}MB)`;
        if (progWrap) setTimeout(() => {
            progWrap.style.display = 'none';
            if (progFill) progFill.style.width = '0%';
        }, 3000);
        const summary = tableNames.map(k => `${k}:${result.tables[k].length}건`).join(' | ');

        // ── 클라우드에도 동시 저장 (메타 정보 요약만, file_data 제외) ──
        if (progText) progText.textContent = '☁️ 클라우드에 백업 이력 저장 중...';
        const totalRecords = tableNames.reduce((s, k) => s + (result.tables[k]?.length || 0), 0);
        const cloudLabel   = `전체백업_${_dateStamp()}`;
        // data_json: 5MB 이내인 경우 result 전체 저장, 초과 시 summary만
        const cloudJson = parseInt(sizeMB) <= 5
            ? result
            : { exported_at: result.exported_at, summary, note: '대용량으로 data_json 생략됨' };
        await _saveCloudBackup(cloudLabel, 'full', 'all', totalRecords, cloudJson);

        if (progText) progText.textContent = `✅ 백업 완료! (${sizeMB}MB) ☁️ 클라우드 저장됨`;
        showToast(`✅ 전체 백업 완료! ${sizeMB}MB ☁️ 클라우드에도 저장됨`);
        console.log('[Backup] 완료 ─', summary);
    } catch(e) {
        if (progText) progText.textContent = `❌ 파일 생성 실패: ${e.message}`;
        showToast(`❌ 백업 파일 생성 실패: ${e.message}`);
        console.error('[Backup] JSON 생성 오류:', e);
    }
    if (btn) btn.disabled = false;
}

/** 복구 – 파일 드롭 */
function handleRestoreDrop(event) {
    event.preventDefault();
    document.getElementById('restore-drop-zone').classList.remove('dragover');
    const file = event.dataTransfer.files[0];
    if (file) _loadRestoreFile(file);
}
function handleRestoreFileSelect(event) {
    const file = event.target.files[0];
    if (file) _loadRestoreFile(file);
}
function clearRestoreFile() {
    _restoreData = null;
    const preview  = document.getElementById('restore-preview');
    const dropZone = document.getElementById('restore-drop-zone');
    const input    = document.getElementById('restore-file-input');
    const btnAdd   = document.getElementById('restore-submit-btn');
    const btnRepl  = document.getElementById('restore-replace-btn');
    const msgEl    = document.getElementById('restore-file-status-msg');
    if (preview)  preview.style.display  = 'none';
    if (dropZone) dropZone.style.display = 'flex';
    if (input)    input.value = '';
    if (btnAdd)   btnAdd.disabled  = true;
    if (btnRepl)  btnRepl.disabled = true;
    if (msgEl)    msgEl.textContent = '파일을 선택하면 아래 버튼이 활성화됩니다.';
    if (msgEl)    msgEl.style.color = '#9ca3af';
}
function _loadRestoreFile(file) {
    if (!file.name.endsWith('.json')) { showToast('❌ .json 파일만 가능합니다.'); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            _restoreData = data;

            // 미리보기 렌더링
            const preview  = document.getElementById('restore-preview');
            const infoEl   = document.getElementById('restore-preview-info');
            const listEl   = document.getElementById('restore-preview-list');
            const dropZone = document.getElementById('restore-drop-zone');

            // 단일 테이블 백업인지, 전체 백업인지 판별
            let tableMap = {};
            if (data.tables) {
                // 전체 백업 형식
                tableMap = data.tables;
            } else if (data.table && Array.isArray(data.rows)) {
                // 단일 테이블 백업 형식
                tableMap[data.table] = data.rows;
            } else {
                showToast('❌ 올바른 백업 파일 형식이 아닙니다.');
                return;
            }
            _restoreData._tableMap = tableMap;

            const exportedAt = data.exported_at ? new Date(data.exported_at).toLocaleString('ko-KR') : '알 수 없음';
            if (infoEl) infoEl.textContent = `백업 일시: ${exportedAt} · 파일: ${file.name}`;

            if (listEl) {
                listEl.innerHTML = Object.entries(tableMap).map(([name, rows]) => {
                    const tInfo = BACKUP_TABLES.find(t => t.name === name);
                    return `<div class="restore-preview-row">
                        <span class="restore-preview-row-name">${tInfo?.label || name}</span>
                        <span class="restore-preview-row-count">${(rows||[]).length}건</span>
                    </div>`;
                }).join('');
            }

            // 버튼 활성화
            const btnAdd  = document.getElementById('restore-submit-btn');
            const btnRepl = document.getElementById('restore-replace-btn');
            const msgEl   = document.getElementById('restore-file-status-msg');
            if (btnAdd)  btnAdd.disabled  = false;
            if (btnRepl) btnRepl.disabled = false;
            if (msgEl) {
                const totalRows = Object.values(tableMap).reduce((s, r) => s + (r||[]).length, 0);
                msgEl.textContent = `✅ 파일 로드 완료 — 총 ${totalRows.toLocaleString()}건. 아래에서 복구 방식을 선택하세요.`;
                msgEl.style.color = '#16a34a';
            }
            if (preview)  preview.style.display  = 'block';
            if (dropZone) dropZone.style.display  = 'none';
        } catch(err) {
            showToast('❌ JSON 파싱 오류: ' + err.message);
        }
    };
    reader.readAsText(file);
}

/** 복구 실행
 * @param {boolean} clearFirst - true: 기존 데이터 삭제 후 복구 / false: 추가 복구
 */
async function submitRestore(clearFirst = false) {
    if (!_restoreData?._tableMap) { showToast('❌ 복구할 파일을 먼저 선택해주세요.'); return; }

    const confirmMsg = clearFirst
        ? '⚠️ 기존 데이터를 모두 삭제하고 백업 파일로 복구합니다.\n데이터가 완전히 교체됩니다. 계속하시겠습니까?'
        : '백업 데이터를 추가 복구합니다.\n동일 ID의 기존 레코드는 건너뜁니다. 계속하시겠습니까?';
    if (!confirm(confirmMsg)) return;

    const btn        = document.getElementById('restore-submit-btn');
    const btnReplace = document.getElementById('restore-replace-btn');
    const progWrap   = document.getElementById('restore-progress');
    const progFill   = document.getElementById('restore-progress-fill');
    const progText   = document.getElementById('restore-progress-text');

    if (btn)        btn.disabled        = true;
    if (btnReplace) btnReplace.disabled = true;
    if (progWrap)   progWrap.style.display = 'block';

    const tableMap   = _restoreData._tableMap;
    const tableNames = Object.keys(tableMap);
    let totalInserted = 0, totalSkipped = 0, totalFailed = 0;

    // 시스템 필드 제거 헬퍼
    const SYSTEM_FIELDS_SET = new Set([
        'deleted','updated_at','gs_project_id','gs_table_name',
        '_self','_rid','_rowId','_rowid','_id','__v'
    ]);
    const cleanRow = (row) => {
        const copy = {};
        for (const [k, v] of Object.entries(row)) {
            if (k.startsWith('_') || SYSTEM_FIELDS_SET.has(k)) continue;
            copy[k] = v;
        }
        return copy;
    };

    for (let ti = 0; ti < tableNames.length; ti++) {
        const tableName = tableNames[ti];
        const rows      = tableMap[tableName] || [];
        if (rows.length === 0) continue;

        const basePct = Math.round((ti / tableNames.length) * 90);
        if (progText) progText.textContent = `[${ti+1}/${tableNames.length}] ${tableName} 준비 중...`;
        if (progFill) progFill.style.width = `${basePct}%`;

        // ── clearFirst: 기존 데이터 삭제 ──────────────────────────
        if (clearFirst) {
            try {
                if (progText) progText.textContent = `[${ti+1}/${tableNames.length}] ${tableName} 기존 데이터 삭제 중...`;
                const existing = await _fetchAllPagesSimple(tableName);
                const DEL_CHUNK = 20;
                for (let d = 0; d < existing.length; d += DEL_CHUNK) {
                    await Promise.all(existing.slice(d, d + DEL_CHUNK).map(r =>
                        fetch(apiUrl(`tables/${tableName}/${r.id}`), { method: 'DELETE' }).catch(() => {})
                    ));
                }
            } catch(e) { console.warn('[Restore] 삭제 오류:', tableName, e.message); }
        }

        // ── 기존 ID 수집 (중복 방지, 추가 복구 시만) ──────────────
        let existingIds = new Set();
        if (!clearFirst) {
            try {
                const existing = await _fetchAllPagesSimple(tableName);
                existing.forEach(r => existingIds.add(r.id));
            } catch {}
        }

        // ── INSERT: 순차 처리로 안정성 확보 ─────────────────────
        // base_forms처럼 대용량 테이블은 1건씩, 나머지는 5건씩 처리
        const CHUNK = (tableName === 'base_forms') ? 1 : 5;
        let tableInserted = 0, tableFailed = 0;

        for (let i = 0; i < rows.length; i += CHUNK) {
            const chunk = rows.slice(i, i + CHUNK);

            // 진행률 업데이트
            const subPct = basePct + Math.round((i / rows.length) * (90 / tableNames.length));
            if (progFill) progFill.style.width = `${Math.min(subPct, 89)}%`;
            if (progText) progText.textContent =
                `[${ti+1}/${tableNames.length}] ${tableName}: ${Math.min(i+CHUNK, rows.length)}/${rows.length}건 (삽입:${tableInserted} 실패:${tableFailed})`;

            await Promise.all(chunk.map(async row => {
                if (!clearFirst && existingIds.has(row.id)) { totalSkipped++; return; }
                const payload = cleanRow(row);
                try {
                    // 1차 시도: POST (신규 생성)
                    const res = await fetch(apiUrl(`tables/${tableName}`), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    if (res.ok || res.status === 201) {
                        totalInserted++; tableInserted++;
                    } else if (res.status === 409 || res.status === 400 || res.status === 500) {
                        // 충돌/서버오류 → PUT으로 upsert 시도
                        try {
                            const res2 = await fetch(apiUrl(`tables/${tableName}/${payload.id}`), {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(payload)
                            });
                            if (res2.ok) { totalInserted++; tableInserted++; }
                            else {
                                totalFailed++; tableFailed++;
                                if (tableFailed <= 2) {
                                    const errText = await res2.text().catch(()=>'');
                                    console.warn(`[Restore] ${tableName} PUT ${res2.status}:`, errText.substring(0,150));
                                }
                            }
                        } catch { totalFailed++; tableFailed++; }
                    } else {
                        totalFailed++; tableFailed++;
                        if (tableFailed <= 2) {
                            const errText = await res.text().catch(()=>'');
                            console.warn(`[Restore] ${tableName} POST ${res.status}:`, errText.substring(0,150));
                        }
                    }
                } catch(e) {
                    totalFailed++; tableFailed++;
                    console.warn(`[Restore] ${tableName} 네트워크 오류:`, e.message);
                }
            }));

            // base_forms 처리 시 서버 부하 방지용 딜레이
            if (tableName === 'base_forms' && i % 50 === 0 && i > 0) {
                await new Promise(r => setTimeout(r, 200));
            }
        }

        console.log(`[Restore] ${tableName} 완료: 삽입 ${tableInserted}건 / 실패 ${tableFailed}건`);
    }

    if (progFill) progFill.style.width = '100%';
    const resultMsg = `✅ 복구 완료 — 삽입 ${totalInserted}건 | 건너뜀 ${totalSkipped}건 | 실패 ${totalFailed}건`;
    if (progText) progText.textContent = resultMsg;

    setTimeout(() => {
        if (progWrap) { progWrap.style.display = 'none'; if (progFill) progFill.style.width = '0%'; }
    }, 8000);

    if (btn)        btn.disabled        = false;
    if (btnReplace) btnReplace.disabled = false;

    const toastMsg = totalFailed === 0
        ? `✅ 복구 완료! 전체 ${totalInserted}건 삽입 성공`
        : `⚠️ 복구 완료 — 삽입 ${totalInserted}건 · 실패 ${totalFailed}건 (콘솔 확인)`;
    showToast(toastMsg);

    // 캐시 무효화
    if (typeof invalidateDbCache === 'function') {
        ['users','base_forms','user_forms','board_posts','notices','ai_feedback','app_config'].forEach(t => invalidateDbCache(t));
    }
    // 탭 카운트 갱신
    setTimeout(() => initBackupTab(), 1500);
}

/**
 * 캐시 없이 직접 API 호출로 전체 페이지 가져오기 (복구/삭제용)
 */
async function _fetchAllPagesSimple(tableName) {
    // ★ GenSpark API 최대 200개/페이지 → PAGE_SIZE=200, total 기반 종료
    //   rows.length < PAGE_SIZE 로 break하면 200개에서 멈추는 버그 발생!
    const PAGE_SIZE = 200;
    let allRows = [], page = 1, total = null;
    try {
        while (true) {
            const res = await fetch(apiUrl(`tables/${tableName}?page=${page}&limit=${PAGE_SIZE}`));
            if (!res.ok) break;
            const data = await res.json();
            const rows = data.data || [];
            allRows = allRows.concat(rows);
            if (total === null) total = data.total || 0;
            // chunk가 비어있거나 전체에 도달하면 종료 (PAGE_SIZE 기준 break 완전 제거)
            if (rows.length === 0 || allRows.length >= total) break;
            page++;
        }
    } catch(e) { console.warn(`[fetchAllPagesSimple] ${tableName}:`, e.message); }
    return allRows;
}

/** 개별 테이블 초기화 */
async function clearSingleTable(tableName, label) {
    if (!confirm(`⚠️ "${label}" 테이블의 모든 데이터를 삭제하시겠습니까?\n삭제 전 반드시 백업해 두세요!`)) return;
    if (!confirm(`정말로 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) return;

    showToast(`⏳ ${label} 초기화 중...`);
    try {
        const rows = await fetchAllPages(tableName);
        const CHUNK = 10;
        for (let i = 0; i < rows.length; i += CHUNK) {
            await Promise.all(rows.slice(i, i+CHUNK).map(r =>
                fetch(apiUrl(`tables/${tableName}/${r.id}`), { method: 'DELETE' }).catch(()=>{})
            ));
        }
        showToast(`✅ ${label} 초기화 완료 (${rows.length}건 삭제)`);
        if (typeof invalidateDbCache === 'function') invalidateDbCache(tableName);
        initBackupTab();
    } catch(e) {
        showToast(`❌ 초기화 실패: ${e.message}`);
    }
}

function _dateStamp() {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`;
}

// ── 클라우드 백업 저장 헬퍼 ────────────────────────────────────────
/**
 * 백업 JSON을 cloud_backups 테이블에 저장
 * - data_json 필드: file_data 제외된 메타 정보만 포함 (JSON.stringify 과부하 방지)
 * - 5MB 이상이면 data_json을 비우고 메타 정보만 기록
 * @param {string} label        - 백업 레이블 (UI 표시용)
 * @param {string} type         - 'full' | 'single'
 * @param {string} tableName    - 테이블명 (전체면 'all')
 * @param {number} recordCount  - 레코드 수
 * @param {object|null} jsonObj - 저장할 JSON 객체 (null이면 메타만 기록)
 */
async function _saveCloudBackup(label, type, tableName, recordCount, jsonObj) {
    try {
        let dataJson = '';
        let sizeKb   = 0;
        if (jsonObj) {
            const str = JSON.stringify(jsonObj);
            sizeKb    = Math.round(str.length / 1024);
            // 5MB 이하일 때만 전체 JSON 저장 (DB 컬럼 한계 고려)
            dataJson  = sizeKb <= 5120 ? str : '';
        }
        const user       = state?.user || {};
        const backedBy   = user.user_id || user.id || 'admin';
        const backedAt   = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });

        await fetch(apiUrl('tables/cloud_backups'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                backup_label: label,
                backup_type:  type,
                table_name:   tableName,
                record_count: recordCount,
                size_kb:      sizeKb,
                backed_up_by: backedBy,
                backed_up_at: backedAt,
                data_json:    dataJson
            })
        });

        // 클라우드 백업 내역 30개 초과 시 가장 오래된 것 삭제
        _pruneCloudBackups();
    } catch(e) {
        console.warn('[cloud_backups 저장 실패]', e.message);
    }
}

/** cloud_backups 테이블을 30건 이하로 유지 */
async function _pruneCloudBackups() {
    try {
        const res  = await fetch(apiUrl('tables/cloud_backups?sort=created_at&limit=100'));
        if (!res.ok) return;
        const data = await res.json();
        const rows = (data.data || []).sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
        const excess = rows.length - 30;
        if (excess <= 0) return;
        for (let i = 0; i < excess; i++) {
            await fetch(apiUrl(`tables/cloud_backups/${rows[i].id}`), { method: 'DELETE' });
        }
    } catch(e) {}
}

// ══════════════════════════════════════════════════════════════
// ☁️ 클라우드 백업 시점 선택 다운로드 / 복원
// ══════════════════════════════════════════════════════════════

/**
 * 클라우드에서 특정 백업 시점의 JSON을 다운로드
 * @param {string} recordId - cloud_backups 레코드 ID
 * @param {string} label    - 백업 레이블 (파일명용)
 */
async function downloadCloudBackup(recordId, label) {
    showToast('☁️ 클라우드에서 백업 파일 가져오는 중...');
    try {
        const res = await fetch(apiUrl(`tables/cloud_backups/${recordId}`));
        if (!res.ok) throw new Error(`API 오류 (${res.status})`);
        const row = await res.json();

        const rawJson = row.data_json || '';
        if (!rawJson || rawJson.length < 10) {
            showToast('⚠️ 이 백업은 대용량으로 data_json이 저장되지 않았습니다.\n로컬 백업 파일을 사용해 복원하세요.');
            return;
        }

        // 파일명: 레이블 + 시점
        const safeLabel = (label || 'cloud_backup').replace(/[/\\:*?"<>|]/g, '_');
        const blob = new Blob([rawJson], { type: 'application/json' });
        const sizeMB = (blob.size / 1024 / 1024).toFixed(1);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `☁️${safeLabel}.json`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 5000);

        showToast(`✅ 다운로드 완료! ${sizeMB}MB · "${safeLabel}"`);
    } catch(e) {
        showToast(`❌ 클라우드 다운로드 실패: ${e.message}`);
    }
}

/**
 * 클라우드 백업 시점을 선택하여 복원 화면에 자동 주입
 * → 기존 복구 섹션(submitRestore)을 그대로 재사용
 * @param {string} recordId - cloud_backups 레코드 ID
 * @param {string} label    - 백업 레이블
 */
async function restoreFromCloud(recordId, label) {
    const confirmed = confirm(
        `☁️ 클라우드 복원 시점 선택\n\n` +
        `📌 "${label}"\n\n` +
        `이 시점의 데이터를 복원 화면에 불러옵니다.\n` +
        `불러온 후 "비우고 복구" 또는 "추가 복구"를 선택할 수 있습니다.\n\n` +
        `계속하시겠습니까?`
    );
    if (!confirmed) return;

    showToast('☁️ 클라우드에서 복원 데이터 불러오는 중...');
    try {
        const res = await fetch(apiUrl(`tables/cloud_backups/${recordId}`));
        if (!res.ok) throw new Error(`API 오류 (${res.status})`);
        const row = await res.json();

        const rawJson = row.data_json || '';
        if (!rawJson || rawJson.length < 10) {
            showToast('⚠️ 이 백업은 대용량으로 data_json이 저장되지 않았습니다.\n직접 JSON 파일을 업로드해 복원하세요.');
            return;
        }

        // JSON 파싱
        let parsed;
        try {
            parsed = JSON.parse(rawJson);
        } catch(pe) {
            showToast('❌ 백업 데이터 파싱 실패: JSON 형식 오류');
            return;
        }

        // 복원 데이터 전역 변수에 주입 + _tableMap 세팅 (submitRestore에서 필요)
        _restoreData = parsed;
        let tableMap = {};
        if (parsed.tables) {
            tableMap = parsed.tables;                          // 전체 백업
        } else if (parsed.table && Array.isArray(parsed.rows)) {
            tableMap[parsed.table] = parsed.rows;             // 단독 백업
        } else {
            showToast('❌ 올바른 백업 형식이 아닙니다. (tables 또는 rows 키 없음)');
            return;
        }
        _restoreData._tableMap = tableMap;

        // 복구 탭으로 스크롤 & 미리보기 렌더링
        const restoreSection = document.getElementById('restore-preview');
        const restoreInfo    = document.getElementById('restore-preview-info');
        const previewList    = document.getElementById('restore-preview-list');
        const statusMsg      = document.getElementById('restore-file-status-msg');
        const replaceBtn     = document.getElementById('restore-replace-btn');
        const submitBtn      = document.getElementById('restore-submit-btn');

        // 미리보기 정보 구성
        const safeLabel = label || '클라우드 백업';
        const exportedAt = parsed.exported_at ? new Date(parsed.exported_at).toLocaleString('ko-KR') : '-';
        if (restoreInfo) restoreInfo.textContent = `☁️ ${safeLabel} · 백업일시: ${exportedAt}`;
        if (statusMsg)   statusMsg.textContent   = `☁️ "${safeLabel}" 복원 준비 완료 — 아래 버튼으로 복원하세요`;
        if (statusMsg)   statusMsg.style.color   = '#5b21b6';

        // _tableMap 기반 미리보기 렌더링 (이미 위에서 세팅된 tableMap 사용)
        if (previewList) {
            previewList.innerHTML = Object.entries(tableMap).map(([tName, tRows]) => {
                const tInfo  = BACKUP_TABLES.find(t => t.name === tName);
                const tLabel = tInfo?.label || tName;
                const cnt    = Array.isArray(tRows) ? tRows.length : 0;
                return `<div class="restore-preview-row">
                    <span class="restore-preview-row-name">☁️ ${tLabel}</span>
                    <span class="restore-preview-row-count">${cnt.toLocaleString()}건</span>
                </div>`;
            }).join('') || '<span style="color:#94a3b8;">미리보기 없음</span>';
        }

        // 복원 버튼 활성화
        if (restoreSection) restoreSection.style.display = 'block';
        if (replaceBtn)     replaceBtn.disabled = false;
        if (submitBtn)      submitBtn.disabled  = false;

        // 복구 섹션으로 자연스럽게 스크롤
        const restoreBtnArea = document.getElementById('restore-btn-area');
        if (restoreBtnArea) restoreBtnArea.scrollIntoView({ behavior: 'smooth', block: 'start' });

        showToast(`✅ "${safeLabel}" 불러오기 완료! 아래에서 복원 방식을 선택하세요.`);
    } catch(e) {
        showToast(`❌ 클라우드 복원 데이터 로드 실패: ${e.message}`);
    }
}

// ============================================================
// GitHub 연동 탭 초기화 / 테스트 / 저장
// ============================================================
async function initGithubTab() {
    const statusEl  = document.getElementById('gh-status-text');
    const repoEl    = document.getElementById('gh-repo-text');
    const tokenInput = document.getElementById('gh-token-input');
    const repoInput  = document.getElementById('gh-repo-input');

    // 현재 저장된 토큰 확인
    const token = typeof getGithubToken === 'function' ? getGithubToken() : '';
    if (tokenInput && token) tokenInput.value = token;
    // 런타임 오버라이드 값 또는 기본값
    const curOwner = window._ghOwnerOverride || 'daqdaegarie-hash';
    const curRepo  = window._ghRepoOverride  || 'after-forms-storage';
    if (repoInput) repoInput.value = `${curOwner}/${curRepo}`;

    if (!token) {
        if (statusEl) { statusEl.textContent = '⚠️ 토큰 미설정 — 아래에 토큰을 입력하세요'; statusEl.style.color = '#dc2626'; }
        if (repoEl)   repoEl.innerHTML = '<span style="color:#2563eb">GitHub 토큰을 입력 → 토큰 저장 버튼 클릭</span>';
        return;
    }

    if (statusEl) { statusEl.textContent = '🔄 연결 확인 중...'; statusEl.style.color = '#2563eb'; }
    if (typeof testGithubToken === 'function') {
        const result = await testGithubToken(token, curOwner, curRepo);
        if (result.ok) {
            let txt = `✅ 연결됨 — ${result.repoName} (${result.private ? '🔒 비공개' : '🌐 공개'})`;
            if (result.created) txt += '  ✨ 레포 자동 생성됨';
            if (statusEl) { statusEl.textContent = txt; statusEl.style.color = '#16a34a'; }
            if (repoEl)   repoEl.textContent = `파일 저장 위치: forms/부서명/타임스탬프_파일명`;
        } else {
            if (statusEl) { statusEl.innerHTML = `❌ 연결 실패: ${result.error}`; statusEl.style.color = '#dc2626'; }
            let hint = '';
            if (result.owner) hint = `토큰 계정: <strong>${result.owner}</strong> — 레포 필드를 <strong>${result.owner}/${curRepo}</strong> 로 수정 후 저장 버튼을 다시 누르세요.`;
            else hint = '토큰 재발급 또는 repo 스코프 여부를 확인하세요.';
            if (repoEl) repoEl.innerHTML = hint;
        }
    }
}

async function adminGithubTest() {
    const tokenInput = document.getElementById('gh-token-input');
    const repoInput  = document.getElementById('gh-repo-input');
    const resultEl   = document.getElementById('gh-result-msg');
    const token = tokenInput?.value.trim() || (typeof getGithubToken === 'function' ? getGithubToken() : '');
    if (!token) { if (resultEl) { resultEl.textContent = '❌ 토큰을 입력해주세요.'; resultEl.style.color = '#dc2626'; } return; }

    // 레포 입력값 파싱 (owner/repo 형식)
    const repoParts = (repoInput?.value.trim() || 'daqdaegarie-hash/after-forms-storage').split('/');
    const owner = repoParts[0]?.trim();
    const repo  = repoParts[1]?.trim();
    if (!owner || !repo) {
        if (resultEl) { resultEl.textContent = '❌ 레포지토리 형식이 잘못되었습니다. (owner/repo 형식)'; resultEl.style.color = '#dc2626'; }
        return;
    }

    if (resultEl) { resultEl.innerHTML = '🔄 연결 테스트 중...<br><small style="color:#6b7280">토큰 검증 → 레포 확인 → 없으면 자동 생성</small>'; resultEl.style.color = '#2563eb'; }

    if (typeof testGithubToken === 'function') {
        const result = await testGithubToken(token, owner, repo);
        if (result.ok) {
            let msg = `✅ 연결 성공! 레포: <strong>${result.repoName}</strong> (${result.private ? '🔒 비공개' : '🌐 공개'})`;
            if (result.created) msg += `<br><span style="color:#16a34a">✨ 레포가 없어서 <strong>자동 생성</strong>했습니다!</span>`;
            if (resultEl) { resultEl.innerHTML = msg; resultEl.style.color = '#16a34a'; }
            // GITHUB_OWNER/REPO 런타임 갱신
            if (typeof window !== 'undefined') {
                window._ghOwnerOverride = owner;
                window._ghRepoOverride  = repo;
            }
        } else {
            let msg = `❌ 연결 실패: ${result.error}`;
            if (result.notFound) {
                msg += `<br><small style="color:#dc2626">힘트: 토큰에 <strong>repo</strong> 스코프(public_repo)가 있는지 확인하세요.</small>`;
            }
            if (result.owner) {
                msg += `<br><small style="color:#6b7280">토큰 계정: <strong>${result.owner}</strong> — 앞의 레포 필드를 <strong>${result.owner}/${repo}</strong> 로 수정해보세요.</small>`;
            }
            if (resultEl) { resultEl.innerHTML = msg; resultEl.style.color = '#dc2626'; }
        }
    }
}

async function adminGithubSave() {
    const tokenInput = document.getElementById('gh-token-input');
    const repoInput  = document.getElementById('gh-repo-input');
    const resultEl   = document.getElementById('gh-result-msg');
    const token = tokenInput?.value.trim();
    if (!token || !token.startsWith('ghp_')) {
        if (resultEl) { resultEl.textContent = '❌ 유효한 GitHub 토큰(ghp_...)을 입력해주세요.'; resultEl.style.color = '#dc2626'; }
        return;
    }

    // 레포 입력값으로 런타임 상수 덮어쓰기
    const repoParts = (repoInput?.value.trim() || '').split('/');
    const newOwner  = repoParts[0]?.trim();
    const newRepo   = repoParts[1]?.trim();
    if (newOwner && newRepo) {
        window._ghOwnerOverride = newOwner;
        window._ghRepoOverride  = newRepo;
    }

    if (resultEl) { resultEl.textContent = '💾 연결 확인 후 저장 중...'; resultEl.style.color = '#2563eb'; }

    // 1) 연결 테스트 먼저
    let testOk = false;
    if (typeof testGithubToken === 'function') {
        const tRes = await testGithubToken(token, newOwner, newRepo);
        testOk = tRes.ok;
        if (!tRes.ok) {
            let msg = `❌ 토큰 확인 실패: ${tRes.error}`;
            if (tRes.owner) msg += `<br><small>토큰 계정: <strong>${tRes.owner}</strong> — 레포 필드를 <strong>${tRes.owner}/${newRepo||'after-forms-storage'}</strong>로 수정하세요.</small>`;
            if (resultEl) { resultEl.innerHTML = msg; resultEl.style.color = '#dc2626'; }
            return;
        }
    }

    // 2) 토큰 DB 저장
    if (typeof saveGithubTokenToDb === 'function') {
        const ok = await saveGithubTokenToDb(token);
        if (ok) {
            if (resultEl) { resultEl.textContent = '✅ GitHub 토큰 저장 완료! 이제 파일 업로드 시 GitHub에 자동 저장됩니다.'; resultEl.style.color = '#16a34a'; }
            showToast('✅ GitHub 토큰 저장 완료!');
            initGithubTab();
        } else {
            if (resultEl) { resultEl.textContent = '❌ DB 저장 실패. 다시 시도해주세요.'; resultEl.style.color = '#dc2626'; }
        }
    }
}
