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

// 멤버는 익명 로그인(비밀번호 없음, 콘솔에서 "익명" 켜 둠). 총무만 아래 계정으로 admin.html에서 로그인한다.
// firestore.rules / storage.rules 의 isAdmin() 에 같은 이메일이 적혀 있다. 바꾸면 둘 다 바꾼다.
export const ADMIN_EMAIL = "aro.deeply@gmail.com";
export default firebaseConfig;
