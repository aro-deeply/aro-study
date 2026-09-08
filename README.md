# aro-study

HR 스터디 모임의 주차별 기록, 비용 정산, 멤버 의견을 모아 두는 사이트.
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
- admin.html에서 멤버 등록(본인은 "총무" 체크), 모임 세션 생성, 지출 입력(영수증 보고 바로), 정산 완료 기록.
- 모임 후 기록 페이지는 Claude Code에서 `.claude/skills/aro-study-week/SKILL.md` 절차로 만든다. 메모를 주면 `weeks/<날짜>/index.html`을 만들고 세션을 등록하고 푸시한다.

## 화면

- `index.html`: 주차 목록(최신순), 이번 달 지출·미납 인원·다음 모임 요약, 멤버별 누적 정산과 보낼 돈.
- `weeks/<날짜>/`: 이날의 내용, 다음 모임 계획, 정산(총 지출, 정산 기준, 1인 부담, 카테고리, 상세 내역, 보낼 돈, 검산), 의견(답글 1단계), 본문 하이라이트·메모(내 것만/전체, AI용 복사).
- `admin.html`: 총무 권한 이름으로 들어왔을 때만 열린다.

## 정산 규칙

항목별 분배 대상에게 균등 분배, 1인 부담은 100원 단위 내림, 뒷자리는 총무 부담. 차액은 낸 금액에서 부담액을 뺀 값이며 +는 받을 돈, -는 낼 돈. 정산 완료 기록은 남은 차액에 반영된다. 검산(소계 합, 부담액 합, 중복)은 화면에서 실제로 수행한다.

## 폴더

```
index.html  admin.html  manifest.json  firestore.rules  SPEC.md  CLAUDE.md
assets/   style.css  app.js  settle.js  reader.js  firebase-config.js  icons/
weeks/    YYYY-MM-DD/index.html
templates/week.html   demo/index.html
scripts/  new_week.py  check_week.py  session.mjs  tests/
.claude/skills/aro-study-week/SKILL.md
```

## 개발 메모

- 로컬 확인: `python -m http.server 8770` 후 `http://127.0.0.1:8770/` (file:// 로는 ES 모듈이 동작하지 않음).
- 테스트: Playwright 설치 후 `python scripts/tests/test_settle.py`, `python scripts/tests/test_reader.py`.
- 비밀번호는 저장소 어디에도 두지 않는다. 노출됐다면 Firebase 콘솔 > Authentication에서 바꾼다.
