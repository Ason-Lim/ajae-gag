import os
from datetime import datetime
from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from models import db, User, Pledge, Attempt, AttemptWitness, MEMBERS

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
        try:
            with db.engine.connect() as conn:
                conn.execute(db.text("ALTER TABLE attempts ADD COLUMN attempt_date VARCHAR(20)"))
                conn.commit()
        except Exception:
            pass
        for name in MEMBERS:
            user = User.query.filter_by(name=name).first()
            if not user:
                db.session.add(User(name=name))
        db.session.commit()

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

@app.route('/api/members/detail', methods=['GET'])
def get_member_detail():
    """회원별 날짜별 고추 획득 내역 및 상세 기록 조회"""
    user_name = request.args.get('user_name')
    if not user_name:
        return jsonify({'success': False, 'message': '회원 이름을 지정해주세요.'}), 400
        
    user = User.query.filter_by(name=user_name).first()
    if not user:
        return jsonify({'success': False, 'message': '회원을 찾을 수 없습니다.'}), 404
        
    approved_attempts = Attempt.query.filter_by(user_id=user.id, status='APPROVED').order_by(Attempt.attempt_date.desc(), Attempt.created_at.desc()).all()
    
    daily_peppers = {}
    for att in approved_attempts:
        d = att.attempt_date or att.created_at.strftime('%Y-%m-%d')
        if d not in daily_peppers:
            daily_peppers[d] = {'date': d, 'pepper_count': 0, 'total_score': 0, 'attempts': []}
        daily_peppers[d]['pepper_count'] += att.pepper_delta
        daily_peppers[d]['total_score'] += att.points_awarded
        daily_peppers[d]['attempts'].append(att.to_dict())
        
    return jsonify({
        'success': True,
        'user_name': user.name,
        'total_peppers': sum(a.pepper_delta for a in approved_attempts),
        'total_score': sum(a.points_awarded for a in approved_attempts),
        'total_fine': sum(a.fine_amount for a in approved_attempts),
        'daily_peppers': list(daily_peppers.values()),
        'attempts': [a.to_dict() for a in approved_attempts]
    })

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

@app.route('/api/pledge/check/<user_name>', methods=['GET'])
def check_pledge(user_name):
    """특정 회원의 서약 완료 여부 및 서명 정보 조회"""
    user = User.query.filter_by(name=user_name).first()
    if not user:
        return jsonify({'success': False, 'message': '회원을 찾을 수 없습니다.'}), 404
    
    pledge = Pledge.query.filter_by(user_id=user.id).first()
    if pledge:
        return jsonify({
            'success': True,
            'has_pledged': True,
            'pledge': pledge.to_dict()
        })
    return jsonify({
        'success': True,
        'has_pledged': False,
        'pledge': None
    })


@app.route('/api/attempts/create', methods=['POST'])
def create_attempt():
    """개그 시도 제출 (시도자 - 다수 증인 선택 지원)"""
    user_name = session.get('user_name')
    data = request.get_json() or {}
    
    if not user_name:
        user_name = data.get('author_name')
        
    user = User.query.filter_by(name=user_name).first()
    if not user:
        return jsonify({'success': False, 'message': '로그인이 필요합니다.'}), 401
        
    witness_names = data.get('witness_names')
    if not witness_names:
        single_w = data.get('witness_name')
        if single_w:
            witness_names = [single_w]
        else:
            witness_names = []
            
    target_name = data.get('target_name', '').strip()
    joke_content = data.get('joke_content', '').strip()
    attempt_date = data.get('attempt_date') or datetime.now().strftime('%Y-%m-%d')
    
    if not witness_names or not target_name or not joke_content:
        return jsonify({'success': False, 'message': '개그 내용, 타겟 이름, 참관 증인을 최소 1명 이상 선택해주세요.'}), 400
        
    if user.name in witness_names:
        return jsonify({'success': False, 'message': '본인을 증인으로 지정할 수 없습니다.'}), 400
        
    witness_users = []
    for w_name in witness_names:
        w_user = User.query.filter_by(name=w_name).first()
        if not w_user:
            return jsonify({'success': False, 'message': f'올바른 증인({w_name})을 선택해주세요.'}), 400
        witness_users.append(w_user)
        
    attempt = Attempt(
        user_id=user.id,
        witness_id=witness_users[0].id if witness_users else None,
        target_name=target_name,
        joke_content=joke_content,
        attempt_date=attempt_date,
        status='PENDING'
    )
    db.session.add(attempt)
    db.session.commit()
    
    for w_user in witness_users:
        att_w = AttemptWitness(
            attempt_id=attempt.id,
            witness_id=w_user.id,
            status='PENDING'
        )
        db.session.add(att_w)
    db.session.commit()
    
    return jsonify({'success': True, 'attempt': attempt.to_dict()})

