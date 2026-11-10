'use client';

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="standalone">
      <h1>화면을 불러오지 못했습니다</h1>
      <p>저장된 내용을 다시 불러오려면 재시도해 주세요.</p>
      <button className="btn btn-primary" onClick={reset}>
        다시 시도
      </button>
    </main>
  );
}
