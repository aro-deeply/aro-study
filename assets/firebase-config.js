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

// 공용 로그인 계정의 이메일. 로그인 화면에는 표시하지 않는다.
// Firebase 콘솔 > Authentication > Users 에 만든 계정과 같아야 한다.
export const LOGIN_EMAIL = "aro.deeply@gmail.com";
export default firebaseConfig;
