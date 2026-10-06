# aro-study

HR 스터디 모임의 주차별 기록·회비 관리·의견 사이트. GitHub Pages 공개: https://aro-deeply.github.io/aro-study/
설계 원문은 `SPEC.md`. 이 파일은 작업 규칙 요약이다.

## 구조

- 정적 HTML/CSS/JS만 사용. 프레임워크·번들러·npm 빌드 금지. 사용자가 파일을 직접 열어 고칠 수 있어야 한다.
- 백엔드는 Firebase(Firestore + Authentication, CDN 모듈 SDK 12.x). 멤버는 비밀번호 없이 익명 로그인(자동, 2026-09-10 변경)하고 "이름 선택"으로 작성자를 정한다. 총무만 admin.html에서 총무 계정(`ADMIN_EMAIL`)으로 로그인하고, 관리 컬렉션 쓰기는 규칙에서 총무 계정만 허용한다. 의견·메모·자료 문서에는 `uid`(접속 토큰)를 넣어 본인만 수정·삭제.
- `assets/app.js` 인증·이름 선택·상단 바(HR STUDY · 모임 · 회비 · 이름)·이니셜 동그라미(`avatar`)·Firestore 헬퍼·유틸 / `assets/site.js` 첫 화면·회비 화면 공용 데이터 불러오기(`loadAll`)와 "내가 할 일"(`tasksFor`), `?demo=1` 예시 데이터 / `assets/schedule.js` 정기 모임 날짜(n번째 요일)·발제 순서 계산·렌더, `settings` 읽기 / `assets/fund.js` 회비(회비 설정·납부·잔액·보전·월별 가용 금액) 계산·렌더 / `assets/settle.js` 추가 비용 n분의 1 정산 계산, 주차 페이지 비용 패널(`renderCost`, `mountCost`) / `assets/reader.js` 하이라이트·메모·의견 / `assets/resources.js` 관련 자료(링크·메모 목록) / `assets/style.css` 공통 스타일.
- `index.html` 첫 화면(한 페이지: 머리띠의 다음 모임 카드, 내가 할 일, 앞으로의 발제, 지난 모임 기록, 회비 요약) / `fund.html` 회비 자세히(남은 회비, 월별 예산, 납부, 계좌, 회비에서 쓴 돈) / `admin.html` 총무 입력 / `weeks/<YYYY-MM-DD>/index.html` 주차 페이지 / `templates/week.html` 주차 원본 / `demo/` Firestore 없는 화면 예시(`demo/week.html` 주차 예시, `demo/index.html` 계산 테스트용, `index.html?demo=1`, `fund.html?demo=1`).
- `firestore.rules`, `storage.rules`는 콘솔에 붙여 넣는 용도. Firebase CLI 배포는 하지 않는다. 관련 자료 파일은 Firebase Storage(`resources/<세션>/`)에 올린다.

## 데이터 원칙

