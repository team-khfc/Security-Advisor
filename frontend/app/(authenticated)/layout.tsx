import { AuthBoundary } from '@/features/auth';
import { AuthenticatedShell } from '@/components/layout';
/** 업무 경로를 실제 세션 확인으로 감싸 공개 시안과 인증 데이터를 분리한다. */
export default function WorkLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthBoundary>
      <AuthenticatedShell>{children}</AuthenticatedShell>
    </AuthBoundary>
  );
}
