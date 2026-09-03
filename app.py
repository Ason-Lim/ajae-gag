import os
from datetime import datetime
from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from models import db, User, Pledge, Attempt, MEMBERS

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'ajae_gag_survival_secret_key_2026')

# Render PostgreSQL 호환 DATABASE_URL 설정 (psycopg2 및 pg8000 fallback 포함)
db_url = os.environ.get('DATABASE_URL', 'sqlite:///ajae_gag.db')
if db_url.startswith('postgres://'):
    db_url = db_url.replace('postgres://', 'postgresql://', 1)

if db_url.startswith('postgresql://') and not db_url.startswith('postgresql+'):
    try:
        import psycopg2
    except Exception:
        # C 확장 모듈 문제 발생 시 순수 파이썬 pg8000 드라이버 자동 전환
        db_url = db_url.replace('postgresql://', 'postgresql+pg8000://', 1)

app.config['SQLALCHEMY_DATABASE_URI'] = db_url
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db.init_app(app)

# 특별 상장 매칭 테이블 (1~6등)
AWARDS = {
    1: {'title': '고래세우상', 'emoji': '🐳', 'badge': '1등 최우수'},
    2: {'title': '조지보쌈상', 'emoji': '🥩', 'badge': '2등 우수'},
    3: {'title': '또라애로상', 'emoji': '🌀', 'badge': '3등 준우수'},
    4: {'title': '추파춥스상', 'emoji': '🍭', 'badge': '4등 장려'},
    5: {'title': '철판상', 'emoji': '🍳', 'badge': '5등 감투'},
    6: {'title': '미진밉상', 'emoji': '👿', 'badge': '6등 밉상'}
}

def init_db():
    """데이터베이스 및 기본 6인 사용자 초기화"""
    with app.app_context():
        db.create_all()
        # 6명 사용자 기본 생성
        for name in MEMBERS:
            user = User.query.filter_by(name=name).first()
            if not user:
                db.session.add(User(name=name))
        db.session.commit()

# 앱 실행 직전 DB 초기화
init_db()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/members', methods=['GET'])
def get_members():
    """6명 회원 목록 및 서약 동의 여부 반환"""
    users = User.query.all()
    user_list = [u.to_dict() for u in users]
    ordered_users = sorted(user_list, key=lambda x: MEMBERS.index(x['name']) if x['name'] in MEMBERS else 99)
    return jsonify({'success': True, 'members': ordered_users})

@app.route('/api/auth/login', methods=['POST'])
def login():
    """사용자 이름으로 로그인 / 동의 여부 체크"""
    data = request.get_json() or {}
    name = data.get('name', '').strip()
    
    if name not in MEMBERS:
        return jsonify({'success': False, 'message': '등록된 6명의 회원(강득헌, 오용택, 정상훈, 지정수, 채연석, 임형채) 이름만 접속 가능합니다.'}), 400
    
    user = User.query.filter_by(name=name).first()
    if not user:
        user = User(name=name)
        db.session.add(user)
        db.session.commit()
        
    session['user_id'] = user.id
    session['user_name'] = user.name
    
    return jsonify({
        'success': True,
        'user': user.to_dict()
    })

@app.route('/api/pledge/sign', methods=['POST'])
def sign_pledge():
    """서약서 동의 및 서명 저장"""
    user_name = session.get('user_name') or request.json.get('user_name')
    if not user_name:
        return jsonify({'success': False, 'message': '로그인이 필요합니다.'}), 401
    
    user = User.query.filter_by(name=user_name).first()
    if not user:
        return jsonify({'success': False, 'message': '존재하지 않는 회원입니다.'}), 404
        
    data = request.get_json() or {}
    signature_data = data.get('signature_data')
    if not signature_data:
        return jsonify({'success': False, 'message': '서약서 동의를 위해 서명을 입력해주세요.'}), 400
        
    now = datetime.now()
    agreed_date_str = f"{now.year}년 {now.month}월 {now.day}일"
    
    pledge = Pledge.query.filter_by(user_id=user.id).first()
    if not pledge:
        pledge = Pledge(
            user_id=user.id,
            signature_data=signature_data,
            agreed_date_str=agreed_date_str
        )
        db.session.add(pledge)
    else:
        pledge.signature_data = signature_data
        pledge.agreed_date_str = agreed_date_str
        pledge.agreed_at = datetime.utcnow()
        
    db.session.commit()
    return jsonify({'success': True, 'pledge': pledge.to_dict()})

