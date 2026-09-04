/* ==========================================================================
   아재개그 서바이벌 - Mobile Web Dashboard Application Logic
   ========================================================================== */

const MEMBERS = ['강득헌', '오용택', '정상훈', '지정수', '채연석', '임형채'];
let currentUser = null;
let selectedReaction = null;
let currentReviewAttemptId = null;
let dailyChart = null;

// Signature Canvas Variables
let canvas, ctx;
let isDrawing = false;
let hasSigned = false;

document.addEventListener('DOMContentLoaded', () => {
    initViewport();
    initSignatureCanvas();
    checkLoginSession();
    setupPledgeDate();
    initAttemptDatePicker();
    initJokeTextareaKeydown();
    
    // 5초마다 대기열 카운트 동기화
    setInterval(updatePendingBadge, 5000);
});

/* --------------------------------------------------------------------------
   1. KakaoTalk In-App Browser Dynamic Viewport Height Fix & Date Picker
   -------------------------------------------------------------------------- */
function initViewport() {
    function setVh() {
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
    }
    setVh();
    window.addEventListener('resize', setVh);
    window.addEventListener('orientationchange', setVh);
}

function setupPledgeDate() {
    const dateDisplay = document.getElementById('pledgeDateDisplay');
    if (dateDisplay) {
        const now = new Date();
        dateDisplay.innerText = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일`;
    }
}

function initAttemptDatePicker() {
    const dateInput = document.getElementById('attemptDate');
    if (dateInput) {
        const today = new Date().toISOString().split('T')[0];
        dateInput.value = today;
    }
}

function initJokeTextareaKeydown() {
    const textarea = document.getElementById('jokeContent');
    if (!textarea) return;
    
    textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            // Mac: Option(Alt)+Enter | Win: Ctrl+Enter or Shift+Enter or plain Enter
            if (e.altKey || e.ctrlKey) {
                e.preventDefault();
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                const val = textarea.value;
                textarea.value = val.substring(0, start) + '\n' + val.substring(end);
                textarea.selectionStart = textarea.selectionEnd = start + 1;
            } else {
                e.stopPropagation();
            }
        }
    });
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/* --------------------------------------------------------------------------
   2. HTML5 Digital Signature Canvas
   -------------------------------------------------------------------------- */
function initSignatureCanvas() {
    canvas = document.getElementById('signatureCanvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);
    
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    function getPos(e) {
        const r = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            x: clientX - r.left,
            y: clientY - r.top
        };
    }
    
    function startDraw(e) {
        isDrawing = true;
        hasSigned = true;
        const pos = getPos(e);
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
    }
    
    function moveDraw(e) {
        if (!isDrawing) return;
        e.preventDefault();
        const pos = getPos(e);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
    }
    
    function stopDraw() {
        isDrawing = false;
    }
    
    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', moveDraw);
    canvas.addEventListener('mouseup', stopDraw);
    canvas.addEventListener('mouseleave', stopDraw);
    
    canvas.addEventListener('touchstart', startDraw, { passive: false });
    canvas.addEventListener('touchmove', moveDraw, { passive: false });
    canvas.addEventListener('touchend', stopDraw);
}

function clearSignatureCanvas() {
    if (!ctx || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    hasSigned = false;
}

/* --------------------------------------------------------------------------
   3. Auth & Login / Pledge Workflow
   -------------------------------------------------------------------------- */
let isPledgedUser = false;
let forceRedrawSignature = false;

function checkLoginSession() {
    const savedUser = localStorage.getItem('ajae_user_name');
    if (savedUser && MEMBERS.includes(savedUser)) {
        loginUser(savedUser);
    } else {
        openLoginModal();
    }
}

function openLoginModal() {
    document.getElementById('loginModal').classList.add('active');
    const select = document.getElementById('loginUserSelect');
    if (select && select.value) {
        onLoginUserSelectChange(select.value);
    }
}

function closeLoginModal() {
    document.getElementById('loginModal').classList.remove('active');
}

function onLoginUserSelectChange(userName) {
    const pledgeBox = document.getElementById('existingPledgeBox');
    const sigContainer = document.getElementById('signatureContainer');
    const confirmBtn = document.getElementById('confirmLoginBtn');
    
    if (!userName) {
        if (pledgeBox) pledgeBox.style.display = 'none';
        if (sigContainer) sigContainer.style.display = 'block';
        if (confirmBtn) confirmBtn.innerHTML = '✍️ [동의합니다] 및 대시보드 진입';
        isPledgedUser = false;
        forceRedrawSignature = false;
        return;
    }

    fetch(`/api/pledge/check/${encodeURIComponent(userName)}`)
        .then(res => res.json())
        .then(data => {
            if (data.success && data.has_pledged && data.pledge) {
                isPledgedUser = true;
                forceRedrawSignature = false;
                if (pledgeBox) pledgeBox.style.display = 'block';
                const pledgeDateEl = document.getElementById('existingPledgeDate');
                if (pledgeDateEl) pledgeDateEl.innerText = data.pledge.agreed_date_str || '';
                const sigImgEl = document.getElementById('existingSignatureImg');
                if (sigImgEl) sigImgEl.src = data.pledge.signature_data;
                if (sigContainer) sigContainer.style.display = 'none';
                if (confirmBtn) confirmBtn.innerHTML = '🚀 기존 서명으로 대시보드 진입';
            } else {
                isPledgedUser = false;
                forceRedrawSignature = false;
                if (pledgeBox) pledgeBox.style.display = 'none';
                if (sigContainer) sigContainer.style.display = 'block';
                if (confirmBtn) confirmBtn.innerHTML = '✍️ [동의합니다] 및 대시보드 진입';
            }
        })
        .catch(() => {
            isPledgedUser = false;
            forceRedrawSignature = false;
            if (pledgeBox) pledgeBox.style.display = 'none';
            if (sigContainer) sigContainer.style.display = 'block';
            if (confirmBtn) confirmBtn.innerHTML = '✍️ [동의합니다] 및 대시보드 진입';
        });
}

function toggleRedrawSignature() {
    forceRedrawSignature = !forceRedrawSignature;
    const container = document.getElementById('signatureContainer');
    const confirmBtn = document.getElementById('confirmLoginBtn');
    
    if (forceRedrawSignature) {
        if (container) container.style.display = 'block';
        if (confirmBtn) confirmBtn.innerHTML = '✍️ [새 서명으로 동의] 및 대시보드 진입';
        clearSignatureCanvas();
    } else {
        if (container) container.style.display = 'none';
        if (confirmBtn) confirmBtn.innerHTML = '🚀 기존 서명으로 대시보드 진입';
    }
}

function confirmLoginAndPledge() {
    const select = document.getElementById('loginUserSelect');
    const userName = select.value;
    
    if (!userName) {
        alert('회원 이름을 선택해주세요.');
        return;
    }
    
    // 이미 서약된 회원이며 새 서명을 작성하지 않는 경우: 바로 로그인
    if (isPledgedUser && !forceRedrawSignature) {
        fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: userName })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                loginUser(userName);
                closeLoginModal();
            } else {
                alert(data.message || '로그인 실패');
            }
        })
        .catch(err => alert(err.message || '로그인 오류'));
        return;
    }

    if (!hasSigned) {
        alert('서약서 동의를 위해 아래 영역에 디지털 서명을 해주세요.');
        return;
    }
    
    const signatureData = canvas.toDataURL('image/png');
    
    fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: userName })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            return fetch('/api/pledge/sign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_name: userName,
                    signature_data: signatureData
                })
            });
        } else {
            throw new Error(data.message);
        }
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            loginUser(userName);
            closeLoginModal();
        } else {
            alert(data.message || '서약 처리 중 오류가 발생했습니다.');
        }
    })
    .catch(err => {
        alert(err.message || '로그인 오류가 발생했습니다.');
    });
}

function loginUser(userName) {
    currentUser = userName;
    localStorage.setItem('ajae_user_name', userName);
    document.getElementById('headerUserName').innerText = userName;
    
    updateWitnessDropdown();
    loadDashboard();
    updatePendingBadge();
}

function updateWitnessDropdown() {
    const select = document.getElementById('witnessSelect');
    if (!select) return;
    select.innerHTML = '<option value="">증인을 선택하세요...</option>';
    
    MEMBERS.filter(m => m !== currentUser).forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.innerText = m;
        select.appendChild(opt);
    });
}

/* --------------------------------------------------------------------------
   4. Tab Navigation
   -------------------------------------------------------------------------- */
function switchTab(tabName) {
    document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
    
    const targetPane = document.getElementById(`tab-${tabName}`);
    if (targetPane) targetPane.classList.add('active');
    
    const btnMap = {
        'dashboard': 0,
        'attempt': 1,
        'witness': 2,
        'pledges': 3
    };
    const btns = document.querySelectorAll('.nav-btn');
    if (btns[btnMap[tabName]]) {
        btns[btnMap[tabName]].classList.add('active');
    }
    
    if (tabName === 'dashboard') loadDashboard();
    if (tabName === 'attempt') initAttemptDatePicker();
    if (tabName === 'witness') {
        loadPendingWitnessQueue();
        loadAttemptHistory();
    }
    if (tabName === 'pledges') loadPledgesAndFines();
}

/* --------------------------------------------------------------------------
   5. Dashboard & Ranking Rendering
   -------------------------------------------------------------------------- */
function loadDashboard() {
    fetch('/api/dashboard/summary')
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                renderRankings(data.rankings);
                renderUserSummary(data.rankings);
                renderActivityChart(data.daily_stats);
                renderRecentFeed(data.recent_attempts);
            }
        });
}

function renderUserSummary(rankings) {
    if (!currentUser) return;
    const me = rankings.find(r => r.name === currentUser);
    if (me) {
        document.getElementById('myPepperCount').innerText = `${me.pepper_count}개`;
        document.getElementById('myFineAmount').innerText = `${me.total_fine.toLocaleString()}원`;
    }
}

function renderRankings(rankings) {
    const container = document.getElementById('rankingListContainer');
    if (!container) return;
    
    if (!rankings || rankings.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:15px;">등록된 회원 랭킹이 없습니다.</div>';
        return;
    }
    
    let html = '';
    rankings.forEach(item => {
        const rankClass = item.rank <= 3 ? `rank-${item.rank}` : '';
        const award = item.award || { emoji: '✨', title: '상장', badge: '' };
        
        html += `
            <div class="rank-item ${rankClass}" onclick="openMemberDetailModal('${item.name}')" style="cursor:pointer;" title="클릭하여 날짜별 고추 내역 보기">
                <div class="rank-left">
                    <div class="rank-number">${item.rank}</div>
                    <div>
                        <div class="rank-user-name">
                            ${item.name}
                            <span class="award-tag">${award.emoji} ${award.title}</span>
                        </div>
                        <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">
                            🌶️ ${item.pepper_count}개 | 찐웃음 ${item.success_count}회 | 벌금 ${item.total_fine.toLocaleString()}원
                        </div>
                    </div>
                </div>
                <div class="rank-right">
                    <div class="rank-score">${item.total_score}점</div>
                    <div class="rank-meta">${award.badge} 🔍</div>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

/* Member Pepper & Date Detail Modal */
function openMemberDetailModal(userName) {
    fetch(`/api/members/detail?user_name=${encodeURIComponent(userName)}`)
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                document.getElementById('detailModalTitle').innerText = `🌶️ [${data.user_name}] 님의 날짜별 내역`;
                document.getElementById('detailTotalPepper').innerText = `${data.total_peppers}개`;
                document.getElementById('detailTotalScoreFine').innerText = `${data.total_score}점 / ${data.total_fine.toLocaleString()}원`;
                
                const container = document.getElementById('memberDetailContainer');
                if (!data.daily_peppers || data.daily_peppers.length === 0) {
                    container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">획득한 고추 시도 내역이 없습니다.</div>';
                } else {
                    let html = '';
                    data.daily_peppers.forEach(dp => {
                        html += `
                            <div style="background:rgba(255,255,255,0.04); border:1px solid var(--border-color); border-radius:8px; padding:10px; margin-bottom:10px;">
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; padding-bottom:4px; border-bottom:1px solid rgba(255,255,255,0.08);">
                                    <strong style="color:var(--accent-gold); font-size:0.9rem;">📅 ${dp.date}</strong>
                                    <span style="color:#f87171; font-weight:800; font-size:0.9rem;">🌶️ +${dp.pepper_count}개 (${dp.total_score}점)</span>
                                </div>
                        `;
                        
                        dp.attempts.forEach(att => {
                            let reactionText = '';
                            if (att.reaction === 'SUCCESS') reactionText = '😄 찐웃음 (+20점, 🌶️ 1개)';
                            else if (att.reaction === 'FAILURE') reactionText = '😐 무반응 (+5점, 🌶️ 1개)';
                            else if (att.reaction === 'CRITICAL') reactionText = '😡 불쾌감 (-25점, 벌금 2천원)';
                            else if (att.reaction === 'REDCARD') reactionText = '🟥 레드카드 (0점, 벌금 1만원)';
                            
                            html += `
                                <div style="font-size:0.8rem; color:#cbd5e1; margin-top:4px; padding:4px 6px; background:rgba(0,0,0,0.2); border-radius:4px;">
                                    <div><strong>🎯 타겟: ${att.target_name}</strong> (증인: ${att.witness_name})</div>
                                    <div style="color:white; margin:2px 0;">"${att.joke_content}"</div>
                                    <div style="font-size:0.75rem; color:#94a3b8;">${reactionText}</div>
                                </div>
                            `;
                        });
                        
                        html += `</div>`;
                    });
                    container.innerHTML = html;
                }
                
                document.getElementById('memberDetailModal').classList.add('active');
            }
        });
}