- 정적 HTML에 두는 것: 제목, 날짜, 그날 다룬 내용 요약, 브리프 링크, 다음 모임 계획.
- 멤버 이름·금액·의견·참석자·발제 순서·하이라이트는 전부 Firestore(`members`, `settings`, `terms`, `dues`, `sessions`, `expenses`, `payments`, `comments`, `annotations`, `resources`). HTML에 하드코딩하지 않는다.
- 운영 방식(2026-09-09): 회비를 걷어 회비에서 지출(`expenses.source: "fund"`, 기본값). 회비 밖 추가 비용만 `source: "split"`으로 참석자 n분의 1. `payments.from`이 `"fund"`면 회비에서 개인에게 보전한 송금. 자세한 것은 SPEC 3-1.
- 2026-09-10 추가: 정기 모임은 매월 둘째 수요일(`settings/meeting`), 발제는 `settings/rotation` 순서대로 매월 한 명(세션 `presenter`가 있으면 우선, 화면에는 "이름 님"), 회비는 `terms.months`로 나눈 월별 가용 금액과 이월(월 배정 100원 단위 올림, 마지막 달이 적음). n분의 1은 100원 단위 올림이고 차액은 회비 적립(`computeSettlement().surplus` → `computeFund({ splitSurplus })`). SPEC 3-1, 3-2.
- 2026-09-10 추가 2: 공지는 `settings/notice`(`{ text, until }`). 내용이 있고 until이 지나지 않았으면 첫 화면 `#note` 배너로만 표시, 없으면 아무것도 안 보인다. 입력은 admin 일정·발제 탭. SPEC 참고.
- 카톡 공유 썸네일: `assets/og-image.png`(1200x630)와 각 페이지 head의 Open Graph 태그. 주차 템플릿은 `{{TITLE}}` 등이 OG 태그에도 치환된다. 디자인 원본과 재렌더 방법은 `scripts/og-image.html` 주석 참고. 이미지 교체 후에는 카카오 공유 디버거에서 캐시 초기화가 필요하다.
- 운영 데이터를 한 번에 넣을 때는 `scripts/setup.mjs <json>`(JSON은 저장소 밖 `../work/aro-study/`에 둔다, 총무 비밀번호는 실행 중 입력). 회비 납부(`dues`)와 정산 송금(`payments`)도 같은 JSON으로 넣을 수 있다(2026-09-11, 형식은 파일 상단 주석).
- 세션 ID = 모임 날짜(YYYY-MM-DD) = 주차 폴더명.
- 미납 판정(2026-09-11 확정): 회비 사용 기간(`terms.start`) 전이라도 납부 기록이 없으면 미납으로 센다. 회비는 기간 시작 전 달(2026년 9월)에 미리 걷기로 했기 때문. "기간 전에는 미납 아님"으로 바꾸지 않는다.
- Firestore 쿼리는 복합 인덱스가 필요 없게 `where` 하나만 쓰고 정렬은 클라이언트에서 한다. 인덱스 오류가 나면 콘솔 링크를 사용자에게 안내한다.

## 새 주차 기록

`.claude/skills/aro-study-week/SKILL.md` 순서를 따른다. 보조 도구: `scripts/new_week.py`(템플릿 복제), `scripts/check_week.py`(규칙 점검), `scripts/session.mjs`(Firestore 세션 등록, 총무 비밀번호는 실행 중 입력).

## 디자인 (2026-10-07 재디자인)

- 구조는 Luma(이벤트 앱) 실제 화면 기준, 회비 패널은 Cal.com 기준(Refero 레퍼런스). 색은 '블러시 머리띠(#F5E8E4) + 코랄 포인트(#B65845)'로 사용자가 골랐다. 토큰은 `assets/style.css`의 `:root`.
- 색 역할: 코랄은 제목 윗줄, 다음 모임 카드 머리, 진행 막대, 할 일 상자 테두리에만. 버튼은 잉크색. 미납은 잉크 글씨 + 빨간 점. 검정+라임(aro-career.com 양식)은 쓰지 않는다.
- 카드·그림자·아이콘은 누를 수 있는 단위나 정보 줄에만. 장식용 그라데이션, 이모지 아이콘, 의미 없는 배지 금지.
- 첫 화면에는 탭과 토글이 없다. 위에서 아래로: 머리띠(제목 + 다음 모임 카드: 날짜·요일·시간·장소·발제) / 내가 할 일(있을 때만) / 앞으로의 발제 / 지난 모임 기록(3개, 나머지는 "모두 보기") / 회비 요약. 상단 메뉴는 "모임 · 회비" 두 개.
- 휴대폰 순서는 `.body > .col { display: contents }` + `data-m style="--o:N"`으로 정한다(같은 내용을 두 번 넣지 않기 위해).

## 화면 문구 원칙 (2026-09-10, 2026-10-07 갱신)