@app.route('/api/attempts/pending', methods=['GET'])
def get_pending_attempts():
    """내가 증인으로 지정된 미판정 대기 항목 목록"""
    user_name = request.args.get('user_name') or session.get('user_name')
    if not user_name:
        return jsonify({'success': False, 'message': '로그인이 필요합니다.'}), 401
        
    user = User.query.filter_by(name=user_name).first()
    if not user:
        return jsonify({'success': False, 'message': '회원 정보를 찾을 수 없습니다.'}), 404
        
    pending_witnesses = AttemptWitness.query.filter_by(witness_id=user.id, status='PENDING').all()
    attempt_ids = [pw.attempt_id for pw in pending_witnesses]
    
    legacy_attempts = Attempt.query.filter_by(witness_id=user.id, status='PENDING').all()
    for la in legacy_attempts:
        if la.id not in attempt_ids:
            attempt_ids.append(la.id)
            
    pending_attempts = Attempt.query.filter(Attempt.id.in_(attempt_ids)).order_by(Attempt.created_at.desc()).all() if attempt_ids else []
    return jsonify({'success': True, 'pending_attempts': [p.to_dict() for p in pending_attempts]})

@app.route('/api/attempts/review', methods=['POST'])
def review_attempt():
    """증인의 개별 승인/반려 및 다수 증인 평균 점수 자동 산정"""
    data = request.get_json() or {}
    user_name = data.get('reviewer_name') or session.get('user_name')
    if not user_name:
        return jsonify({'success': False, 'message': '로그인이 필요합니다.'}), 401
        
    user = User.query.filter_by(name=user_name).first()
    attempt_id = data.get('attempt_id')
    action = data.get('action')
    reaction = data.get('reaction')
    
    attempt = Attempt.query.get(attempt_id)
    if not attempt:
        return jsonify({'success': False, 'message': '해당 시도 건을 찾을 수 없습니다.'}), 404
        
    att_witness = AttemptWitness.query.filter_by(attempt_id=attempt.id, witness_id=user.id).first()
    if not att_witness and attempt.witness_id == user.id:
        att_witness = AttemptWitness(attempt_id=attempt.id, witness_id=user.id, status='PENDING')
        db.session.add(att_witness)
        db.session.commit()
        
    if not att_witness:
        return jsonify({'success': False, 'message': '지정된 증인만 승인/반려할 수 있습니다.'}), 403
        
    if att_witness.status != 'PENDING':
        return jsonify({'success': False, 'message': '이미 본인이 판정을 완료한 항목입니다.'}), 400
        
    if action == 'REJECT':
        att_witness.status = 'REJECTED'
        att_witness.reaction = None
        att_witness.points = 0
        att_witness.pepper = 0
        att_witness.fine = 0
    elif action == 'APPROVE':
        att_witness.status = 'APPROVED'
        att_witness.reaction = reaction
        
        if reaction == 'SUCCESS':
            att_witness.points = 20
            att_witness.pepper = 1
            att_witness.fine = 0
        elif reaction == 'FAILURE':
            att_witness.points = 5
            att_witness.pepper = 1
            att_witness.fine = 0
        elif reaction == 'CRITICAL':
            att_witness.points = -25
            att_witness.pepper = 0
            att_witness.fine = 2000
        elif reaction == 'REDCARD':
            att_witness.points = 0
            att_witness.pepper = 0
            att_witness.fine = 10000
        else:
            return jsonify({'success': False, 'message': '올바른 반응 유형을 선택해주세요.'}), 400
    else:
        return jsonify({'success': False, 'message': '올바른 처리 동작을 선택해주세요.'}), 400
        
    att_witness.reviewed_at = datetime.utcnow()
    db.session.commit()
    
    all_witnesses = AttemptWitness.query.filter_by(attempt_id=attempt.id).all()
    if not all_witnesses:
        all_witnesses = [att_witness]
        
    rejected_count = sum(1 for w in all_witnesses if w.status == 'REJECTED')
    approved_count = sum(1 for w in all_witnesses if w.status == 'APPROVED')
    total_count = len(all_witnesses)
    
    if rejected_count > 0:
        attempt.status = 'REJECTED'
        attempt.reaction = None
        attempt.points_awarded = 0
        attempt.pepper_delta = 0
        attempt.fine_amount = 0
        attempt.reviewed_at = datetime.utcnow()
    elif approved_count == total_count:
        attempt.status = 'APPROVED'
        avg_points = round(sum(w.points for w in all_witnesses) / total_count)
        avg_pepper = round(sum(w.pepper for w in all_witnesses) / total_count)
        avg_fine = round(sum(w.fine for w in all_witnesses) / total_count)
        
        attempt.points_awarded = avg_points
        attempt.pepper_delta = avg_pepper
        attempt.fine_amount = avg_fine
        attempt.reviewed_at = datetime.utcnow()
        
        reactions = [w.reaction for w in all_witnesses if w.reaction]
        if 'REDCARD' in reactions:
            attempt.reaction = 'REDCARD'
        elif 'CRITICAL' in reactions:
            attempt.reaction = 'CRITICAL'
        elif 'SUCCESS' in reactions:
            attempt.reaction = 'SUCCESS'
        else:
            attempt.reaction = 'FAILURE'
            
    db.session.commit()
    return jsonify({'success': True, 'attempt': attempt.to_dict()})

