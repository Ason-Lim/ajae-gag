from datetime import datetime
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

# 6명의 회원 고정 목록
MEMBERS = ['강득헌', '오용택', '정상훈', '지정수', '채연석', '임형채']

class User(db.Model):
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), unique=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # 관계 설정
    pledge = db.relationship('Pledge', backref='user', uselist=False, lazy=True)
    attempts = db.relationship('Attempt', foreign_keys='Attempt.user_id', backref='author', lazy=True)
    witnessed_attempts = db.relationship('Attempt', foreign_keys='Attempt.witness_id', backref='witness', lazy=True)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'has_pledged': self.pledge is not None
        }

class Pledge(db.Model):
    __tablename__ = 'pledges'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, unique=True)
    agreed_at = db.Column(db.DateTime, default=datetime.utcnow)
    signature_data = db.Column(db.Text, nullable=False)  # Base64 이미지 데이터
    agreed_date_str = db.Column(db.String(50), nullable=False)  # 예: "2026년 9월 3일"

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'user_name': self.user.name if self.user else '',
            'agreed_at': self.agreed_at.isoformat(),
            'agreed_date_str': self.agreed_date_str,
            'signature_data': self.signature_data
        }

class Attempt(db.Model):
    __tablename__ = 'attempts'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    witness_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)  # 하위 호환용 (단일 증인)
    target_name = db.Column(db.String(50), nullable=False)
    joke_content = db.Column(db.Text, nullable=False)
    attempt_date = db.Column(db.String(20), nullable=True)  # 개그 시도 선택 날짜 (YYYY-MM-DD)
    
    # 처리 상태: PENDING (대기), APPROVED (승인됨), REJECTED (반려됨)
    status = db.Column(db.String(20), default='PENDING', nullable=False)
    
    # 대표 반응 종류: SUCCESS (찐웃음), FAILURE (무반응), CRITICAL (불쾌감), REDCARD (레드카드)
    reaction = db.Column(db.String(20), nullable=True)
    
    # 최종 평균 점수 / 고추 / 벌금 집계
    points_awarded = db.Column(db.Integer, default=0)
    pepper_delta = db.Column(db.Integer, default=0)
    fine_amount = db.Column(db.Integer, default=0)
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    reviewed_at = db.Column(db.DateTime, nullable=True)

    # 다수 증인 관계 설정
    witnesses = db.relationship('AttemptWitness', backref='attempt', cascade='all, delete-orphan', lazy=True)

    def to_dict(self):
        att_date = self.attempt_date or self.created_at.strftime('%Y-%m-%d')
        w_list = [w.to_dict() for w in self.witnesses] if self.witnesses else []
        
        # 이전 단일 증인 레거시 항목 호환 처리
        if not w_list and self.witness_id:
            w_list = [{
                'id': 0,
                'attempt_id': self.id,
                'witness_id': self.witness_id,
                'witness_name': self.witness.name if self.witness else '',
                'status': self.status,
                'reaction': self.reaction,
                'points': self.points_awarded,
                'pepper': self.pepper_delta,
                'fine': self.fine_amount,
                'reviewed_at': self.reviewed_at.isoformat() if self.reviewed_at else None
            }]

        witness_names = [w['witness_name'] for w in w_list if w['witness_name']]
        witness_names_str = ", ".join(witness_names) if witness_names else (self.witness.name if self.witness else '')
        
        completed_witnesses = [w for w in w_list if w['status'] in ('APPROVED', 'REJECTED')]
        
        return {
            'id': self.id,
            'user_id': self.user_id,
            'author_name': self.author.name if self.author else '',
            'witness_id': self.witness_id,
            'witness_name': witness_names_str,
            'witness_names': witness_names,
            'witnesses_detail': w_list,
            'total_witness_count': len(w_list),
            'completed_witness_count': len(completed_witnesses),
            'target_name': self.target_name,
            'joke_content': self.joke_content,
            'attempt_date': att_date,
            'status': self.status,
            'reaction': self.reaction,
            'points_awarded': self.points_awarded,
            'pepper_delta': self.pepper_delta,
            'fine_amount': self.fine_amount,
            'created_at': self.created_at.isoformat(),
            'created_date_str': att_date,
            'reviewed_at': self.reviewed_at.isoformat() if self.reviewed_at else None
        }

class AttemptWitness(db.Model):
    __tablename__ = 'attempt_witnesses'
    
    id = db.Column(db.Integer, primary_key=True)
    attempt_id = db.Column(db.Integer, db.ForeignKey('attempts.id'), nullable=False)
    witness_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    
    # 상태: PENDING (대기), APPROVED (승인), REJECTED (반려)
    status = db.Column(db.String(20), default='PENDING', nullable=False)
    
    # 개별 증인 판정 리액션
    reaction = db.Column(db.String(20), nullable=True)
    points = db.Column(db.Integer, default=0)
    pepper = db.Column(db.Integer, default=0)
    fine = db.Column(db.Integer, default=0)
    
    reviewed_at = db.Column(db.DateTime, nullable=True)

    witness = db.relationship('User', foreign_keys=[witness_id])

    def to_dict(self):
        return {
            'id': self.id,
            'attempt_id': self.attempt_id,
            'witness_id': self.witness_id,
            'witness_name': self.witness.name if self.witness else '',
            'status': self.status,
            'reaction': self.reaction,
            'points': self.points,
            'pepper': self.pepper,
            'fine': self.fine,
            'reviewed_at': self.reviewed_at.isoformat() if self.reviewed_at else None
        }

