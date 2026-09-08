/* 화면 예시용 가명 데이터. 실제 멤버·금액이 아니다. demo/index.html 과 index.html?demo=1 이 사용한다. */
export const MEMBERS = [
  { id: "a", name: "멤버A", order: 1, role: "admin", active: true },
  { id: "b", name: "멤버B", order: 2, role: "member", active: true },
  { id: "c", name: "멤버C", order: 3, role: "member", active: true },
  { id: "d", name: "멤버D", order: 4, role: "member", active: true },
  { id: "e", name: "멤버E", order: 5, role: "member", active: true },
];
export const SESSIONS = [
  { id: "2026-09-29", date: "2026-09-29", title: "신입 온보딩 과제 비교와 경력 사다리 재설계", attendees: ["a", "b", "c", "e"], nextPlan: "10월 13일(월) 19:30. AI 도입 사례 브리프 한 편을 읽고 온다.", page: false, briefCount: 0 },
  { id: "2026-09-15", date: "2026-09-15", title: "첫 모임: 스터디 운영 방식과 첫 브리프 토론", attendees: ["a", "b", "c", "d", "e"], nextPlan: "9월 29일(월) 19:30. 각자 자기 조직의 신입 온보딩 과제를 하나씩 가져온다.", page: true, briefCount: 1 },
];
export const EXPENSES = [
  { id: "e1", sessionId: "2026-09-15", date: "2026-09-15", item: "저녁 식사", amount: 96500, category: "식사", paidBy: "a", splitAmong: "attendees" },
  { id: "e2", sessionId: "2026-09-15", date: "2026-09-15", item: "카페", amount: 32000, category: "카페", paidBy: "b", splitAmong: "attendees" },
  { id: "e3", sessionId: "2026-09-15", date: "2026-09-15", item: "스터디룸 2시간", amount: 24000, category: "장소", paidBy: "a", splitAmong: "attendees" },
  { id: "e4", sessionId: "2026-09-15", date: "2026-09-14", item: "자료 인쇄", amount: 13700, category: "기타", paidBy: "a", splitAmong: "attendees" },
  { id: "e5", sessionId: "2026-09-29", date: "2026-09-29", item: "저녁 식사", amount: 72000, category: "식사", paidBy: "a", splitAmong: "attendees" },
];
export const PAYMENTS = [
  { id: "p1", sessionId: "2026-09-15", from: "d", to: "a", amount: 33200, date: "2026-09-16" },
];
export const COMMENTS = [
  { id: "c1", sessionId: "2026-09-15", author: "b", text: "신입 온보딩 과제를 가져오는 건 좋은데, 팀별 편차가 클 것 같아요. 공통 양식이 있으면 좋겠습니다.", parentId: null, createdAt: new Date(Date.now() - 7200e3) },
  { id: "c2", sessionId: "2026-09-15", author: "a", text: "양식은 제가 초안 만들어서 공유할게요.", parentId: "c1", createdAt: new Date(Date.now() - 5400e3) },
];
export const ANNOTATIONS = [
  { id: "x1", sessionId: "2026-09-15", author: "b", type: "memo", anchor: { start: 60, end: 90 }, text: "", note: "우리 회사도 같은 원칙이면 좋겠다", createdAt: new Date(Date.now() - 3600e3) },
];