@app.route('/api/pledge/list', methods=['GET'])
def list_pledges():
    """모든 회원의 서약서 서명 내역 조회"""
    pledges = Pledge.query.all()
    return jsonify({'success': True, 'pledges': [p.to_dict() for p in pledges]})

@app.route('/api/attempts/create', methods=['POST'])
def create_attempt():
    """개그 시도 제출 (시도자)"""
    user_name = session.get('user_name')
    data = request.get_json() or {}
    
    if not user_name:
        user_name = data.get('author_name')
        
    user = User.query.filter_by(name=user_name).first()
    if not user:
        return jsonify({'success': False, 'message': '로그인이 필요합니다.'}), 401
        
    witness_name = data.get('witness_name')
    target_name = data.get('target_name', '').strip()
    joke_content = data.get('joke_content', '').strip()
    
    if not witness_name or not target_name or not joke_content:
        return jsonify({'success': False, 'message': '개그 내용, 타겟 이름, 현장 증인을 모두 입력해주세요.'}), 400
        
    if witness_name == user.name:
        return jsonify({'success': False, 'message': '본인을 증인으로 지정할 수 없습니다.'}), 400
        
    witness = User.query.filter_by(name=witness_name).first()
    if not witness:
        return jsonify({'success': False, 'message': '올바른 증인을 선택해주세요.'}), 400
        
    attempt = Attempt(
        user_id=user.id,
        witness_id=witness.id,
        target_name=target_name,
        joke_content=joke_content,
        status='PENDING'
    )
    db.session.add(attempt)
    db.session.commit()
    
    return jsonify({'success': True, 'attempt': attempt.to_dict()})

@app.route('/api/attempts/pending', methods=['GET'])
def get_pending_attempts():
    """내가 증인으로 지정된 대기 중인 시도 목록"""
    user_name = session.get('user_name') or request.args.get('user_name')
    if not user_name:
        return jsonify({'success': False, 'message': '로그인이 필요합니다.'}), 401
        
    user = User.query.filter_by(name=user_name).first()
    if not user:
        return jsonify({'success': False, 'message': '회원 정보를 찾을 수 없습니다.'}), 404
        
    pending = Attempt.query.filter_by(witness_id=user.id, status='PENDING').order_by(Attempt.created_at.desc()).all()
    return jsonify({'success': True, 'pending_attempts': [p.to_dict() for p in pending]})

@app.route('/api/attempts/review', methods=['POST'])
def review_attempt():
    """증인의 승인/반려 및 리액션 확정"""
    user_name = session.get('user_name') or request.json.get('reviewer_name')
    if not user_name:
        return jsonify({'success': False, 'message': '로그인이 필요합니다.'}), 401
        
    user = User.query.filter_by(name=user_name).first()
    data = request.get_json() or {}
    
    attempt_id = data.get('attempt_id')
    action = data.get('action')  # 'APPROVE' or 'REJECT'
    reaction = data.get('reaction')  # 'SUCCESS', 'FAILURE', 'CRITICAL', 'REDCARD'
    
    attempt = Attempt.query.get(attempt_id)
    if not attempt:
        return jsonify({'success': False, 'message': '해당 시도 건을 찾을 수 없습니다.'}), 404
        
    if attempt.witness_id != user.id:
        return jsonify({'success': False, 'message': '지정된 증인만 승인/반려할 수 있습니다.'}), 403
        
    if attempt.status != 'PENDING':
        return jsonify({'success': False, 'message': '이미 처리가 완료된 항목입니다.'}), 400
        
    if action == 'REJECT':
        attempt.status = 'REJECTED'
        attempt.reaction = None
        attempt.points_awarded = 0
        attempt.pepper_delta = 0
        attempt.fine_amount = 0
    elif action == 'APPROVE':
        attempt.status = 'APPROVED'
        attempt.reaction = reaction
        
        # 행동 기반 점수 및 벌금 로직
        if reaction == 'SUCCESS':  # 찐웃음 (추가 +15점, 총 +20점)
            attempt.points_awarded = 20
            attempt.pepper_delta = 1
            attempt.fine_amount = 0
        elif reaction == 'FAILURE':  # 무반응 (추가 점수 없음, 총 +5점)
            attempt.points_awarded = 5
            attempt.pepper_delta = 1
            attempt.fine_amount = 0
        elif reaction == 'CRITICAL':  # 치명타 (불쾌감: -30점, 총 -25점, 고추 아이콘 차감/0, 벌금 2,000원)
            attempt.points_awarded = -25
            attempt.pepper_delta = 0
            attempt.fine_amount = 2000
        elif reaction == 'REDCARD':  # 레드카드 (외모/성적 비하: 시도 점수 무효화 0점, 벌금 10,000원)
            attempt.points_awarded = 0
            attempt.pepper_delta = 0
            attempt.fine_amount = 10000
        else:
            return jsonify({'success': False, 'message': '올바른 반응 유형을 선택해주세요.'}), 400
    else:
        return jsonify({'success': False, 'message': '올바른 처리 동작을 선택해주세요.'}), 400
        
    attempt.reviewed_at = datetime.utcnow()
    db.session.commit()
    
    return jsonify({'success': True, 'attempt': attempt.to_dict()})

