// ============================================================
// github.js  –  GitHub Repository 파일 스토리지 모듈
// ★ Authorization: Bearer {token}  (GitHub 공식 권장 방식)
//   'token XXX' 방식은 deprecated → 모든 요청 Bearer 사용
// ============================================================

const GITHUB_OWNER  = 'daqdaegarie-hash';
const GITHUB_REPO   = 'after-forms-storage';
const GITHUB_BRANCH = 'main';
const GITHUB_API_BASE = 'https://api.github.com';

// ── GitHub Token 관리 ──
const GH_TOKEN_KEY     = 'after_github_token';
const GH_TOKEN_REC_KEY = 'after_github_token_rec_id';

function getGithubToken() {
    return localStorage.getItem(GH_TOKEN_KEY) || '';
}
function setGithubToken(token, recordId) {
    localStorage.setItem(GH_TOKEN_KEY, token);
    if (recordId) localStorage.setItem(GH_TOKEN_REC_KEY, recordId);
}

// ── 공통 Authorization 헤더 빌더 ──
// GitHub 공식 문서: "Authorization: Bearer {token}" 권장
function _ghHeaders(token, extra) {
    return Object.assign({
        'Authorization': `Bearer ${token}`,
        'Accept':        'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
    }, extra || {});
}

// ── 런타임 OWNER/REPO (관리자 패널에서 입력한 값 우선) ──
function _ghOwner() { return (window._ghOwnerOverride || GITHUB_OWNER); }
function _ghRepo()  { return (window._ghRepoOverride  || GITHUB_REPO);  }

// ── 앱 시작 시 DB에서 GitHub Token 로드 ──
async function loadGithubTokenFromDb() {
    try {
        const res = await fetch(apiUrl('tables/app_config?limit=50'));
        if (!res.ok) return;
        const data = await res.json();
        const rows = data.data || [];
        const row  = rows.find(r => r.config_key === 'github_token');
        if (row && row.config_value) {
            setGithubToken(row.config_value, row.id);
            console.log('[GitHub] Token DB에서 로드 완료');
        }
    } catch(e) {
        console.warn('[GitHub] Token 로드 실패:', e.message);
    }
}

// ── 관리자 패널에서 Token 저장 ──
async function saveGithubTokenToDb(token) {
    try {
        const existId = localStorage.getItem(GH_TOKEN_REC_KEY);
        let res;
        if (existId) {
            res = await fetch(apiUrl(`tables/app_config/${existId}`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ config_key: 'github_token', config_value: token })
            });
            // 레코드가 삭제됐을 경우 대비 (404)
            if (res.status === 404) {
                localStorage.removeItem(GH_TOKEN_REC_KEY);
                return saveGithubTokenToDb(token); // 재귀 재시도
            }
        } else {
            const listRes  = await fetch(apiUrl('tables/app_config?limit=50'));
            const listData = listRes.ok ? await listRes.json() : { data: [] };
            const existing = (listData.data || []).find(r => r.config_key === 'github_token');
            if (existing) {
                localStorage.setItem(GH_TOKEN_REC_KEY, existing.id);
                res = await fetch(apiUrl(`tables/app_config/${existing.id}`), {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ config_key: 'github_token', config_value: token })
                });
            } else {
                res = await fetch(apiUrl('tables/app_config'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ config_key: 'github_token', config_value: token })
                });
                if (res.ok) {
                    const saved = await res.json();
                    if (saved.id) localStorage.setItem(GH_TOKEN_REC_KEY, saved.id);
                }
            }
        }
        if (res && res.ok) {
            setGithubToken(token);
            console.log('[GitHub] Token DB 저장 완료');
            return true;
        }
    } catch(e) {
        console.warn('[GitHub] Token 저장 실패:', e.message);
    }
    return false;
}

// ── GitHub raw URL 생성 ──
function githubRawUrl(path) {
    return `https://raw.githubusercontent.com/${_ghOwner()}/${_ghRepo()}/${GITHUB_BRANCH}/${path}`;
}

// ── 파일 경로 생성: forms/{부서}/{타임스탬프}_{파일명} ──
function githubFilePath(dept, fileName) {
    const safeDept = dept.replace(/[^가-힣a-zA-Z0-9_-]/g, '_');
    const ts       = Date.now();
    const safeFile = fileName.replace(/[^가-힣a-zA-Z0-9._-]/g, '_');
    return `forms/${safeDept}/${ts}_${safeFile}`;
}

// ── GitHub 파일 업로드 ──
// base64: 순수 base64 문자열 (data:... 접두사 없음)
async function githubUploadFile(dept, fileName, base64Content) {
    const token = getGithubToken();
    if (!token) return { success: false, error: 'GitHub Token이 설정되지 않았습니다.' };

    const path        = githubFilePath(dept, fileName);
    const apiEndpoint = `${GITHUB_API_BASE}/repos/${_ghOwner()}/${_ghRepo()}/contents/${path}`;

    try {
        const res = await fetch(apiEndpoint, {
            method:  'PUT',
            headers: _ghHeaders(token, { 'Content-Type': 'application/json' }),
            body: JSON.stringify({
                message: `Upload: ${fileName} (${dept})`,
                content: base64Content,
                branch:  GITHUB_BRANCH
            })
        });

        if (res.status === 201 || res.status === 200) {
            const data   = await res.json();
            const rawUrl = githubRawUrl(path);
            return { success: true, url: rawUrl, path, sha: data.content?.sha || '' };
        }
        const err = await res.json().catch(() => ({}));
        return { success: false, error: `GitHub 업로드 실패 (${res.status}): ${err.message || ''}` };
    } catch(e) {
        return { success: false, error: `GitHub 업로드 오류: ${e.message}` };
    }
}

