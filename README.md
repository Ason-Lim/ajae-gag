# 🌶️ 아재개그 서바이벌 모바일 웹 대시보드 (Dad Joke Survival Mobile Web Dashboard)

카카오톡 인앱 브라우저 및 모바일 환경에 특화된 **아재개그 서바이벌 대시보드** 애플리케이션입니다.  
사내/지인 6인 회원(`강득헌`, `오용택`, `정상훈`, `지정수`, `채연석`, `임형채`)이 평일 동안 여성을 대상으로 진행하는 개그 시도의 점수, 고추 아이콘(🌶️), 벌금을 실시간으로 집계 및 시각화합니다.

---

## 📁 프로젝트 디렉토리 구조 (Directory Structure)

```text
ajae-gag/
├── app.py                  # Flask 메인 애플리케이션 (RESTful API & SQLAlchemy 호환)
├── models.py               # 데이터베이스 모델 (User, Pledge, Attempt)
├── requirements.txt        # Render 배포 dependencies (Flask, psycopg2-binary, gunicorn 등)
├── Procfile                # Render Web Service 실행 가이드 (gunicorn app:app)
├── README.md               # 프로젝트 설명 및 배포 가이드 문서
├── static/
│   ├── css/
│   │   └── style.css       # 카카오톡 인앱 브라우저 호환 뷰포트 & 다크 글래스모피즘 CSS
│   └── js/
│       └── app.js          # HTML5 Canvas 서명패드, 랭킹 & 차트, 대기열 실시간 JS 로직
└── templates/
    └── index.html          # 모바일 반응형 SPA 싱글 페이지 HTML5 템플릿
```

---

## 🎮 주요 기능 및 스코어링 규칙 (Scoring Rules)

1. **비밀 유지 및 참여 동의서 (1회 필수)**:
   - 최초 접속 시 6인 회원 중 자신의 이름을 선택하고 전문(제1조~제5조)에 서약.
   - Touch/Mouse 지원 HTML5 Digital Canvas에 직접 서명 완료 후 진입.
   - 서약 날짜(자동 생성)와 서명 원본 이미지는 `벌금/서약서` 탭에서 상시 열람 가능.

2. **행동 기반 스코어링 로직**:
   - **시도(참여)**: 증인 승인 시 기본 **+5점** 및 **고추 아이콘(🌶️) 1개** 부여.
   - **찐웃음 (성공)**: 추가 **+15점** (총 **+20점**, 🌶️ 1개).
   - **무반응 (실패)**: 추가 점수 없음 (총 **+5점**, 🌶️ 1개).
   - **불쾌감 (치명타)**: **-30점** (총 **-25점**), 고추 아이콘 차감/0, **벌금 2,000원** 자동 누적.
   - **레드카드 (외모/성적 비하)**: 해당 시도 점수 전면 무효화 (**0점**), **즉각 벌금 10,000원** 누적.

3. **실시간 1~6등 랭킹 & 특별 상장 매칭**:
   - 🥇 **1등**: 고래세우상 🐳
   - 🥈 **2등**: 조지보쌈상 🥩
   - 🥉 **3등**: 또라애로상 🌀
   - 4등: 추파춥스상 🍭
   - 5등: 철판상 🍳
   - 6등: 미진밉상 👿

4. **현장 증인 승인 워크플로우**:
   - 시도자가 내용/타겟/증인을 지정하여 제출하면, 해당 증인의 하단 내비게이션 `증인승인` 탭에 **알림 뱃지**와 **대기열**이 활성화됨.
   - 증인의 [승인] 및 타겟 리액션 선택 완료 시에만 DB와 랭킹에 즉시 반영됨.

---

## 💻 로컬 환경 실행 가이드 (Local Quickstart)

1. **의존성 패키지 설치**:
   ```bash
   pip install -r requirements.txt
   ```

2. **애플리케이션 구동**:
   ```bash
   python app.py
   ```
   - 기본적으로 SQLite (`sqlite:///ajae_gag.db`)로 자도 fallback 되어 즉시 작동합니다.
   - 브라우저에서 `http://localhost:5000` 접속 후 사용.

---

## 🚀 GitHub 업로드 & Render 배포 가이드 (Deployment Guide)

### 1단계: GitHub 저장소 업로드
```bash
git init
git add .
git commit -m "Initial commit: Dad Joke Survival Mobile Web Dashboard"
git branch -M main
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/ajae-gag.git
git push -u origin main
```

### 2단계: Render PostgreSQL 데이터베이스 생성
1. [Render Dashboard](https://dashboard.render.com/) 접속 후 **New +** -> **PostgreSQL** 선택.
2. Database Name (예: `ajae-gag-db`) 설정 후 **Create Database** 클릭.
3. 생성 완료 후 **Internal Database URL** 또는 **External Database URL** 복사.

### 3단계: Render Web Service 배포
1. Render Dashboard에서 **New +** -> **Web Service** 선택.
2. 본인의 GitHub 저장소 (`ajae-gag`) 연결.
3. 배포 설정 입력:
   - **Name**: `ajae-gag-survival`
   - **Environment**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `gunicorn app:app`
4. **Environment Variables (환경 변수)** 추가:
   - `DATABASE_URL`: 2단계에서 복사한 PostgreSQL DB URL 붙여넣기  
     *(앱 내부에서 `postgres://` -> `postgresql://` 자동 변환 처리됨)*
   - `SECRET_KEY`: 임의의 비밀 키값 설정
5. **Create Web Service** 클릭! 배포 완료 후 제공되는 Render URL로 모바일 또는 카카오톡에서 접속.
