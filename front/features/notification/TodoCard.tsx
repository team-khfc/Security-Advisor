'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui';
import { DOCUMENT_LABELS, type DocumentType } from '@/features/request/types';
import type { TodoEntry } from './useActivity';

const actions: Record<string, [string, string]> = {
  REVIEW: [
    '담당자 협의',
    '신청 내용과 서버·네트워크 구성을 검토하고 담당 분야 협의를 진행해 주세요.',
  ],
  SUPPLEMENT_ANSWERED: [
    '보완 답변 검토',
    '신청자가 작성한 보완 답변을 확인하고 보완 요청을 해소해 주세요.',
  ],
  FINAL_CONFIRMATION: [
    '제출본 최종 확인',
    '제출된 문서를 확인하고 담당 분야 최종 확인 또는 서류 확정을 진행해 주세요.',
  ],
  SUPPLEMENT_OPEN: [
    '보완 답변 작성',
    '담당자가 요청한 내용을 확인하고 필요한 정보를 추가해 주세요.',
  ],
  FINAL_REVIEW: ['최종 초안 확인·제출', '최종 초안을 수정·확인한 뒤 서류를 제출해 주세요.'],
  REASSIGNMENT: [
    '담당자 재배정',
    '담당자 변경 사유를 확인하고 업무를 이어받을 담당자를 지정해 주세요.',
  ],
};

export function TodoCard({ item, onOpen }: { item: TodoEntry; onOpen?: () => void }) {
  const [action, description] = actions[item.kind] ?? [
    '업무 확인',
    '신청 상세에서 처리할 내용을 확인해 주세요.',
  ];
  const context = item.context;
  return (
    <article className="card doc todo-card">
      <div className="doc-h">
        <Badge tone="info">{action}</Badge>
        <span className="p-id">신청 #{item.securityRequestId}</span>
      </div>
      <h2 className="doc-t">{context?.caseTitle || item.title}</h2>
      {context && (
        <p className="help">
          {DOCUMENT_LABELS[context.docType as DocumentType] ?? '신청 서류'} · {context.statusLabel}
        </p>
      )}
      {context && (
        <dl className="doc-dl">
          <div>
            <dt>담당부서</dt>
            <dd>{context.department || '미등록'}</dd>
          </div>
          <div>
            <dt>진행 단계</dt>
            <dd>
              {['', '작성', '담당자 협의', '최종 검토', '확정·관리'][context.stage] ?? '확인 필요'}
            </dd>
          </div>
          <div>
            <dt>최근 변경</dt>
            <dd>
              {context.updatedAt ? (
                <time dateTime={context.updatedAt}>
                  {new Date(context.updatedAt).toLocaleString('ko-KR', {
                    timeZone: 'Asia/Seoul',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
              ) : (
                '확인 필요'
              )}
            </dd>
          </div>
        </dl>
      )}
      <p className="todo-action-description">{description}</p>
      <div className="doc-actions">
        <Link className="btn btn-primary" href={item.link} onClick={onOpen}>
          {action}하러 가기
        </Link>
      </div>
    </article>
  );
}
