# aro-study

HR 스터디 모임의 주차별 기록, 회비 관리(납부·잔액), 멤버 의견을 모아 두는 사이트.
GitHub Pages(정적 HTML) + Firebase(Firestore, Authentication)로 동작하며 빌드 도구가 없다.

- 사이트: https://aro-deeply.github.io/aro-study/
- 화면 예시(가명 데이터): https://aro-deeply.github.io/aro-study/?demo=1 (첫 화면), `fund.html?demo=1` (회비), `demo/week.html` (주차 페이지)
- 총무 관리: https://aro-deeply.github.io/aro-study/admin.html

## 처음 쓰기

1. 사이트를 연다. 멤버는 비밀번호가 없다(Firebase 익명 로그인이 자동으로 된다). 총무만 관리 화면에서 비밀번호를 한 번 넣는다.
2. "이름 선택"에서 본인을 고른다. 상단 오른쪽 이름을 누르면 바꿀 수 있다.
3. 핸드폰에서는 브라우저 메뉴의 "홈 화면에 추가"로 앱처럼 쓸 수 있다.

## 총무가 하는 일

- 최초 1회: Firebase 콘솔 > Firestore Database > 규칙 탭에 `firestore.rules`, Storage > 규칙 탭에 `storage.rules` 내용을 붙여 넣고 게시한다. Authentication > Sign-in method 에서 "익명"과 "이메일/비밀번호"를 켜고 총무 계정을 만든다.
- admin.html에서 멤버 등록(본인은 "총무" 체크), 회비 회비 설정 만들기와 납부 처리, 모임 세션 생성, 지출 입력(영수증 보고 바로, 기본은 "회비에서"), 송금 기록.
- 모임 후 기록 페이지는 Claude Code에서 `.claude/skills/aro-study-week/SKILL.md` 절차로 만든다. 메모를 주면 `weeks/<날짜>/index.html`을 만들고 세션을 등록하고 푸시한다.

## 화면

- 2026-10-07 재디자인: 탭 없이 한 페이지로 읽히게 바꿨다. 상단 메뉴는 "모임 · 회비" 두 개.
- `index.html`(첫 화면): 머리띠의 다음 모임 카드(날짜·요일·시간·장소·발제), 내가 할 일(보낼 돈·미납 회비가 있을 때만, 계좌번호 복사), 앞으로의 발제, 지난 모임(최근 3개 + 모두 보기), 회비 요약(남은 회비, 이번 달 예산, 아직 안 낸 사람).
- `fund.html`(회비): 남은 회비 = 걷은 회비 + 정산 후 남은 돈 - 쓴 돈, 월별 예산(지난 달과 이번 달, 앞으로는 한 줄), 납부 현황, 회비 계좌, 회비에서 쓴 돈 목록, 회비에서 돌려줄 돈.
- `weeks/<날짜>/`: 오른쪽(휴대폰은 위) 정보 칸(날짜, 발제, 참석), 이날의 내용과 다음 모임, 관련 자료(올리기는 접혀 있음), 비용(회비에서 쓴 돈, 추가 비용과 사람별 정산), 의견(답글 1단계), 본문 하이라이트·메모(내 것만/전체, 메모 복사).
- `admin.html`: 총무 권한 이름 + 총무 비밀번호로만 열린다. 관리 데이터 쓰기는 Firestore 규칙에서 총무 계정만 허용한다.

## 회비와 정산 규칙

- 정기 모임은 매월 둘째 수요일(admin 일정·발제 탭에서 변경), 발제는 정한 순서대로 매월 한 명(세션에 따로 정하면 그것이 우선).
- 기본: 1인 회비를 걷어 총무가 보관하고, 모임 비용은 회비에서 쓴다. 잔액 = 납부 합계 - 회비 지출 합계. 회비 총액을 사용 개월 수로 나눈 월별 가용 금액을 표시하고 덜 쓴 금액은 이월한다. 회비 금액·기간·개월 수·계좌·대상은 admin 회비 탭에서 바꿀 수 있다.
- 총무가 아닌 사람이 회비 지출을 대신 결제하면 "회비에서 보전할 돈"에 뜨고, 총무가 보낸 뒤 송금 기록(보낸 사람 "회비")을 남기면 사라진다.
- 추가 비용(재원 "참석자 n분의 1")만 개인 정산: 분배 대상이 같은 항목을 합쳐 균등, 1인 부담은 100원 단위 올림, 올림으로 더 걷히는 차액은 회비로 적립(총무가 받아 회비 수입으로 잡힘). 차액은 낸 금액에서 부담액을 뺀 값이며 +는 받을 돈, -는 낼 돈. 송금 기록은 남은 차액에 반영된다. 검산(소계 합, 부담액 합 = 총액 + 적립액, 중복)은 화면에서 실제로 수행한다.
- 월별 가용 금액의 월 배정액은 100원 단위 올림이고 마지막 달이 그만큼 적다.

## 폴더

```
index.html  fund.html  admin.html  manifest.json  firestore.rules  storage.rules  SPEC.md  CLAUDE.md
assets/   style.css  app.js  site.js  schedule.js  fund.js  settle.js  reader.js  resources.js  firebase-config.js  icons/
weeks/    YYYY-MM-DD/index.html
templates/week.html   demo/week.html  demo/index.html(계산 테스트)  demo/sample.js
scripts/  new_week.py  check_week.py  session.mjs  setup.mjs  lib/firestore.mjs  tests/
.claude/skills/aro-study-week/SKILL.md
```

## 개발 메모

- 로컬 확인: `python -m http.server 8770` 후 `http://127.0.0.1:8770/` (file:// 로는 ES 모듈이 동작하지 않음).
- 테스트: Playwright 설치 후 `python scripts/tests/test_settle.py`, `python scripts/tests/test_reader.py`.
- 멤버 비밀번호가 없으므로 사이트 주소는 멤버에게만 알린다. 총무 비밀번호 등 비밀은 저장소 어디에도 두지 않는다. 노출됐다면 Firebase 콘솔 > Authentication에서 바꾼다.