function closeMemberDetailModal() {
    document.getElementById('memberDetailModal').classList.remove('active');
}

function renderActivityChart(dailyStats) {
    const ctxChart = document.getElementById('dailyActivityChart');
    if (!ctxChart) return;
    
    const labels = Object.keys(dailyStats || {});
    const scores = labels.map(k => dailyStats[k].score);
    const attempts = labels.map(k => dailyStats[k].attempts);
    
    if (dailyChart) {
        dailyChart.destroy();
    }
    
    dailyChart = new Chart(ctxChart, {
        type: 'bar',
        data: {
            labels: labels.length ? labels : ['오늘'],
            datasets: [
                {
                    label: '획득 점수',
                    data: scores.length ? scores : [0],
                    backgroundColor: 'rgba(239, 68, 68, 0.7)',
                    borderColor: '#ef4444',
                    borderWidth: 1,
                    borderRadius: 4
                },
                {
                    label: '시도 횟수',
                    data: attempts.length ? attempts : [0],
                    backgroundColor: 'rgba(251, 191, 36, 0.5)',
                    borderColor: '#fbbf24',
                    borderWidth: 1,
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: '#94a3b8', font: { size: 10 } }
                }
            },
            scales: {
                x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } }
            }
        }
    });
}

function renderRecentFeed(attempts) {
    const container = document.getElementById('recentFeedContainer');
    if (!container) return;
    
    if (!attempts || attempts.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:15px; color:var(--text-muted);">최근 개그 시도 내역이 없습니다.</div>';
        return;
    }
    
    let html = '';
    attempts.forEach(att => {
        let statusBadge = '';
        if (att.status === 'PENDING') {
            statusBadge = '<span style="color:#fbbf24;">⏳ 증인 승인 대기중</span>';
        } else if (att.status === 'REJECTED') {
            statusBadge = '<span style="color:#94a3b8;">❌ 증인 반려됨</span>';
        } else if (att.reaction === 'SUCCESS') {
            statusBadge = '<span style="color:#10b981;">😄 찐웃음 (+20점, 🌶️)</span>';
        } else if (att.reaction === 'FAILURE') {
            statusBadge = '<span style="color:#3b82f6;">😐 무반응 (+5점, 🌶️)</span>';
        } else if (att.reaction === 'CRITICAL') {
            statusBadge = '<span style="color:#ef4444;">😡 불쾌감 (-25점, 벌금 2천원)</span>';
        } else if (att.reaction === 'REDCARD') {
            statusBadge = '<span style="color:#dc2626; font-weight:800;">🟥 레드카드 (무효, 벌금 1만원)</span>';
        }
        
        const displayDate = att.attempt_date || att.created_date_str;
        
        html += `
            <div style="padding:10px 0; border-bottom:1px solid var(--border-color); font-size:0.85rem;">
                <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                    <strong>${escapeHtml(att.author_name)} ➔ ${escapeHtml(att.target_name)}</strong>
                    <span style="font-size:0.75rem; color:var(--accent-gold); font-weight:600;">📅 ${displayDate} (증인: ${escapeHtml(att.witness_name)})</span>
                </div>
                <div style="color:#cbd5e1; margin-bottom:4px; white-space:pre-wrap; word-break:break-word;">"${escapeHtml(att.joke_content)}"</div>
                <div>${statusBadge}</div>
            </div>
        `;
    });
    container.innerHTML = html;
}

