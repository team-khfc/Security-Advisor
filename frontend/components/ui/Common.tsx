'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { ApiError } from '@/lib/http';
import { Icon } from './Icon';

/** 색만으로 상태를 전달하지 않도록 상태 문구를 항상 함께 렌더링한다. */
export function Badge({
  children,
  tone = 'gray',
}: {
  children: ReactNode;
  tone?: 'gray' | 'blue' | 'green' | 'amber' | 'red';
}) {
  return <span className={`sf-badge ${tone}`}>{children}</span>;
}
/** 화면 목적과 주요 행동을 같은 제목 영역에 모아 지정 시안의 구조를 유지한다. */
export function Heading({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  useEffect(() => {
    document.title = `${title} | SecurityAdvisor`;
  }, [title]);
  return (
    <div className="sf-heading">
      <div>
        <h1 id="page-title" tabIndex={-1}>
          {title}
        </h1>
        {description && <p>{description}</p>}
      </div>
      {children && <div className="sf-heading-actions">{children}</div>}
    </div>
  );
}
/** 업무 상태 안내와 실패 안내를 구분하고 실패는 보조기기에도 알린다. */
export function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return (
    <div className={`sf-notice ${error ? 'error' : 'info'}`} role={error ? 'alert' : undefined}>
      <Icon name="info" />
      <div>{children}</div>
    </div>
  );
}
/** 실패·충돌을 성공처럼 표시하지 않고 문의 번호와 입력 유지 사실을 전달한다. */
export function ErrorNotice({ error, retry }: { error: unknown; retry?: () => void }) {
  if (!error) return null;
  const conflict = error instanceof ApiError && error.status === 409;
  return (
    <Notice error>
      <strong>
        {conflict ? '다른 변경이 먼저 저장되었습니다.' : '요청을 완료하지 못했습니다.'}
      </strong>
      <p>{error instanceof Error ? error.message : '잠시 후 다시 시도해 주세요.'}</p>
      {conflict && <p>현재 입력은 유지했습니다. 최신 저장 내용을 확인한 뒤 다시 저장해 주세요.</p>}
      {error instanceof ApiError && error.requestId && <small>문의 번호: {error.requestId}</small>}
      {retry && (
        <button type="button" className="text-button" onClick={retry}>
          다시 불러오기
        </button>
      )}
    </Notice>
  );
}
/** 서버 확인 중인 상태가 빈 데이터나 처리 완료로 오해되지 않게 한다. */
export function Loading({ label = '업무 내용을 불러오고 있습니다.' }: { label?: string }) {
  return (
    <section className="sf-panel loading-state" role="status">
      <span className="loading-dot" />
      <p>{label}</p>
    </section>
  );
}
/** 허용된 데이터가 없는 경우 검색 변경이나 다음 행동을 안내한다. */
export function Empty({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <Icon name="file" width={40} height={40} />
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}
/** 신청 작성과 협의 진행을 구분하여 화면 이동이 업무 상태 전이로 오해되지 않게 한다. */
export function Stepper({
  current,
  detail = false,
  returned = false,
}: {
  current: number;
  detail?: boolean;
  returned?: boolean;
}) {
  const labels = ['작성', '담당자 협의', '사용자 최종 검토', '확정·관리'];
  void detail;
  return (
    <ol className="sf-stepper" aria-label="신청 진행 단계">
      {labels.map((label, index) => (
        <li
          key={label}
          className={index < current ? 'done' : index === current ? 'current' : ''}
          aria-current={index === current ? 'step' : undefined}
        >
          <span>{index < current ? <Icon name="check" width={16} height={16} /> : index + 1}</span>
          <strong>{label}</strong>
          {returned && index === current && <Badge tone="amber">반환됨</Badge>}
        </li>
      ))}
    </ol>
  );
}
/** 일반 사용자가 모르는 기술 사실을 임의로 채우지 않고 담당자에게 맡기도록 안내한다. */
export function FormHelp() {
  return (
    <aside className="form-help">
      <div className="sf-panel">
        <span className="overline">작성 안내</span>
        <h3>한 번에 완벽하지 않아도 괜찮아요.</h3>
        <p>신청자는 사업 목적과 이용 환경을, 담당자는 보안·통신 정보를 함께 확인합니다.</p>
        <hr />
        <h4>미리 준비하면 좋은 자료</h4>
        <ul>
          <li>사업계획서 또는 서비스 개요서</li>
          <li>시스템 구성과 외부 연계 설명</li>
          <li>개인정보 처리 항목과 목적</li>
        </ul>
        <div className="help-callout">
          <Icon name="shield" />
          <span>AI 제안은 근거를 확인한 후 사람이 확정합니다.</span>
        </div>
      </div>
    </aside>
  );
}
/** native dialog의 포커스 격리·복귀를 사용하며 재인증 안내만 임의 닫기를 제한한다. */
export function Modal({
  open,
  title,
  children,
  onClose,
  locked = false,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  locked?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  useEffect(() => {
    if (open && !ref.current?.open) ref.current?.showModal();
    if (!open && ref.current?.open) ref.current.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={headingId}
      className="app-dialog"
      onCancel={(event) => {
        if (locked) event.preventDefault();
        else onClose();
      }}
      onClose={() => {
        if (!locked) onClose();
      }}
    >
      <div className="dialog-heading">
        <h2 id={headingId}>{title}</h2>
      </div>
      {children}
      {!locked && (
        <button
          className="icon-button modal-close"
          type="button"
          onClick={onClose}
          aria-label="대화상자 닫기"
        >
          <Icon name="close" />
        </button>
      )}
    </dialog>
  );
}
