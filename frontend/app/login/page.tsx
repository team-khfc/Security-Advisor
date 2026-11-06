import { LoginForm } from '@/features/auth';
/** 역할을 선택하는 시연 화면 대신 서버 계정 인증을 진입점으로 제공한다. */
export default function LoginPage() {
  return (
    <main className="login-page">
      <LoginForm />
    </main>
  );
}
