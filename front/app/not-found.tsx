import Link from 'next/link';

export default function NotFoundPage() {
  return (
    <main className="standalone">
      <h1>페이지를 찾을 수 없습니다</h1>
      <p>주소를 확인하거나 신청 현황으로 이동해 주세요.</p>
      <Link className="btn btn-primary" href="/requests">
        신청 현황
      </Link>
    </main>
  );
}
