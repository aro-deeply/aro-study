---
name: aro-study-week
description: HR 스터디 모임이 끝난 뒤 사용자가 메모(텍스트 또는 음성 전사)를 주면 weeks/<날짜>/index.html 주차 페이지를 템플릿에서 만들고, Firestore sessions 문서를 등록·갱신하고, 커밋·푸시까지 하는 절차. "이번 주 기록 만들어", "모임 정리해서 올려줘", "주차 페이지 생성" 같은 요청에 사용.
---

# aro-study-week: 새 주차 기록 만들기

목표: 모임 메모 → `weeks/<YYYY-MM-DD>/index.html` 생성 → Firestore `sessions/<날짜>` 등록(page: true) → 커밋·푸시 → 공개 URL 확인.
index.html 목록은 Firestore를 읽어 자동으로 그리므로 목록 카드를 따로 추가하지 않는다. `page: true`만 세션에 기록하면 카드가 링크로 바뀐다.

## 0. 입력 확인 (부족하면 이것만 먼저 묻는다)

- 모임 날짜(YYYY-MM-DD). 세션 ID이자 폴더명이다.
- 제목(한 줄). 없으면 메모에서 뽑아 제안하고 확인받는다.
- 메모 본문: 공유된 내용, 결정 사항, 다음 모임 계획. 음성 전사면 잡음(음, 어, 반복)을 정리하되 내용은 바꾸지 않는다.
- 다룬 브리프: 사용자가 메모에서 브리프를 언급했을 때만 aro-briefs 목록(`../aro-briefs/index.html`의 `.brief` 카드)에서 제목·URL을 찾아 넣는다. 언급이 없으면 넣지 않는다(관련 자료는 멤버들이 페이지의 "관련 자료"에 직접 올린다).
- 참석자 이름은 메모에 있으면 세션 등록에만 쓴다. 본문 HTML에는 멤버 이름을 쓰지 않는다("한 멤버는", "여러 명이" 식으로).

## 1. 원본 보관 (git 밖)

`../work/aro-study/<날짜>/notes.md`에 받은 메모 원문을 그대로 저장한다. 폴더가 없으면 만든다. 저장소에는 정리본만 들어간다.

## 2. 본문 HTML 조각 작성

`../work/aro-study/<날짜>/content.html`에 "이날의 내용" 조각을 쓴다. 형식:

```html
<h3>소제목</h3>
<p>문단. 한 문단은 2~4문장.</p>
<div class="box"><div class="lab">정리</div><p>이날의 결론이나 합의 한두 문장.</p></div>
<a class="brief-link" href="https://aro-deeply.github.io/aro-briefs/briefs/YYYY-MM-DD-slug/" target="_blank" rel="noopener">
  <span class="k">CASE BRIEF 02</span><span class="t">브리프 제목</span><span class="go">브리프 열기</span></a>
```

규칙:
- 소제목 2~5개, 각 소제목 아래 1~3문단. 밀도 있게, 회의록 나열이 아니라 "무엇을 공유했고 어디에 동의·이견이 있었나"가 보이게.
- 금지: em dash, 이모지, 세리프. 쉼표·괄호·콜론을 쓴다.
- 멤버 이름, 금액, 개인 신상은 넣지 않는다(정산·참석자는 Firestore가 채운다).
- 확인되지 않은 수치·인용은 넣지 않는다. 브리프 링크는 aro-briefs에 실제 있는 것만.

## 3. 페이지 생성과 점검

```
python scripts/new_week.py --date <날짜> --title "<제목>" --content ../work/aro-study/<날짜>/content.html --next "<다음 모임 계획 한두 문장>"
python scripts/check_week.py weeks/<날짜>/index.html
```

check가 FAIL이면 고치고 다시 돌린다. 로컬 확인이 필요하면 `python -m http.server 8770` 후 `http://127.0.0.1:8770/weeks/<날짜>/` (로그인 필요).

## 4. Firestore 세션 등록

총무가 모임 때 admin.html에서 세션을 이미 만들었을 수 있다. 먼저 확인:

```
node scripts/session.mjs get <날짜>
```

- 있으면: `node scripts/session.mjs set <날짜> --title "<제목>" --next "<다음 계획>" --briefs <브리프 수> --page` (참석자·발제자는 유지됨)
- 없으면: 위 명령에 `--attendees "이름1,이름2,..."`를 붙인다. 이름은 `node scripts/session.mjs members` 목록과 정확히 같아야 한다. 참석자를 모르면 `--attendees` 없이 만들고 사용자에게 admin.html에서 체크하라고 알린다.
- 발제자: 새 세션이면 발제 순서(`settings/rotation`)에서 그 달의 사람이 자동으로 들어간다. 메모에 발제자가 따로 있으면 `--presenter "이름"`으로 넣는다. 본문 HTML에는 발제자 이름을 쓰지 않는다(메타 줄이 Firestore에서 채운다).
- 다음 모임 계획(`--next`)에 날짜를 쓸 때는 정기 규칙(매월 둘째 수요일)으로 계산한 날짜인지 확인한다. 목록 화면의 "다음 모임"은 규칙으로 자동 계산되므로 계획 문구에는 준비물·장소 위주로 쓴다.

비밀번호는 실행 중 물어본다(화면에 표시되지 않음). 파일이나 대화에 기록하지 않는다. 실패(권한 오류)면 Firestore 규칙 게시 여부를 사용자에게 확인한다.

## 5. 커밋·푸시·확인

```
git add weeks/<날짜>/index.html
git commit -m "week: <날짜> <제목>"
git push origin main
```

1~2분 뒤 `https://aro-deeply.github.io/aro-study/weeks/<날짜>/`가 열리는지 확인하고, 목록(`https://aro-deeply.github.io/aro-study/`) 맨 위에 카드가 링크로 보이는지 확인한 뒤 URL을 보고한다. 정산과 의견은 페이지가 뜬 뒤 Firestore에서 채워지므로, 지출이 아직 없으면 "등록된 지출이 없습니다"가 정상이다.

## 보고 형식

- 생성한 파일 경로와 공개 URL
- 세션 등록 결과(생성/수정, 참석자 반영 여부)
- 사용자가 할 일: 참석자 체크나 지출 입력이 남았으면 admin.html 어느 탭에서 하는지