@app.route('/api/dashboard/summary', methods=['GET'])
def dashboard_summary():
    """랭킹, 상장, 고추 개수, 벌금 총액, 날짜별 시도 내역 집계 반환"""
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
                
    ranking_list = sorted(list(stats.values()), key=lambda x: (x['total_score'], x['success_count'], -MEMBERS.index(x['name'])), reverse=True)
    
    for idx, member in enumerate(ranking_list):
        rank = idx + 1
        award_info = AWARDS.get(rank, {'title': '참여상', 'emoji': '✨', 'badge': f'{rank}등'})
        member['rank'] = rank
        member['award'] = award_info
        
    recent_attempts = Attempt.query.order_by(Attempt.created_at.desc()).limit(20).all()
    
    daily_stats = {}
    for att in approved_attempts:
        raw_date = att.attempt_date or att.created_at.strftime('%Y-%m-%d')
        date_key = raw_date[-5:] if len(raw_date) >= 10 else raw_date
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

@app.route('/api/attempts/history', methods=['GET'])
def get_attempts_history():
    """모든 제출 항목 (대기중, 승인됨, 반려됨)의 일자별 목록 및 상세 히스토리 반환"""
    attempts = Attempt.query.order_by(Attempt.attempt_date.desc(), Attempt.created_at.desc()).all()
    
    daily_groups = {}
    for att in attempts:
        d = att.attempt_date or att.created_at.strftime('%Y-%m-%d')
        if d not in daily_groups:
            daily_groups[d] = {
                'date': d,
                'attempts': []
            }
        daily_groups[d]['attempts'].append(att.to_dict())
        
    return jsonify({
        'success': True,
        'history': list(daily_groups.values()),
        'all_attempts': [a.to_dict() for a in attempts]
    })

@app.route('/api/admin/reset_scores', methods=['POST', 'GET'])
def reset_scores():
    """모든 개그 시도 내역 삭제 (초기 0점 상태 리셋)"""
    with app.app_context():
        AttemptWitness.query.delete()
        Attempt.query.delete()
        db.session.commit()
    return jsonify({'success': True, 'message': '모든 시도 내역이 리셋되어 6명 회원의 초기 점수, 고추, 벌금이 0으로 변경되었습니다.'})

@app.route('/api/admin/reset_all', methods=['POST', 'GET'])
def reset_all_data():
    """모든 개그 시도 및 서약서 데이터 삭제 (완전 깨끗한 초기화)"""
    with app.app_context():
        AttemptWitness.query.delete()
        Attempt.query.delete()
        Pledge.query.delete()
        db.session.commit()
    return jsonify({'success': True, 'message': '모든 개그 시도 및 서약서 데이터가 깨끗이 초기화되었습니다.'})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)