- 같은 단어·같은 정보를 한 화면에 두 번 보여주지 않는다. 예: 날짜 배지 옆에 같은 날짜 글자, 값 아래 "장소"·"발제" 같은 항목 이름 줄, 위 카드 합계와 같은 합계 줄, 받는 사람 이름과 계좌 예금주 이름 반복.
- "확정" 같은 상태 단어는 쓰지 않는다. 시간·장소를 그냥 보여주면 된다.
- 회계 용어는 풀어 쓴다: 정산 적립 -> "추가 비용 잔돈", 보전 -> "회비에서 돌려받음/돌려받을 예정", 대신 결제 -> "OO 먼저 결제". 월별 가용 금액 -> "월별 예산"(표는 지난 달과 이번 달까지만, 앞으로는 한 줄. "회비를 모두 걷었을 때 기준"과 아직 걷지 못한 금액을 함께 적는다. 남은 회비보다 큰 숫자가 표에 나오지 않게).
- 그리드·플렉스 아이템 안에 말줄임(`.clip`) 텍스트를 둘 때는 아이템에 `min-width:0`이 있는지 확인한다(카드가 화면 밖으로 밀리는 버그의 원인).
- 정산 사람 줄(2026-09-11, 유지): 송금 기록까지 반영한 현재 상태만. "보낼 돈 N원" / "받을 돈 N원(N명에게서)" / "완료 · 날짜". 직접 결제한 사람만 이름 아래 "낸 돈 N원". 보낼 곳이 한 사람이면 "보낼 돈은 모두 OO에게 보냅니다." 한 줄로 쓰고 줄마다 반복하지 않는다.
- 클래스 이름 주의: 관리 화면용 `.sub`(아래 여백 22px)와 겹치므로 패널 안 보조 글씨는 `.pr .sub`로만 쓴다.
- 줄바꿈(2026-09-11): `body`는 `word-break:keep-all; overflow-wrap:anywhere`(한국어 단어 중간에서 끊지 않고, 긴 URL만 강제로 끊음). 구분점 ` · `는 앞에 nbsp(U+00A0, 점 앞의 공백 자리)를 붙여 점이 줄 머리에 오지 않게 한다(JS 템플릿·HTML 공통). "참석자 간 협의", "이 기간 지출 63,500원"처럼 한 덩어리로 읽혀야 하는 짧은 구절은 안쪽 공백도 nbsp. 짧은 인라인 링크(`.sub a`, `.secsub a`, `.empty a`, `.st-rule a`)는 nowrap. 관련 자료의 도메인(`.res .ttl .dom`)은 제목 아래 줄.

## 하지 말 것

- em dash, 이모지, 세리프·명조 폰트. 문장부호는 쉼표·괄호·콜론.
- 비밀번호 등 비밀을 저장소·문서·대화 기록용 파일에 넣지 않는다. Firebase 설정값(apiKey 등)은 공개해도 되는 값이라 예외.
- 디자인 토큰(색·폰트·크기) 임의 변경. `assets/style.css`의 `:root` 변수(2026-10-07 재디자인 값)를 유지한다. 바꿀 때는 사용자에게 먼저 묻는다.
- 실제 멤버 데이터를 테스트에 쓰지 않는다. 테스트는 `demo/`의 가명 데이터로 한다.

## 로컬 확인과 테스트

- 미리보기: 저장소 루트에서 `python -m http.server 8770` 후 `http://127.0.0.1:8770/`. ES 모듈이라 파일 더블클릭(file://)으로는 동작하지 않는다.
- 자동 테스트(Playwright 필요): `python scripts/tests/test_settle.py`, `python scripts/tests/test_reader.py` (기본 URL은 로컬 서버의 demo 페이지).
- 화면 예시: `http://127.0.0.1:8770/?demo=1`, `fund.html?demo=1`, `demo/week.html` (가명 데이터, 멤버B로 본 화면).
- 커밋 메시지: `week: <날짜> <제목>` / 도구·화면 수정은 `site: ...` / 문서는 `docs: ...`.
- 푸시 후 1~2분 뒤 공개 주소에서 확인하고 URL을 보고한다.
