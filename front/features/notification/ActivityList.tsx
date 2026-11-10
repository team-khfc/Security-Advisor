'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge, ListPager, LoadingState, Notice, PageHeading } from '@/components/ui';
import { useActivity, useReadNotification } from './useActivity';
import { TodoCard } from './TodoCard';

/** 현재 권한으로 조회한 알림 또는 처리할 일을 페이지 단위로 표시한다. */
export function ActivityList({
  kind,
  compact = false,
  onOpen,
}: {
  kind: 'notifications' | 'todos';
  compact?: boolean;
  onOpen?: () => void;
}) {
  const [page, setPage] = useState(0);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const size = compact ? 5 : kind === 'todos' ? 6 : 20;
  const data = useActivity(kind, page, size, unreadOnly);
  const read = useReadNotification();
  const router = useRouter();
  return (
    <>
      {kind === 'notifications' && (
        <label className="activity-filter">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(e) => {
              setUnreadOnly(e.target.checked);
              setPage(0);
            }}
          />
          안 읽은 알림만
        </label>
      )}
      {data.isPending ? (
        <LoadingState />
      ) : data.isError ? (
        <Notice tone="warning">
          목록을 불러오지 못했습니다.{' '}
          <button className="btn" onClick={() => void data.refetch()}>
            다시 불러오기
          </button>
        </Notice>
      ) : (
        <>
          {read.isError && (
            <Notice tone="warning">
              알림을 열거나 읽음으로 표시하지 못했습니다. 현재 권한과 목록을 다시 확인해 주세요.
            </Notice>
          )}
          {!data.data.content.length && (
            <p className="activity-empty" role="status">
              {kind === 'todos'
                ? '지금 처리할 일이 없습니다.'
                : unreadOnly
                  ? '안 읽은 알림이 없습니다.'
                  : '알림이 없습니다.'}
            </p>
          )}
          <ul
            className={
              kind === 'todos'
                ? `docs document-grid todo-grid${compact ? ' todo-compact' : ''}`
                : 'activity-list'
            }
          >
            {data.data.content.map((item) =>
              !('notificationId' in item) ? (
                <li key={item.key}>
                  <TodoCard item={item} onOpen={onOpen} />
                </li>
              ) : (
                <li key={item.notificationId}>
                  <div>
                    {'readAt' in item && (
                      <Badge tone={item.readAt ? 'neutral' : 'info'}>
                        {item.readAt ? '읽음' : '안 읽음'}
                      </Badge>
                    )}
                    <Link
                      href={item.link}
                      onClick={async (e) => {
                        if (!('notificationId' in item)) {
                          onOpen?.();
                          return;
                        }
                        e.preventDefault();
                        if (read.isPending) return;
                        try {
                          await read.mutateAsync(item.notificationId);
                          onOpen?.();
                          router.push(item.link);
                        } catch {
                          /* 오류를 목록 안에서 안내한다. */
                        }
                      }}
                    >
                      {item.title}
                    </Link>
                    {'createdAt' in item && (
                      <time dateTime={item.createdAt}>
                        {new Date(item.createdAt).toLocaleString('ko-KR')}
                      </time>
                    )}
                  </div>
                  {'readAt' in item && !item.readAt && (
                    <button
                      type="button"
                      className="btn btn-tertiary"
                      disabled={read.isPending}
                      onClick={() => read.mutate(item.notificationId)}
                      aria-label={`${item.title} 읽음으로 표시`}
                    >
                      읽음 표시
                    </button>
                  )}
                </li>
              ),
            )}
          </ul>
          {!compact && page > 0 && !data.data.content.length ? (
            <button className="btn" onClick={() => setPage(0)}>
              목록이 변경되었습니다. 첫 페이지로 이동
            </button>
          ) : (
            !compact && (
              <ListPager
                page={page}
                size={size}
                total={data.data.totalElements}
                onChange={setPage}
                label={kind === 'todos' ? '처리할 일 페이지' : '알림 페이지'}
              />
            )
          )}
        </>
      )}
    </>
  );
}

/** 알림 이력과 현재 업무는 별도 페이지로 제공한다. */
export function ActivityPage({ kind }: { kind: 'notifications' | 'todos' }) {
  return (
    <>
      <PageHeading title={kind === 'todos' ? '처리할 일' : '알림'} />
      <p className="help">
        {kind === 'todos'
          ? '현재 내 역할과 배정에서 처리할 작업입니다. 같은 신청에 협의와 보완 검토가 있으면 각각 표시됩니다. 알림을 읽어도 업무는 완료되지 않습니다.'
          : '현재 접근할 수 있는 업무 알림입니다. 담당자나 역할이 바뀌면 표시되는 알림도 달라질 수 있습니다.'}
      </p>
      <section className={kind === 'todos' ? 'activity-page' : 'card activity-page'}>
        <ActivityList kind={kind} />
      </section>
    </>
  );
}