// ── GitHub 파일 삭제 ──
async function githubDeleteFile(path, sha) {
    const token = getGithubToken();
    if (!token || !path || !sha) return false;

    const apiEndpoint = `${GITHUB_API_BASE}/repos/${_ghOwner()}/${_ghRepo()}/contents/${path}`;
    try {
        const res = await fetch(apiEndpoint, {
            method:  'DELETE',
            headers: _ghHeaders(token, { 'Content-Type': 'application/json' }),
            body: JSON.stringify({ message: `Delete: ${path}`, sha, branch: GITHUB_BRANCH })
        });
        return res.ok || res.status === 200;
    } catch(e) {
        console.warn('[GitHub] 파일 삭제 오류:', e.message);
        return false;
    }
}

// ── GitHub raw URL로 파일 다운로드 (Blob) ──
async function githubFetchFile(rawUrl) {
    try {
        const res = await fetch(rawUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.blob();
    } catch(e) {
        console.warn('[GitHub] 파일 다운로드 오류:', e.message);
        return null;
    }
}

// ── Token 유효성 테스트 + 레포 확인/자동생성 ──
// owner, repo: 관리자 패널에서 입력한 값 (없으면 기본값)
async function testGithubToken(token, owner, repo) {
    const _owner = (owner || _ghOwner() || 'daqdaegarie-hash').trim();
    const _repo  = (repo  || _ghRepo()).trim();

    try {
        // Step 1: 토큰 유효성 확인 (GET /user)
        const userRes = await fetch(`${GITHUB_API_BASE}/user`, {
            headers: _ghHeaders(token)
        });

        if (!userRes.ok) {
            const errData = await userRes.json().catch(() => ({}));
            let msg = `토큰 오류 (${userRes.status})`;
            if (userRes.status === 401) msg = '토큰이 유효하지 않습니다. 만료되었거나 권한이 없습니다.';
            if (userRes.status === 403) msg = '토큰 접근 거부. repo 스코프가 없거나 2FA 설정 확인 필요.';
            return { ok: false, error: `${msg} — ${errData.message || ''}` };
        }

        const userData    = await userRes.json();
        const actualOwner = userData.login; // 실제 GitHub 계정명

        // owner가 실제 계정과 다르면 자동 보정
        const targetOwner = _owner || actualOwner;

        // Step 2: 레포 존재 확인
        const repoRes = await fetch(`${GITHUB_API_BASE}/repos/${targetOwner}/${_repo}`, {
            headers: _ghHeaders(token)
        });

        if (repoRes.ok) {
            const data = await repoRes.json();
            // 런타임 오버라이드 자동 설정
            window._ghOwnerOverride = targetOwner;
            window._ghRepoOverride  = _repo;
            return { ok: true, repoName: data.full_name, private: data.private, owner: actualOwner };
        }

        if (repoRes.status === 404) {
            // Step 3: 레포 없음 → 자동 생성 시도
            const createRes = await fetch(`${GITHUB_API_BASE}/user/repos`, {
                method:  'POST',
                headers: _ghHeaders(token, { 'Content-Type': 'application/json' }),
                body: JSON.stringify({
                    name:        _repo,
                    description: 'AFTER 서식 자료실 파일 스토리지',
                    private:     false,
                    auto_init:   true   // main 브랜치 + README.md 자동 생성
                })
            });

            if (createRes.status === 201) {
                const created = await createRes.json();
                console.log(`[GitHub] 레포 자동 생성 완료: ${created.full_name}`);
                window._ghOwnerOverride = created.owner?.login || actualOwner;
                window._ghRepoOverride  = _repo;
                return { ok: true, repoName: created.full_name, private: created.private, created: true, owner: actualOwner };
            }

            const errData = await createRes.json().catch(() => ({}));
            return {
                ok: false,
                error: `레포가 없고(404) 자동 생성도 실패(${createRes.status}): ${errData.message || ''}`,
                notFound: true,
                owner: actualOwner
            };
        }

        const errBody = await repoRes.json().catch(() => ({}));
        return { ok: false, error: `레포 조회 실패 (${repoRes.status}): ${errBody.message || repoRes.statusText}`, owner: actualOwner };

    } catch(e) {
        return { ok: false, error: `네트워크 오류: ${e.message}` };
    }
}

// ── 레포 자동 생성 (단독 호출용) ──
async function createGithubRepo(token, repoName) {
    try {
        const res = await fetch(`${GITHUB_API_BASE}/user/repos`, {
            method:  'POST',
            headers: _ghHeaders(token, { 'Content-Type': 'application/json' }),
            body: JSON.stringify({
                name:        repoName,
                description: 'AFTER 서식 자료실 파일 스토리지',
                private:     false,
                auto_init:   true
            })
        });
        if (res.status === 201) {
            const data = await res.json();
            return { ok: true, fullName: data.full_name };
        }
        const err = await res.json().catch(() => ({}));
        return { ok: false, error: `${res.status}: ${err.message || ''}` };
    } catch(e) {
        return { ok: false, error: e.message };
    }
}
