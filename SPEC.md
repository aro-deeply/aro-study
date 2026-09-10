# aro-study: HR 스터디 모임 기록·정산·의견 사이트

작성: 2026-09-08. 이 문서는 Claude Code가 읽고 단계별로 구현하기 위한 작업 지시서다.
각 단계가 끝나면 사용자에게 결과를 보여주고 확인을 받은 뒤 다음 단계로 넘어간다.

## 0. 배경과 목표

- 사용자(ARO)는 HR 스터디 모임의 총무다. 역할은 비용 정산이지만, 매주 공유된 내용과 다음 모임 계획까지 주차별로 기록해 아카이빙하고, 멤버들이 의견을 달 수 있는 사이트를 원한다.
- 기존 자산: `https://aro-deeply.github.io/aro-briefs/` (GitHub Pages, 저장소 `aro-deeply/aro-briefs`). 구조는 index.html 목록 + briefs/날짜-슬러그/ 폴더별 HTML. `assets/reader.js`, `assets/reader.css`에 하이라이트·메모·AI용 복사 기능이 있으나 localStorage 저장이라 개인 기기에만 남는다. 이번 프로젝트에서는 이 저장 위치를 Firebase로 옮겨 멤버 간 공유가 되게 한다.
- 디자인 기준: aro-briefs와 동일한 톤. 워밍 오프화이트 배경(#FAFAF7), 잉크 #1C1917, 브라운 포인트 #8B7355, Pretendard(CDN), 이모지 금지, 명조 금지, em dash(—) 금지(쉼표·괄호·콜론 사용), 카드 그림자 얕게, 밀도 있는 문서형 레이아웃. 정산 화면은 `설계 참고: 속초 정산서`(아래 6절)와 같은 구성으로 만든다.
- 사용자는 Windows 노트북, git과 Claude Code 사용 경험 있음. 핸드폰에서도 자주 열어보므로 모바일 우선으로 만든다.

## 1. 기술 구성 (변경하지 말 것)

- 호스팅: GitHub Pages. 저장소 `aro-deeply/aro-study` (새로 생성, Public). 빌드 도구 없이 정적 HTML/CSS/JS만 사용한다. 프레임워크(React 등) 사용 금지: 사용자가 파일을 직접 열어 고칠 수 있어야 한다.
- 백엔드: Firebase (Firestore + Authentication). Firebase JS SDK는 CDN 모듈 방식(`https://www.gstatic.com/firebasejs/<version>/firebase-*.js`)으로 불러온다. npm 빌드 없음.
- 인증: 이메일/비밀번호 방식의 **공용 계정 하나**를 멤버 전원이 사용한다. 로그인 화면에서는 이메일을 노출하지 않고 "비밀번호" 입력란만 보인다(이메일은 코드에 상수로 둔다). 로그인 후 "이름 선택" 드롭다운(멤버 명단은 Firestore `members`에서 읽음)으로 작성자를 정하고 localStorage에 기억한다.
- Firestore 보안 규칙: 모든 컬렉션에 대해 `allow read, write: if request.auth != null;`. 이것이 실제 접근 제한이다. 정적 HTML에는 민감한 내용을 두지 않는다(아래 3절 참조).
- Firebase 설정값: 아래 블록을 `assets/firebase-config.js`에 그대로 쓴다. 사용자가 콘솔에서 복사해 붙여 넣은 값이다.

```js
// ▼▼▼ 사용자가 Firebase 콘솔에서 복사한 firebaseConfig를 여기에 붙여 넣으세요 ▼▼▼
const firebaseConfig = {
 apiKey: "AIzaSyBaK4Z4ZiytzRCoNh6Juha6JaqMcZs4QWo",
  authDomain: "hr-study-54acd.firebaseapp.com",
  projectId: "hr-study-54acd",
  storageBucket: "hr-study-54acd.firebasestorage.app",
  messagingSenderId: "711324108900",
  appId: "1:711324108900:web:11ac7594aab8c9b082f771"
};
// ▲▲▲ 여기까지 ▲▲▲
```

- 공용 로그인 이메일(코드 상수): `aro.deeply@gmail.com` (사용자가 콘솔에서 만든 계정과 같아야 함. 다르면 사용자에게 물어서 맞춘다.)

## 2. 저장소 구조

```
aro-study/
  index.html                 주차 목록 + 누적 정산 요약 + 미납 현황
  weeks/
    2026-09-XX/index.html    주차별 페이지 (템플릿 복제)
  admin.html                 총무용 입력 화면 (정산 항목·주차 메타·멤버 관리)
  assets/
    style.css                공통 스타일 (aro-briefs 톤)
    firebase-config.js
    app.js                   인증, Firestore 접근, 공용 유틸
    reader.js                하이라이트·메모·의견 (aro-briefs reader.js를 Firestore 저장으로 개조)
    settle.js                정산 계산·렌더
  templates/
    week.html                새 주차 페이지 원본
  .claude/skills/aro-study-week/SKILL.md   새 주차 기록 생성 스킬 (7단계에서 작성)
  CLAUDE.md                  저장소 작업 규칙
  README.md
```

## 3. 데이터 모델 (Firestore)

정적 HTML에 두는 것: 주차 제목, 날짜, 그날 다룬 주제와 공유 내용 요약, 관련 브리프 링크, 다음 모임 계획. 이름·금액·의견은 전부 Firestore.

- `members/{memberId}`: `{ name, order, active, joinedAt }`
- `sessions/{sessionId}`: sessionId는 `2026-09-XX` 형식. `{ date, title, presenter: memberId | "", attendees: [memberId], nextPlan, memo, createdAt }`. 주차 HTML의 메타를 미러링하되, 참석자·발제자는 여기만 둔다. `presenter`가 있으면 발제 순서(`settings/rotation`)보다 우선. (presenter 2026-09-10 추가)
- `settings/meeting`: `{ week: 1~5(5는 마지막), weekday: 0(일)~6(토), time, place }`. 정기 모임 규칙. 없으면 둘째 수요일. 다음 모임 날짜는 이 규칙으로 계산하고, 그 달에 세션이 있으면 세션 날짜를 쓴다. (2026-09-10 추가)
- `settings/rotation`: `{ order: [memberId...], startMonth: "YYYY-MM" }`. 발제 순서. startMonth의 발제자가 order[0], 매월 한 칸씩, 끝나면 처음으로. (2026-09-10 추가)
- `terms/{termId}`: `{ name, start, end, fee, months, account, memberIds: [memberId] | null, note }`. 회비 설정: 1인 금액과 선택적 기간(start·end는 비어 있을 수 있음, 이름도 비우면 "회비"). 여러 개면 기간이 오늘을 포함하는 것, 없으면 가장 최근 것을 현재로 본다. `memberIds`가 null이면 활성 멤버 전원이 대상. (2026-09-09 추가) `months`(사용 개월 수)와 `start`가 있으면 월별 가용 금액을 계산한다: 총액(1인 회비 x 대상 인원)을 months로 나눠 매월 배정하고 덜 쓴 만큼 다음 달로 이월. `end`가 비어 있으면 마지막 달 말일로 본다. `account`는 입금 계좌 표시용. (2026-09-10 추가)
- `dues/{dueId}`: `{ termId, memberId, amount, date, note, createdAt }`. 회비 납부 기록. 한 사람이 여러 번 나눠 낼 수 있다.
- `expenses/{expenseId}`: `{ sessionId, date, item, amount, category, source: "fund" | "split", paidBy: memberId, splitAmong: [memberId] | "attendees", note, createdAt, createdBy }`. `source`가 `"fund"`(기본)면 회비에서 쓴 지출이라 개인 정산에 잡히지 않고 잔액만 줄어든다. `"split"`이면 추가 비용으로 `splitAmong`(`"attendees"`면 세션 참석자 전원)에게 균등 분배. `source`가 없는 옛 문서는 `"split"`으로 본다.
- `payments/{paymentId}`: `{ sessionId, from: memberId | "fund", to: memberId, amount, date, note }`. 송금 기록. `from`이 `"fund"`면 총무가 아닌 사람이 대신 결제한 회비 지출을 회비에서 보전한 것이고, 그 외는 추가 비용 정산 완료 기록.
- `comments/{commentId}`: `{ sessionId, author: memberId, text, createdAt, parentId(null) }`. 1단계 답글까지만.
- `annotations/{id}`: `{ sessionId, author, type: "highlight"|"memo", anchor, text, createdAt }`. anchor는 기존 reader.js가 쓰는 방식(문단 id + 오프셋)을 그대로 유지한다.

인덱스가 필요하면 Firestore 콘솔 링크가 에러로 뜬다. 그 경우 사용자에게 링크를 눌러 인덱스를 만들도록 안내한다.

### 3-1. 운영 방식 (2026-09-09 변경)

- 기본: 1인 회비를 걷어 총무가 보관하고, 모임 비용은 회비에서 쓴다. 잔액 = 납부 합계 - 회비 지출 합계 (누가 결제했는지와 무관).
- 총무가 아닌 사람이 회비 지출을 대신 결제하면 "회비에서 보전할 돈"으로 표시하고, 총무가 보낸 뒤 `payments`에 `from: "fund"`로 기록하면 사라진다.
- 회비 밖 추가 비용만 참석자 n분의 1. 규칙(2026-09-10 변경): 분배 대상이 같은 지출을 합쳐 인원으로 나누고 100원 단위로 올림. 올림으로 더 걷히는 차액은 회비로 귀속된다(총무가 받는 금액에 포함되고 회비 수입으로 잡힌다). 추가 비용이 없으면 개인 정산 표는 표시하지 않는다.
- 회비 금액·기간·대상은 `terms`에서 바꿀 수 있고, 남는 돈의 이월·환급은 미정(회비 설정 메모에 적는다).

### 3-2. 일정·발제·월별 가용 금액 (2026-09-10 추가)

- 정기 모임: 매월 둘째 수요일(`settings/meeting`으로 변경 가능). 목록 상단에 다음 모임 날짜와 그 달 발제자를 보여 주고, "일정과 발제" 섹션에 앞으로 12개월 표를 둔다.
- 발제: `settings/rotation`의 순서대로 매월 한 명. 세션의 `presenter`가 있으면 그것이 확정값. admin 세션 폼은 날짜에 맞는 순서상 발제자를 기본값으로 넣는다.
- 월별 가용 금액: 회비 총액을 개월 수로 나눠 배정하고 이월한다. 월 배정액 = 총액 / months를 100원 단위로 올림, 마지막 달은 남는 금액(그만큼 적다). 이달 가용 = 누적 배정 - 누적 지출(이월 포함). 계산은 계획 총액 기준이라 미납이 있으면 실제 현금은 그보다 적을 수 있다(잔액 카드가 실제 현금).
- 발제자 이름은 화면에서 "이름 님"으로 표시한다(`honor()`).
- 첫 모임(OT, 2026-09-09) 비용은 회비 밖 참석자 n분의 1(`source: "split"`)로 처리한다. 목록 화면의 "추가 비용 정산"은 회차마다 별도 정산서로 표시한다(합산하지 않음).
- 발제 순서는 이미 발제한 사람을 빼고 남은 사람만 넣는다(2026-10 시작, 10명). 이미 한 회차는 세션의 `presenter`로 남는다.

## 4. 화면 요구사항

### 4-1. 공통
- 첫 진입 시 로그인 게이트: 비밀번호 입력 한 칸. 성공하면 Firebase가 세션을 유지하므로 다음 방문엔 묻지 않는다. 그 다음 "이름 선택" 한 번(localStorage 기억, 상단에서 변경 가능).
- 상단 바: 사이트명 `HR STUDY`(작게, 자간 넓게) / `모임 기록` (굵게). 오른쪽에 현재 이름, 로그아웃.
- 모바일 우선. 560px 이하에서 단일 컬럼.
- PWA: manifest.json과 아이콘을 넣어 홈 화면 추가가 되게 한다(aro-briefs와 같은 방식).

### 4-2. index.html (목록)
- 주차 카드 목록(최신순): 날짜, 제목, 참석 인원, 다룬 브리프 링크 개수, 의견 개수.
- 상단 요약: 회비 잔액(납부 n/m명), 미납 인원과 이름, 다음 모임 일정(가장 최근 세션의 nextPlan).
- "회비 현황" 섹션(`fund.js`): 잔액 카드(납부 합계 - 지출 합계), 현재 회비 설정 정보, 멤버별 납부 표(상태·납부액·납부일, 미납 강조), 회비에서 보전할 돈, 이전 회비 설정 요약.
- 주차 카드에 그 회차 지출 합계.
- "추가 비용 정산" 섹션: 참석자 n분의 1로 나눈 지출이 있는 회차만, 회차마다 별도 정산서(6절 형식)로 표시(2026-09-10 변경, 합산하지 않음).

### 4-3. weeks/<id>/index.html (주차 페이지)
순서대로:
1. 헤더: 날짜, 제목, 참석자(Firestore에서 이름 채움)
2. 이날의 내용: 정적 HTML. 소제목 + 문단. 관련 브리프가 있으면 aro-briefs 링크 카드.
3. 다음 모임 계획: 정적 HTML
4. 비용: `settle.js`의 `mountSettlement`가 이 세션의 expenses를 읽어 두 부분으로 렌더. (1) 회비 지출: 이 회차 합계, 현재 회비 잔액, 내역, 대신 결제분 보전 상태(`fund.js`). (2) 추가 비용(있을 때만): 아래 6절 형식. 항목 목록, 카테고리 합계, 1인 부담액(참석자 기준 균등, 100원 단위 올림, 차액은 회비 귀속), 누가 얼마 냈고 누가 누구에게 얼마 보내야 하는지.
5. 의견: 댓글 목록 + 입력. 작성자는 선택한 이름. 삭제는 본인 글만(클라이언트 판단, 규칙에서는 로그인만 검사).
6. 하이라이트·메모: 기존 reader.js 기능. "내 것만 보기 / 전체 보기" 토글 추가. "AI용 복사"는 전체 메모를 사람별로 묶어 텍스트로 만든다.

### 4-4. admin.html (총무용)
- 같은 로그인이지만 이름이 `총무` 권한(`members`에 `role: "admin"`)인 경우만 진입. 서버 검증은 하지 않는다(리스크 낮음, 사용자 판단).
- 탭 6개: 멤버(추가·비활성화), 일정·발제(정기 모임 규칙, 발제 순서 편집과 12개월 미리보기), 회비(회비 설정 만들기·수정·삭제: 1인 금액·시작일·사용 개월 수·입금 계좌, 멤버별 납부 현황과 "납부 처리"·취소, 납부 기록 직접 입력), 세션(만들기/수정/삭제, 발제자 선택, 삭제 시 지출·송금 기록 함께 삭제), 지출(항목, 금액, 날짜, 카테고리, 재원: 회비에서 / 참석자 n분의 1, 낸 사람, 분배 대상), 송금 기록(회비 보전 또는 추가 비용 정산 완료).
- 지출 입력은 핸드폰에서 영수증 보고 바로 넣을 수 있게 큰 입력칸, 금액은 숫자 키패드(`inputmode="numeric"`).

## 5. 구현 단계 (이 순서로, 단계마다 확인)

1. **저장소 준비**: 폴더에 git init, `gh repo create aro-deeply/aro-study --public --source=. --push`(gh 없으면 사용자에게 GitHub 웹에서 만들도록 안내). GitHub Pages는 main 브랜치 루트로 설정(`gh api` 또는 사용자 안내).
2. **스타일 이식**: aro-briefs 저장소(`../aro-briefs`가 있으면 거기서, 없으면 `gh repo clone aro-deeply/aro-briefs /tmp`)의 CSS 변수와 카드·타이포 규칙을 `assets/style.css`로 옮긴다. 명조·이모지·em dash가 없는지 확인.
3. **인증과 데이터 계층**: `app.js`에 Firebase 초기화, 로그인 게이트, 이름 선택, Firestore 헬퍼. Firestore 규칙 파일 `firestore.rules`를 만들어 사용자가 콘솔 "규칙" 탭에 붙일 수 있게 한다(Firebase CLI 배포는 하지 않는다. 사용자에게 붙여넣기 안내).
4. **admin.html**: 멤버·세션·지출 입력이 되게 한다. 여기서 사용자가 실제 멤버 명단과 첫 세션을 입력한다.
5. **정산 렌더(settle.js)와 주차 템플릿**: 6절 형식. 실제 데이터로 표시 확인.
6. **의견과 공유 메모(reader.js 개조)**: localStorage → Firestore. 두 기기에서 서로 보이는지 확인.
7. **index.html 목록·누적 정산, PWA, README, CLAUDE.md, 스킬** `aro-study-week`: 사용자가 모임 후 메모(텍스트 또는 음성 전사)를 주면 `weeks/<date>/index.html`을 템플릿에서 생성하고 Firestore `sessions`에 메타를 등록하고 index.html 목록에 카드를 추가한 뒤 커밋·푸시까지 하는 스킬.

## 6. 설계 참고: 속초 정산서

사용자가 만족한 정산서 구성이다. 정산 섹션은 이 순서와 밀도를 따른다.

- 총 지출(큰 숫자, 어두운 카드) + 오른쪽에 정산 기준(N인 균등, 100원 단위 올림, 나눗셈식, 회비 귀속액)
- 1인 정산 금액 카드 3~N개 (총무 카드만 웜 톤 배경, "회비 보관" 태그와 귀속액)
- 카테고리 막대(단일 가로 바, 브라운 계열 4단계) + 카테고리별 금액
- 상세 내역: 날짜별 카드, 헤더에 날짜·건수·소계, 항목은 이름 왼쪽 금액 오른쪽 한 줄
- 하단: "중복 없음 · 합계 검산 완료" 한 줄. 검산은 실제로 코드에서 수행하고(항목 합 = 총액, 소계 합 = 총액) 틀리면 경고를 표시한다.

## 7. 하지 말 것

- em dash(—) 사용 금지. 이모지 금지. 세리프 폰트 금지.
- 정적 HTML에 멤버 이름·금액을 하드코딩하지 않는다.
- 프레임워크·번들러 도입 금지.
- Firebase 설정값 외의 비밀(비밀번호 등)을 저장소에 넣지 않는다.
- 사용자 확인 없이 다음 단계로 넘어가지 않는다.
