'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

type Tone = 'info' | 'warning' | 'danger' | 'success' | 'neutral';

/** 페이지의 제목과 주요 행동 위치를 역할별 화면에서도 동일하게 유지한다. */
export function PageHeading({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {description && <div className="page-desc">{description}</div>}
      </div>
      {actions && <div className="btn-row">{actions}</div>}
    </div>
  );
}

/** 중요한 설명은 색상과 아이콘을 함께 제공하며 오류는 즉시 알린다. */
export function Notice({
  children,
  tone = 'info',
}: {
  children: ReactNode;
  tone?: Exclude<Tone, 'neutral'>;
}) {
  return (
    <div className={`notice n-${tone}`} role={tone === 'danger' ? 'alert' : undefined}>
      <Icon name={tone === 'success' ? 'check' : tone === 'info' ? 'info' : 'alert'} />
      <div className="notice-content">{children}</div>
    </div>
  );
}

/** 상태 배지의 글자는 상태 코드와 별도로 화면에서 명확하게 제공한다. */
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  return <span className={`badge b-${tone}`}>{children}</span>;
}

/** 빈 목록과 검색 결과 없음에 각각 다음 행동을 안내할 수 있게 한다. */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-box">
      <Icon name="folder" size={32} />
      <h2 className="h-panel">{title}</h2>
      {description && <p>{description}</p>}
      {action && <div className="empty-actions">{action}</div>}
    </div>
  );
}

/** 조회 중에는 완료된 업무 결과처럼 보이는 임시 수치를 표시하지 않는다. */
export function LoadingState() {
  return (
    <div className="loading-state" role="status" aria-live="polite">
      <span className="loading-spinner" aria-hidden="true" />
      <span>내용을 불러오고 있습니다.</span>
    </div>
  );
}

/** 통신 오류와 재시도 수단을 같은 위치에서 제공한다. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const description = error instanceof Error ? error.message : '잠시 후 다시 시도해 주세요.';
  return (
    <Notice tone="danger">
      <p>
        <strong>내용을 불러오지 못했습니다.</strong>
      </p>
      <p>{description}</p>
      {onRetry && (
        <button type="button" className="btn btn-tertiary btn-sm notice-action" onClick={onRetry}>
          다시 시도
        </button>
      )}
    </Notice>
  );
}

/** 네이티브 dialog로 초점 제한·Escape·닫은 뒤 초점 복귀를 보장한다. */
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    return () => {
      // 조건부 렌더링으로 제거해도 네이티브 닫기와 동일하게 열기 버튼으로 돌아간다.
      if (dialog.open) dialog.close();
      if (open && opener?.isConnected) opener.focus();
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={() => {
        if (open) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        // 네이티브 dialog의 경계에서 브라우저 도구 모음으로 빠지지 않게 순환한다.
        const controls = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'a[href], button, input, select, textarea, summary, [tabindex]',
          ),
        ).filter(
          (element) =>
            element.tabIndex >= 0 &&
            !element.matches(':disabled, [hidden], [inert]') &&
            element.getClientRects().length > 0,
        );
        const target = event.shiftKey ? controls.at(-1) : controls[0];
        const boundary = event.shiftKey ? controls[0] : controls.at(-1);
        if (
          target &&
          (document.activeElement === boundary || document.activeElement === event.currentTarget)
        ) {
          event.preventDefault();
          target.focus();
        }
      }}
    >
      <div className="dlg">
        <div className="dlg-h">
          <h2 className="h-panel" id={titleId}>
            {title}
          </h2>
        </div>
        <div className="dlg-b">{children}</div>
        <button type="button" className="dlg-x" onClick={onClose} aria-label={`${title} 닫기`}>
          <Icon name="x" />
        </button>
      </div>
    </dialog>
  );
}

/** 레이블과 설명의 ID를 일정하게 제공하여 입력과 연결한다. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {hint && (
        <div className="help" id={`${htmlFor}-hint`}>
          {hint}
        </div>
      )}
      {children}
      {error && (
        <p className="ferr" id={`${htmlFor}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