/* --------------------------------------------------------------------------
   6. Submit Attempt (시도자 - 날짜 포함)
   -------------------------------------------------------------------------- */
function submitAttempt(event) {
    event.preventDefault();
    if (!currentUser) {
        alert('로그인이 필요합니다.');
        openLoginModal();
        return;
    }
    
    const jokeContent = document.getElementById('jokeContent').value;
    const targetName = document.getElementById('targetName').value;
    const witnessName = document.getElementById('witnessSelect').value;
    const attemptDate = document.getElementById('attemptDate').value;
    
    fetch('/api/attempts/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            author_name: currentUser,
            joke_content: jokeContent,
            target_name: targetName,
            witness_name: witnessName,
            attempt_date: attemptDate
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            alert(`🌶️ 개그 시도 (${attemptDate})가 제출되었습니다!\n증인 [${witnessName}] 님의 승인을 기다립니다.`);
            document.getElementById('attemptForm').reset();
            initAttemptDatePicker();
            switchTab('witness');
        } else {
            alert(data.message || '제출에 실패했습니다.');
        }
    });
}

/* --------------------------------------------------------------------------
   7. Witness Queue & Approval Logic & History
   -------------------------------------------------------------------------- */
let currentHistoryFilter = 'ALL';
let historyDataCache = [];

