import Link from 'next/link';
import { Badge, Notice, PageHeading } from './ui';

/** 일정상 착수하지 않은 기능을 동작하는 화면처럼 꾸미지 않는다. */
export function PlannedPage({ title }: { title: string }) {
  return (
    <>
      <PageHeading title={title} />
      <section className="card">
        <Badge tone="warning">설계 완료 · 구현 예정</Badge>
        <h2 className="h-sec">필수 업무 흐름 검증 후 진행합니다</h2>
        <p>
          정책 수명주기·업무 지표·화면 안 알림은 11월 9일 통합 리허설에서 필수 경로가 통과된 뒤
          착수하는 P2 범위입니다.
        </p>
        <Notice>
          서류 확정과 실제 방화벽 적용은 별개입니다. 현재 화면은 적용 기록·회수·만료 처리 기능을
          제공하지 않습니다.
        </Notice>
        <Link className="btn" href="/requests">
          신청 현황으로
        </Link>
      </section>
    </>
  );
}
