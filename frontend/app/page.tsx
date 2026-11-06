import { redirect } from 'next/navigation';
/** 인증된 업무 공간을 기본 진입점으로 사용한다. */
export default function HomePage() {
  redirect('/workspace');
}
