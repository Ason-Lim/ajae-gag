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
    
    // 3초마다 대기열 카운트 동기화
    setInterval(updatePendingBadge, 5000);
});

/* --------------------------------------------------------------------------
   1. KakaoTalk In-App Browser Dynamic Viewport Height Fix
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

/* --------------------------------------------------------------------------
   2. HTML5 Digital Signature Canvas
   -------------------------------------------------------------------------- */
function initSignatureCanvas() {
    canvas = document.getElementById('signatureCanvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    
    // High DPI Canvas Scaling
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
    
    // Mouse & Touch events
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
}

function closeLoginModal() {
    document.getElementById('loginModal').classList.remove('active');
}

function confirmLoginAndPledge() {
    const select = document.getElementById('loginUserSelect');
    const userName = select.value;
    
    if (!userName) {
        alert('회원 이름을 선택해주세요.');
        return;
    }
    
    if (!hasSigned) {
        alert('서약서 동의를 위해 아래 영역에 디지털 서명을 해주세요.');
        return;
    }
    
    const signatureData = canvas.toDataURL('image/png');
    
    // Login API
    fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: userName })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            // Sign Pledge API
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
    
    // Update witness dropdown (exclude self)
    updateWitnessDropdown();
    
    // Load initial data
    loadDashboard();
    updatePendingBadge();
    
    // Auto seed demo data if dashboard is empty
    fetch('/api/seed', { method: 'POST' }).then(() => loadDashboard());
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
    
    // Nav Button activation
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
    
    // Load tab content
    if (tabName === 'dashboard') loadDashboard();
    if (tabName === 'witness') loadPendingWitnessQueue();
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
            <div class="rank-item ${rankClass}">
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
                    <div class="rank-meta">${award.badge}</div>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
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
        
        html += `
            <div style="padding:10px 0; border-bottom:1px solid var(--border-color); font-size:0.85rem;">
                <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                    <strong>${att.author_name} ➔ ${att.target_name}</strong>
                    <span style="font-size:0.75rem; color:var(--text-muted);">${att.created_date_str} (증인: ${att.witness_name})</span>
                </div>
                <div style="color:#cbd5e1; margin-bottom:4px;">"${att.joke_content}"</div>
                <div>${statusBadge}</div>
            </div>
        `;
    });
    container.innerHTML = html;
}

/* --------------------------------------------------------------------------
   6. Submit Attempt (시도자)
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
    
    fetch('/api/attempts/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            author_name: currentUser,
            joke_content: jokeContent,
            target_name: targetName,
            witness_name: witnessName
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            alert(`🌶️ 개그 시도가 제출되었습니다!\n증인 [${witnessName}] 님의 승인을 기다립니다.`);
            document.getElementById('attemptForm').reset();
            switchTab('dashboard');
        } else {
            alert(data.message || '제출에 실패했습니다.');
        }
    });
}

/* --------------------------------------------------------------------------
   7. Witness Queue & Approval Logic
   -------------------------------------------------------------------------- */
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
        html += `
            <div style="background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:var(--radius-sm); padding:12px; margin-bottom:12px;">
                <div style="display:flex; justify-content:space-between; margin-bottom:6px; font-size:0.85rem;">
                    <strong style="color:var(--accent-gold);">시도자: ${item.author_name} (타겟: ${item.target_name})</strong>
                    <span style="font-size:0.75rem; color:var(--text-muted);">${item.created_date_str}</span>
                </div>
                <div style="font-size:0.95rem; color:#f8fafc; margin-bottom:10px; padding:8px; background:rgba(0,0,0,0.3); border-radius:6px;">
                    "${item.joke_content}"
                </div>
                <div style="display:flex; gap:10px;">
                    <button class="btn btn-outline" style="flex:1; padding:8px; font-size:0.8rem;" onclick="rejectAttemptDirect(${item.id})">❌ 반려</button>
                    <button class="btn btn-primary" style="flex:2; padding:8px; font-size:0.8rem;" onclick="openReviewModal(${item.id}, '${item.author_name}', '${item.target_name}', '${escapeQuotes(item.joke_content)}')">✅ 반응 선택 & 승인</button>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

function escapeQuotes(str) {
    return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function openReviewModal(attemptId, authorName, targetName, jokeContent) {
    currentReviewAttemptId = attemptId;
    selectedReaction = null;
    
    document.querySelectorAll('.reaction-btn').forEach(btn => btn.classList.remove('selected'));
    
    document.getElementById('reviewJokePreview').innerHTML = `
        <strong>[${authorName} ➔ ${targetName}]</strong><br>"${jokeContent}"
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
            updatePendingBadge();
        }
    });
}

/* --------------------------------------------------------------------------
   8. Fine Ledger & Signed Pledges Viewer
   -------------------------------------------------------------------------- */
function loadPledgesAndFines() {
    // 1. Load Dashboard Summary for Fines
    fetch('/api/dashboard/summary')
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                renderFineLedger(data.rankings);
            }
        });
        
    // 2. Load Signed Pledges
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