function updatePendingBadge() {
    if (!currentUser) return;
    fetch(`/api/attempts/pending?user_name=${encodeURIComponent(currentUser)}`)
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                const count = data.pending_attempts.length;
                const badge = document.getElementById('pendingQueueBadge');
                if (badge) {
                    if (count > 0) {
                        badge.innerText = count;
                        badge.style.display = 'block';
                    } else {
                        badge.style.display = 'none';
                    }
                }
            }
        });
}

function loadPendingWitnessQueue() {
    if (!currentUser) {
        openLoginModal();
        return;
    }
    
    fetch(`/api/attempts/pending?user_name=${encodeURIComponent(currentUser)}`)
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                renderPendingQueue(data.pending_attempts);
            }
        });
}

function renderPendingQueue(pendingList) {
    const container = document.getElementById('pendingQueueContainer');
    if (!container) return;
    
    if (!pendingList || pendingList.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">내가 증인으로 지정된 승인 대기 항목이 없습니다.</div>';
        return;
    }
    
    let html = '';
    pendingList.forEach(item => {
        const displayDate = item.attempt_date || item.created_date_str;
        html += `
            <div style="background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:var(--radius-sm); padding:12px; margin-bottom:12px;">
                <div style="display:flex; justify-content:space-between; margin-bottom:6px; font-size:0.85rem;">
                    <strong style="color:var(--accent-gold);">시도자: ${escapeHtml(item.author_name)} (타겟: ${escapeHtml(item.target_name)})</strong>
                    <span style="font-size:0.75rem; color:#f87171; font-weight:700;">📅 시도일: ${displayDate}</span>
                </div>
                <div style="font-size:0.95rem; color:#f8fafc; margin-bottom:10px; padding:8px; background:rgba(0,0,0,0.3); border-radius:6px; white-space:pre-wrap; word-break:break-word;">
                    "${escapeHtml(item.joke_content)}"
                </div>
                <div style="display:flex; gap:10px;">
                    <button class="btn btn-outline" style="flex:1; padding:8px; font-size:0.8rem;" onclick="rejectAttemptDirect(${item.id})">❌ 반려</button>
                    <button class="btn btn-primary" style="flex:2; padding:8px; font-size:0.8rem;" onclick="openReviewModal(${item.id}, '${escapeQuotes(item.author_name)}', '${escapeQuotes(item.target_name)}', '${escapeQuotes(item.joke_content)}', '${displayDate}')">✅ 반응 선택 & 승인</button>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

function escapeQuotes(str) {
    return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function openReviewModal(attemptId, authorName, targetName, jokeContent, attemptDate) {
    currentReviewAttemptId = attemptId;
    selectedReaction = null;
    
    document.querySelectorAll('.reaction-btn').forEach(btn => btn.classList.remove('selected'));
    
    document.getElementById('reviewJokePreview').innerHTML = `
        <strong>[${escapeHtml(authorName)} ➔ ${escapeHtml(targetName)}] (📅 시도일: ${attemptDate})</strong>
        <div style="margin-top:6px; padding:8px; background:rgba(0,0,0,0.3); border-radius:6px; color:#f8fafc; white-space:pre-wrap; word-break:break-word;">"${escapeHtml(jokeContent)}"</div>
    `;
    
    document.getElementById('reviewModal').classList.add('active');
}

function closeReviewModal() {
    document.getElementById('reviewModal').classList.remove('active');
}

function selectReaction(reactionType) {
    selectedReaction = reactionType;
    document.querySelectorAll('.reaction-btn').forEach(btn => btn.classList.remove('selected'));
    const targetBtn = document.getElementById(`btnReaction${reactionType}`);
    if (targetBtn) targetBtn.classList.add('selected');
}

function submitReviewAction(action) {
    if (!currentReviewAttemptId) return;
    if (action === 'APPROVE' && !selectedReaction) {
        alert('타겟의 리액션(찐웃음/무반응/불쾌감/레드카드)을 하나 선택해주세요.');
        return;
    }
    
    fetch('/api/attempts/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            reviewer_name: currentUser,
            attempt_id: currentReviewAttemptId,
            action: action,
            reaction: selectedReaction
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            closeReviewModal();
            loadPendingWitnessQueue();
            loadAttemptHistory();
            updatePendingBadge();
            alert('증인 판정이 완료되어 실시간 DB 및 랭킹에 반영되었습니다!');
        } else {
            alert(data.message || '처리 실패');
        }
    });
}

function rejectAttemptDirect(attemptId) {
    if (!confirm('정말 이 개그 시도를 반려하시겠습니까?')) return;
    
    fetch('/api/attempts/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            reviewer_name: currentUser,
            attempt_id: attemptId,
            action: 'REJECT'
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            loadPendingWitnessQueue();
            loadAttemptHistory();
            updatePendingBadge();
        }
    });
}

/* --------------------------------------------------------------------------
   Daily Submission & Witness Approval History Logic
   -------------------------------------------------------------------------- */
function loadAttemptHistory() {
    fetch('/api/attempts/history')
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                historyDataCache = data.history || [];
                renderAttemptHistory();
            }
        });
}

function filterHistory(filterType, btnEl) {
    currentHistoryFilter = filterType;
    if (btnEl) {
        document.querySelectorAll('.history-filter-btn').forEach(btn => btn.classList.remove('active'));
        btnEl.classList.add('active');
    }
    renderAttemptHistory();
}

function renderAttemptHistory() {
    const container = document.getElementById('historyListContainer');
    if (!container) return;
    
    if (!historyDataCache || historyDataCache.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">제출된 개그 시도 히스토리가 없습니다.</div>';
        return;
    }
    
    let html = '';
    let hasMatchingGroup = false;
    
    historyDataCache.forEach(group => {
        const filteredAttempts = group.attempts.filter(att => {
            if (currentHistoryFilter === 'ALL') return true;
            return att.status === currentHistoryFilter;
        });
        
        if (filteredAttempts.length === 0) return;
        hasMatchingGroup = true;
        
        html += `
            <div style="margin-bottom:14px; background:rgba(255,255,255,0.02); border:1px solid var(--border-color); border-radius:var(--radius-sm); padding:10px;">
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.08); padding-bottom:6px; margin-bottom:8px;">
                    <strong style="color:var(--accent-gold); font-size:0.88rem;">📅 ${group.date} 제출 내역 (${filteredAttempts.length}건)</strong>
                </div>
        `;
        
        filteredAttempts.forEach(att => {
            let statusBadgeHtml = '';
            if (att.status === 'PENDING') {
                statusBadgeHtml = `<span style="background:rgba(251, 191, 36, 0.15); color:#fbbf24; border:1px solid rgba(251, 191, 36, 0.4); padding:2px 8px; border-radius:12px; font-size:0.72rem; font-weight:700;">⏳ 승인 대기중</span>`;
            } else if (att.status === 'REJECTED') {
                statusBadgeHtml = `<span style="background:rgba(148, 163, 184, 0.15); color:#94a3b8; border:1px solid rgba(148, 163, 184, 0.4); padding:2px 8px; border-radius:12px; font-size:0.72rem; font-weight:700;">❌ 증인 반려됨</span>`;
            } else if (att.status === 'APPROVED') {
                if (att.reaction === 'SUCCESS') {
                    statusBadgeHtml = `<span style="background:rgba(16, 185, 129, 0.15); color:#10b981; border:1px solid rgba(16, 185, 129, 0.4); padding:2px 8px; border-radius:12px; font-size:0.72rem; font-weight:700;">😄 찐웃음 (승인) (+20점, 🌶️)</span>`;
                } else if (att.reaction === 'FAILURE') {
                    statusBadgeHtml = `<span style="background:rgba(59, 130, 246, 0.15); color:#3b82f6; border:1px solid rgba(59, 130, 246, 0.4); padding:2px 8px; border-radius:12px; font-size:0.72rem; font-weight:700;">😐 무반응 (승인) (+5점, 🌶️)</span>`;
                } else if (att.reaction === 'CRITICAL') {
                    statusBadgeHtml = `<span style="background:rgba(239, 68, 68, 0.15); color:#ef4444; border:1px solid rgba(239, 68, 68, 0.4); padding:2px 8px; border-radius:12px; font-size:0.72rem; font-weight:700;">😡 불쾌감 (-25점, 벌금 2천원)</span>`;
                } else if (att.reaction === 'REDCARD') {
                    statusBadgeHtml = `<span style="background:rgba(220, 38, 38, 0.2); color:#dc2626; border:1px solid rgba(220, 38, 38, 0.5); padding:2px 8px; border-radius:12px; font-size:0.72rem; font-weight:800;">🟥 레드카드 (무효, 벌금 1만원)</span>`;
                }
            }
            
            html += `
                <div style="padding:10px; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.06); border-radius:8px; margin-bottom:10px; font-size:0.85rem;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                        <strong style="color:white; font-size:0.9rem;">${escapeHtml(att.author_name)} ➔ ${escapeHtml(att.target_name)}</strong>
                        ${statusBadgeHtml}
                    </div>
                    <div style="color:#e2e8f0; margin:6px 0; font-size:0.9rem; line-height:1.5; white-space:pre-wrap; word-break:break-word; background:rgba(255,255,255,0.03); padding:8px; border-radius:6px; border-left:3px solid var(--accent-gold);">
                        "${escapeHtml(att.joke_content)}"
                    </div>
                    <div style="font-size:0.75rem; color:var(--text-muted); display:flex; justify-content:space-between; align-items:center; margin-top:6px;">
                        <span>현장 참관 증인: <strong style="color:var(--accent-gold);">${escapeHtml(att.witness_name)}</strong></span>
                        <span>📅 시도일: ${att.attempt_date}</span>
                    </div>
                </div>
            `;
        });
        
        html += `</div>`;
    });
    
    if (!hasMatchingGroup) {
        container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">해당 조건의 제출 항목이 없습니다.</div>';
    } else {
        container.innerHTML = html;
    }
}

/* --------------------------------------------------------------------------
   8. Fine Ledger & Signed Pledges Viewer
   -------------------------------------------------------------------------- */
function loadPledgesAndFines() {
    fetch('/api/dashboard/summary')
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                renderFineLedger(data.rankings);
            }
        });
        
    fetch('/api/pledge/list')
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                renderSignedPledges(data.pledges);
            }
        });
}

function renderFineLedger(rankings) {
    const container = document.getElementById('fineLedgerContainer');
    if (!container) return;
    
    let html = '';
    let totalAllFines = 0;
    
    rankings.forEach(item => {
        totalAllFines += item.total_fine;
        html += `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid var(--border-color); font-size:0.95rem;">
                <div>
                    <strong>${item.name}</strong>
                    <span style="font-size:0.75rem; color:var(--text-muted); margin-left:6px;">(불쾌감 ${item.critical_count}회 | 레드카드 ${item.redcard_count}회)</span>
                </div>
                <div style="font-weight:800; color:${item.total_fine > 0 ? '#f59e0b' : 'var(--text-muted)'};">
                    ${item.total_fine.toLocaleString()}원
                </div>
            </div>
        `;
    });
    
    html += `
        <div style="display:flex; justify-content:space-between; align-items:center; padding-top:12px; font-weight:800; font-size:1.05rem; color:#f87171;">
            <span>모임 총 누적 벌금</span>
            <span>${totalAllFines.toLocaleString()}원</span>
        </div>
    `;
    
    container.innerHTML = html;
}

function renderSignedPledges(pledges) {
    const container = document.getElementById('signedPledgesList');
    if (!container) return;
    
    let html = '';
    MEMBERS.forEach(memberName => {
        const pledge = pledges.find(p => p.user_name === memberName);
        if (pledge) {
            html += `
                <div class="signed-pledge-item">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                        <strong style="color:white; font-size:0.95rem;">👤 ${pledge.user_name} 서약 완료</strong>
                        <span style="font-size:0.75rem; color:var(--accent-gold);">${pledge.agreed_date_str}</span>
                    </div>
                    <div style="font-size:0.75rem; color:var(--text-muted);">
                        "아재개그 서바이벌 비밀 유지 및 서약서 제1조~5조 동의"
                    </div>
                    <div style="margin-top:6px;">
                        <img src="${pledge.signature_data}" class="signature-img-preview" alt="${pledge.user_name} 서명" />
                    </div>
                </div>
            `;
        } else {
            html += `
                <div class="signed-pledge-item" style="opacity:0.6;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <strong style="color:var(--text-muted); font-size:0.95rem;">👤 ${memberName} (미동의)</strong>
                        <span style="font-size:0.75rem; color:#f87171;">서명 대기중</span>
                    </div>
                </div>
            `;
        }
    });
    
    container.innerHTML = html;
}
