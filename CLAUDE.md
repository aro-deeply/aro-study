# aro-study

HR 스터디 모임의 주차별 기록·회비 관리·의견 사이트. GitHub Pages 공개: https://aro-deeply.github.io/aro-study/
설계 원문은 `SPEC.md`. 이 파일은 작업 규칙 요약이다.

## 구조

- 정적 HTML/CSS/JS만 사용. 프레임워크·번들러·npm 빌드 금지. 사용자가 파일을 직접 열어 고칠 수 있어야 한다.
- 백엔드는 Firebase(Firestore + Authentication, CDN 모듈 SDK 12.x). 공용 계정 하나로 로그인하고 "이름 선택"으로 작성자를 정한다.
- `assets/app.js` 인증·이름 선택·상단 바·Firestore 헬퍼·유틸 / `assets/fund.js` 회비(기수·납부·잔액·보전) 계산·렌더 / `assets/settle.js` 추가 비용 n분의 1 정산 계산·렌더, 주차 페이지 비용 섹션 마운트 / `assets/reader.js` 하이라이트·메모·의견 / `assets/style.css` 공통 스타일(aro-briefs 톤).
- `index.html` 회비 현황·목록·추가 비용 정산 / `admin.html` 총무 입력 / `weeks/<YYYY-MM-DD>/index.html` 주차 페이지 / `templates/week.html` 주차 원본 / `demo/` 로그인 없는 화면 예시.
- `firestore.rules`는 콘솔에 붙여 넣는 용도. Firebase CLI 배포는 하지 않는다.

## 데이터 원칙

- 정적 HTML에 두는 것: 제목, 날짜, 그날 다룬 내용 요약, 브리프 링크, 다음 모임 계획.
- 멤버 이름·금액·의견·참석자·하이라이트는 전부 Firestore(`members`, `terms`, `dues`, `sessions`, `expenses`, `payments`, `comments`, `annotations`). HTML에 하드코딩하지 않는다.
- 운영 방식(2026-09-09): 기수별 회비를 걷어 회비에서 지출(`expenses.source: "fund"`, 기본값). 회비 밖 추가 비용만 `source: "split"`으로 참석자 n분의 1. `payments.from`이 `"fund"`면 회비에서 개인에게 보전한 송금. 자세한 것은 SPEC 3-1.
- 세션 ID = 모임 날짜(YYYY-MM-DD) = 주차 폴더명.
- Firestore 쿼리는 복합 인덱스가 필요 없게 `where` 하나만 쓰고 정렬은 클라이언트에서 한다. 인덱스 오류가 나면 콘솔 링크를 사용자에게 안내한다.

## 새 주차 기록

`.claude/skills/aro-study-week/SKILL.md` 순서를 따른다. 보조 도구: `scripts/new_week.py`(템플릿 복제), `scripts/check_week.py`(규칙 점검), `scripts/session.mjs`(Firestore 세션 등록, 비밀번호는 실행 중 입력).

## 하지 말 것

- em dash, 이모지, 세리프·명조 폰트. 문장부호는 쉼표·괄호·콜론.
- 비밀번호 등 비밀을 저장소·문서·대화 기록용 파일에 넣지 않는다. Firebase 설정값(apiKey 등)은 공개해도 되는 값이라 예외.
- 디자인 토큰(색·폰트·크기) 임의 변경. `assets/style.css`의 `:root` 변수를 유지한다.
- 실제 멤버 데이터를 테스트에 쓰지 않는다. 테스트는 `demo/`의 가명 데이터로 한다.

## 로컬 확인과 테스트

- 미리보기: 저장소 루트에서 `python -m http.server 8770` 후 `http://127.0.0.1:8770/`. ES 모듈이라 파일 더블클릭(file://)으로는 동작하지 않는다.
- 자동 테스트(Playwright 필요): `python scripts/tests/test_settle.py`, `python scripts/tests/test_reader.py` (기본 URL은 로컬 서버의 demo 페이지).
- 커밋 메시지: `week: <날짜> <제목>` / 도구·화면 수정은 `site: ...` / 문서는 `docs: ...`.
- 푸시 후 1~2분 뒤 공개 주소에서 확인하고 URL을 보고한다.
