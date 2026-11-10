'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui';
import { ActivityList } from './ActivityList';
import { useActivityCount } from './useActivity';

/** 머리글 알림 패널. 닫기·Escape 시 열기 버튼으로 초점을 돌려준다. */
export function NotificationBell() {
  const count = useActivityCount('unread');
  const [open, setOpen] = useState(false);
  const area = useRef<HTMLDivElement>(null),
    button = useRef<HTMLButtonElement>(null),
    heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!open) return;
    heading.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        button.current?.focus();
      }
    };
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !area.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('keydown', escape);
    document.addEventListener('pointerdown', outside);
    return () => {
      document.removeEventListener('keydown', escape);
      document.removeEventListener('pointerdown', outside);
    };
  }, [open]);
  return (
    <div className="noti-wrap" ref={area}>
      <button
        ref={button}
        type="button"
        className="tbtn notification-toggle"
        aria-label={`알림${count.data === undefined ? '' : `, 안 읽은 알림 ${count.data}건`}`}
        aria-expanded={open}
        aria-controls="notification-panel"
        onClick={() => setOpen(!open)}
      >
        <Icon name="bell" />
        {Boolean(count.data) && <span className="activity-count">{count.data}</span>}
      </button>
      {open && (
        <section
          className="noti activity-panel"
          id="notification-panel"
          aria-labelledby="notification-heading"
        >
          <div className="noti-h">
            <h2 className="h-panel" id="notification-heading" tabIndex={-1} ref={heading}>
              알림·협의 소식
            </h2>
            <button
              className="btn btn-tertiary"
              onClick={() => {
                setOpen(false);
                button.current?.focus();
              }}
              aria-label="알림 닫기"
            >
              닫기
            </button>
          </div>
          {count.isError && <p role="status">안 읽은 알림 수를 확인하지 못했습니다.</p>}
          <ActivityList kind="notifications" compact onOpen={() => setOpen(false)} />
          <Link className="activity-all" href="/notifications" onClick={() => setOpen(false)}>
            전체 알림 보기
          </Link>
        </section>
      )}
    </div>
  );
}
