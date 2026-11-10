import { useState } from 'react';
import { Badge, ErrorState, ListPager, LoadingState, Modal } from '@/components/ui';
import { usePublication, usePublicationHistory, usePublishedComparison } from './useConfiguration';
import { ChangeList } from './ChangeList';
import { roleLabels } from './types';

/** 게시 당시 메모·담당자·질문·기한과 변경 비교를 불변 스냅샷에서 조회한다. */
export function PublicationHistory({ currentVersion }: { currentVersion: number }) {
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const history = usePublicationHistory(page);
  const publication = usePublication(selected);
  const comparison = usePublishedComparison(selected);
  return (
    <div className="card">
      <h2 className="h-panel">게시 이력</h2>
      {history.isPending ? (
        <LoadingState />
      ) : history.isError ? (
        <ErrorState error={history.error} onRetry={() => void history.refetch()} />
      ) : (
        <>
          <div className="tbl-wrap">
            <table className="tbl">
              <caption className="sr-only">기관 설정 게시 버전</caption>
              <thead>
                <tr>
                  <th scope="col">버전</th>
                  <th scope="col">게시 시각</th>
                  <th scope="col">게시자</th>
                  <th scope="col">변경 메모</th>
                  <th scope="col">게시 내용</th>
                </tr>
              </thead>
              <tbody>
                {history.data.content.map((item) => (
                  <tr key={item.publicationId}>
                    <td>
                      <b>v{item.version}</b>{' '}
                      {item.version === currentVersion && <Badge tone="success">현재 게시본</Badge>}
                    </td>
                    <td>{new Date(item.publishedAt).toLocaleString('ko-KR')}</td>
                    <td>{item.publishedBy ?? '초기 설치·이전 기록'}</td>
                    <td>{item.note || '메모 없음'}</td>
                    <td>
                      <button
                        className="btn btn-tertiary"
                        type="button"
                        onClick={() => setSelected(item.publicationId)}
                      >
                        v{item.version} 내용 보기
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ListPager
            page={page}
            size={10}
            total={history.data.totalElements}
            onChange={setPage}
            label="게시 이력 페이지"
          />
        </>
      )}
      <Modal
        open={selected !== null}
        title="게시본 내용과 변경 이력"
        onClose={() => setSelected(null)}
      >
        {publication.isPending || comparison.isPending ? (
          <LoadingState />
        ) : publication.isError || comparison.isError ? (
          <ErrorState
            error={publication.error ?? comparison.error}
            onRetry={() => {
              void publication.refetch();
              void comparison.refetch();
            }}
          />
        ) : (
          publication.data &&
          comparison.data && (
            <>
              <h3>게시본 v{publication.data.version}</h3>
              <p>
                협의 {publication.data.fieldSchema.deadlinePolicy.reviewBusinessDays}영업일 · 보완{' '}
                {publication.data.fieldSchema.deadlinePolicy.supplementBusinessDays}영업일 · 최종
                확정 {publication.data.fieldSchema.deadlinePolicy.finalConfirmationBusinessDays}
                영업일
              </p>
              <p>
                공휴일: {publication.data.fieldSchema.deadlinePolicy.holidays.join(', ') || '없음'}
              </p>
              <details>
                <summary>질문 {publication.data.fieldSchema.fields.length}개 보기</summary>
                <ol>
                  {publication.data.fieldSchema.fields.map((field) => (
                    <li key={field.key}>
                      <b>{field.label}</b> · {roleLabels[field.askRole]} ·{' '}
                      {field.required ? '필수' : '선택'}
                      <p className="help">{field.hint}</p>
                    </li>
                  ))}
                </ol>
              </details>
              <h3>
                {comparison.data.fromVersion === comparison.data.toVersion
                  ? '초기 게시본'
                  : `v${comparison.data.fromVersion} 대비 변경`}
              </h3>
              <ChangeList changes={comparison.data.changes} />
            </>
          )
        )}
      </Modal>
    </div>
  );
}
