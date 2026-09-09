# aro-study

HR 스터디 모임의 주차별 기록, 회비 관리(납부·잔액), 멤버 의견을 모아 두는 사이트.
GitHub Pages(정적 HTML) + Firebase(Firestore, Authentication)로 동작하며 빌드 도구가 없다.

- 사이트: https://aro-deeply.github.io/aro-study/
- 화면 예시(로그인 없음, 가명 데이터): https://aro-deeply.github.io/aro-study/demo/
- 총무 관리: https://aro-deeply.github.io/aro-study/admin.html

## 처음 쓰기

1. 사이트를 열고 공용 비밀번호를 입력한다. 이후 같은 기기에서는 다시 묻지 않는다.
2. "이름 선택"에서 본인을 고른다. 상단 오른쪽 이름을 누르면 바꿀 수 있다.
3. 핸드폰에서는 브라우저 메뉴의 "홈 화면에 추가"로 앱처럼 쓸 수 있다.

## 총무가 하는 일

- 최초 1회: Firebase 콘솔 > Firestore Database > 규칙 탭에 `firestore.rules` 내용을 붙여 넣고 게시한다.
- admin.html에서 멤버 등록(본인은 "총무" 체크), 회비 회비 설정 만들기와 납부 처리, 모임 세션 생성, 지출 입력(영수증 보고 바로, 기본은 "회비에서"), 송금 기록.
- 모임 후 기록 페이지는 Claude Code에서 `.claude/skills/aro-study-week/SKILL.md` 절차로 만든다. 메모를 주면 `weeks/<날짜>/index.html`을 만들고 세션을 등록하고 푸시한다.

## 화면

- `index.html`: 회비 잔액·미납·다음 모임 요약, 회비 현황(회비 설정, 멤버별 납부 표, 보전할 돈), 주차 목록(최신순), 추가 비용 정산(있을 때만).
- `weeks/<날짜>/`: 이날의 내용, 다음 모임 계획, 비용(이 회차 회비 지출과 현재 잔액, 추가 비용이 있으면 n분의 1 정산서), 의견(답글 1단계), 본문 하이라이트·메모(내 것만/전체, AI용 복사).
- `admin.html`: 총무 권한 이름으로 들어왔을 때만 열린다.

## 회비와 정산 규칙

- 기본: 1인 회비를 걷어 총무가 보관하고, 모임 비용은 회비에서 쓴다. 잔액 = 납부 합계 - 회비 지출 합계. 회비 금액·기간·대상은 admin 회비 탭에서 바꿀 수 있다.
- 총무가 아닌 사람이 회비 지출을 대신 결제하면 "회비에서 보전할 돈"에 뜨고, 총무가 보낸 뒤 송금 기록(보낸 사람 "회비")을 남기면 사라진다.
- 추가 비용(재원 "참석자 n분의 1")만 개인 정산: 분배 대상에게 균등, 1인 부담은 100원 단위 내림, 뒷자리는 총무 부담. 차액은 낸 금액에서 부담액을 뺀 값이며 +는 받을 돈, -는 낼 돈. 송금 기록은 남은 차액에 반영된다. 검산(소계 합, 부담액 합, 중복)은 화면에서 실제로 수행한다.

## 폴더

```
index.html  admin.html  manifest.json  firestore.rules  SPEC.md  CLAUDE.md
assets/   style.css  app.js  fund.js  settle.js  reader.js  firebase-config.js  icons/
weeks/    YYYY-MM-DD/index.html
templates/week.html   demo/index.html
scripts/  new_week.py  check_week.py  session.mjs  tests/
.claude/skills/aro-study-week/SKILL.md
```

## 개발 메모

- 로컬 확인: `python -m http.server 8770` 후 `http://127.0.0.1:8770/` (file:// 로는 ES 모듈이 동작하지 않음).
- 테스트: Playwright 설치 후 `python scripts/tests/test_settle.py`, `python scripts/tests/test_reader.py`.
- 비밀번호는 저장소 어디에도 두지 않는다. 노출됐다면 Firebase 콘솔 > Authentication에서 바꾼다.
