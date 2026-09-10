/* 화면 예시용 가명 데이터. 실제 멤버·금액이 아니다. demo/index.html 과 index.html?demo=1 이 사용한다.
   운영 방식: 회비 1인 50,000원을 6개월로 나눠 월별 가용 금액 안에서 쓴다(덜 쓰면 이월). 모임 비용은 회비에서(source: "fund"),
   회비 밖 추가 비용만 참석자 n분의 1(source: "split"). 정기 모임은 매월 둘째 화요일, 발제는 멤버A부터 순서대로 매월 한 명. */
export const TODAY = "2026-10-20";
export const MEMBERS = [
  { id: "a", name: "멤버A", order: 1, role: "admin", active: true },
  { id: "b", name: "멤버B", order: 2, role: "member", active: true },
  { id: "c", name: "멤버C", order: 3, role: "member", active: true },
  { id: "d", name: "멤버D", order: 4, role: "member", active: true },
  { id: "e", name: "멤버E", order: 5, role: "member", active: true },
];
export const SETTINGS = {
  meeting: { week: 2, weekday: 2, time: "19:30", place: "강남 스터디룸" },
  rotation: { order: ["a", "b", "c", "d", "e"], startMonth: "2026-09" },
};
export const TERMS = [
  { id: "t1", name: "2026 하반기 회비", start: "2026-09-01", end: "", fee: 50000, months: 6, account: "예시은행 000-0000-0000 멤버A", memberIds: null, note: "남는 돈 처리는 미정" },
];
export const DUES = [
  { id: "d1", termId: "t1", memberId: "a", amount: 50000, date: "2026-09-03" },
  { id: "d2", termId: "t1", memberId: "b", amount: 50000, date: "2026-09-05" },
  { id: "d3", termId: "t1", memberId: "c", amount: 50000, date: "2026-09-08" },
  { id: "d4", termId: "t1", memberId: "e", amount: 50000, date: "2026-09-08" },
  // 멤버D는 미납
];
export const SESSIONS = [
  { id: "2026-10-13", date: "2026-10-13", title: "신입 온보딩 과제 비교와 경력 사다리 재설계", presenter: "b", attendees: ["a", "b", "c", "e"], nextPlan: "11월 10일(화) 19:30. AI 도입 사례 브리프 한 편을 읽고 온다.", page: false, briefCount: 0 },
  { id: "2026-09-08", date: "2026-09-08", title: "첫 모임: 스터디 운영 방식과 첫 브리프 토론", presenter: "a", attendees: ["a", "b", "c", "d", "e"], nextPlan: "10월 13일(화) 19:30. 각자 자기 조직의 신입 온보딩 과제를 하나씩 가져온다.", page: true, briefCount: 1 },
];
export const EXPENSES = [
  { id: "e1", sessionId: "2026-09-08", date: "2026-09-08", item: "저녁 식사", amount: 20500, category: "식사", source: "fund", paidBy: "a", splitAmong: "attendees" },
  { id: "e2", sessionId: "2026-09-08", date: "2026-09-08", item: "카페", amount: 9000, category: "카페", source: "fund", paidBy: "b", splitAmong: "attendees", note: "멤버B가 대신 결제" },
  { id: "e3", sessionId: "2026-09-08", date: "2026-09-08", item: "스터디룸 2시간", amount: 12000, category: "장소", source: "fund", paidBy: "a", splitAmong: "attendees" },
  { id: "e4", sessionId: "2026-09-08", date: "2026-09-07", item: "자료 인쇄", amount: 13700, category: "기타", source: "split", paidBy: "a", splitAmong: "attendees", note: "회비 밖 추가 비용" },
  { id: "e5", sessionId: "2026-10-13", date: "2026-10-13", item: "저녁 식사", amount: 22000, category: "식사", source: "fund", paidBy: "a", splitAmong: "attendees" },
];
export const PAYMENTS = [
  { id: "p1", sessionId: "2026-09-08", from: "fund", to: "b", amount: 9000, date: "2026-09-09", note: "카페 대신 결제분 보전" },
  { id: "p2", sessionId: "2026-09-08", from: "d", to: "a", amount: 2800, date: "2026-09-09" },
];
export const COMMENTS = [
  { id: "c1", sessionId: "2026-09-08", author: "b", text: "신입 온보딩 과제를 가져오는 건 좋은데, 팀별 편차가 클 것 같아요. 공통 양식이 있으면 좋겠습니다.", parentId: null, createdAt: new Date(Date.now() - 7200e3) },
  { id: "c2", sessionId: "2026-09-08", author: "a", text: "양식은 제가 초안 만들어서 공유할게요.", parentId: "c1", createdAt: new Date(Date.now() - 5400e3) },
];
export const ANNOTATIONS = [
  { id: "x1", sessionId: "2026-09-08", author: "b", type: "memo", anchor: { start: 60, end: 90 }, text: "", note: "우리 회사도 같은 원칙이면 좋겠다", createdAt: new Date(Date.now() - 3600e3) },
];