@app.route('/api/dashboard/summary', methods=['GET'])
def dashboard_summary():
    """랭킹, 상장, 고추 개수, 벌금 총액, 시도 내역 집계 반환"""
    users = User.query.all()
    
    stats = {}
    for u in users:
        stats[u.id] = {
            'user_id': u.id,
            'name': u.name,
            'total_score': 0,
            'pepper_count': 0,
            'total_fine': 0,
            'attempt_count': 0,
            'success_count': 0,
            'critical_count': 0,
            'redcard_count': 0,
            'has_pledged': u.pledge is not None
        }
        
    approved_attempts = Attempt.query.filter_by(status='APPROVED').all()
    for att in approved_attempts:
        if att.user_id in stats:
            s = stats[att.user_id]
            s['total_score'] += att.points_awarded
            s['pepper_count'] += att.pepper_delta
            s['total_fine'] += att.fine_amount
            s['attempt_count'] += 1
            if att.reaction == 'SUCCESS':
                s['success_count'] += 1
            elif att.reaction == 'CRITICAL':
                s['critical_count'] += 1
            elif att.reaction == 'REDCARD':
                s['redcard_count'] += 1
                
    # MEMBERS 기본 정의 순서 기반 초기 정렬 후 점수순 정렬 (초기 0점 시 MEMBERS 순서 유지)
    ranking_list = sorted(list(stats.values()), key=lambda x: (x['total_score'], x['success_count'], -MEMBERS.index(x['name'])), reverse=True)
    
    # 1~6등 상장 매칭
    for idx, member in enumerate(ranking_list):
        rank = idx + 1
        award_info = AWARDS.get(rank, {'title': '참여상', 'emoji': '✨', 'badge': f'{rank}등'})
        member['rank'] = rank
        member['award'] = award_info
        
    # 최근 시도 내역 (최신 15개)
    recent_attempts = Attempt.query.order_by(Attempt.created_at.desc()).limit(15).all()
    
    # 날짜별 점수 및 참여 현황 (최근 7일/평일 집계)
    daily_stats = {}
    for att in approved_attempts:
        date_key = att.created_at.strftime('%m-%d')
        if date_key not in daily_stats:
            daily_stats[date_key] = {'attempts': 0, 'score': 0, 'fines': 0}
        daily_stats[date_key]['attempts'] += 1
        daily_stats[date_key]['score'] += att.points_awarded
        daily_stats[date_key]['fines'] += att.fine_amount
        
    return jsonify({
        'success': True,
        'rankings': ranking_list,
        'recent_attempts': [a.to_dict() for a in recent_attempts],
        'daily_stats': daily_stats
    })

@app.route('/api/admin/reset_scores', methods=['POST', 'GET'])
def reset_scores():
    """모든 개그 시도 내역 삭제 (초기 0점 상태 리셋)"""
    with app.app_context():
        Attempt.query.delete()
        db.session.commit()
    return jsonify({'success': True, 'message': '모든 시도 내역이 리셋되어 6명 회원의 초기 점수, 고추, 벌금이 0으로 변경되었습니다.'})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
