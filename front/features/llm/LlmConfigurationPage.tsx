'use client';

import { useState } from 'react';
import { useSession } from '@/features/auth';
import {
  Badge,
  ErrorState,
  ListPager,
  LoadingState,
  Modal,
  Notice,
  PageHeading,
} from '@/components/ui';
import { LlmConfigurationEditor } from './LlmConfigurationEditor';
import { LlmConfigurationContent } from './LlmConfigurationContent';
import { useLlmConfigurations, useLlmHistory } from './useLlmConfigurations';
import {
  historyLabels,
  purposeLabels,
  type LlmConfiguration,
  type LlmHistory,
} from './configurationTypes';

/** 관리자 역할을 확인한 뒤 모델 구성 조회를 시작한다. */
export function LlmConfigurationPage() {
  const session = useSession();
  if (session.isPending) return <LoadingState />;
  if (session.data?.member.role !== 'ADMIN')
    return <Notice tone="warning">기관 관리자만 AI 모델 구성을 관리할 수 있습니다.</Notice>;
  return <LlmManager key={session.data.member.id} />;
}
function LlmManager() {
  const query = useLlmConfigurations();
  const [editor, setEditor] = useState<{
    initial: LlmConfiguration | null;
    restore?: LlmHistory;
  } | null>(null);
  const [history, setHistory] = useState<LlmConfiguration | null>(null);
  const [message, setMessage] = useState('');
  if (query.isPending) return <LoadingState />;
  if (!query.data) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const { list, management } = query.data;
  return (
    <>
      <PageHeading
        title="AI 모델 구성"
        description="용도별 모델을 확인하고 연결 시험·변경 비교 후 적용하세요. 과거 설정은 이력에서 복원할 수 있습니다."
      />
      {message && (
        <div role="status">
          <Notice tone="success">{message}</Notice>
        </div>
      )}
      {query.isError && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
      {management.mode === 'FAKE' && (
        <Notice tone="warning">
          현재 업무 AI는 시연 응답 모드입니다. 설정을 바꿔도 업무에 실제 모델을 호출하지 않습니다.
          실제 서버의 연결 시험 버튼은 실제 연결을 시험합니다.
        </Notice>
      )}
      <section className="card">
        <h2 className="h-panel">용도별 현재 선택</h2>
        <p>
          활성 여부·우선순위·키 설정·허용 주소를 기준으로 다음 호출에 사용할 구성을 표시합니다. 연결
          성공 여부와는 구분됩니다.
        </p>
        <div className="knowledge-grid">
          {management.routes.map((route) => (
            <div className="card" key={route.purpose}>
              <h3>{purposeLabels[route.purpose]}</h3>
              <p>
                {route.status === 'SIMULATED'
                  ? '시연 응답'
                  : (route.modelReference ?? '사용 가능한 모델 없음')}
              </p>
              <Badge tone={route.status === 'READY' ? 'success' : 'warning'}>
                {route.status === 'READY'
                  ? '선택됨'
                  : route.status === 'SIMULATED'
                    ? '시연 모드'
                    : '설정 확인 필요'}
              </Badge>
            </div>
          ))}
        </div>
      </section>
      <div className="knowledge-publish-bar">
        <h2>등록된 모델 구성 · {list.length}개</h2>
        <div className="llm-actions">
          <button className="btn" disabled={query.isFetching} onClick={() => void query.refetch()}>
            새로고침
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              setMessage('');
              setEditor({ initial: null });
            }}
          >
            모델 구성 추가
          </button>
        </div>
      </div>
      {!list.length && <Notice>등록된 모델 구성이 없습니다. 연결할 모델을 추가하세요.</Notice>}
      <ul className="knowledge-list">
        {list.map((item) => (
          <li key={item.llmConfigurationId}>
            <div>
              <h3>{item.name}</h3>
              <p>{item.model}</p>
              <p>
                {item.purposes.map((p) => purposeLabels[p]).join(' · ')} · 우선순위 {item.priority}
              </p>
              <Badge tone={item.active ? 'success' : 'neutral'}>
                {item.active ? '사용' : '사용 중지'}
              </Badge>{' '}
              <Badge tone={item.keyConfigured ? 'neutral' : 'warning'}>
                {item.keyConfigured ? '키 설정됨' : '키 미설정'}
              </Badge>
            </div>
            <button
              className="btn"
              aria-label={`${item.name} 편집`}
              onClick={() => {
                setMessage('');
                setEditor({ initial: item });
              }}
            >
              편집·연결 시험
            </button>
            <button
              className="btn"
              aria-label={`${item.name} 변경 이력`}
              onClick={() => setHistory(item)}
            >
              변경 이력
            </button>
          </li>
        ))}
      </ul>
      {editor && (
        <LlmConfigurationEditor
          key={`${editor.initial?.llmConfigurationId ?? 'new'}-${editor.restore?.historyId ?? ''}`}
          initial={editor.initial}
          restore={editor.restore}
          management={management}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            setMessage('모델 구성을 적용했습니다. 이후 AI 호출부터 변경된 설정을 사용합니다.');
          }}
        />
      )}
      {history && (
        <LlmHistoryDialog
          item={history}
          onClose={() => setHistory(null)}
          onRestore={(record) => {
            setEditor({
              initial:
                list.find((c) => c.llmConfigurationId === history.llmConfigurationId) ?? history,
              restore: record,
            });
            setHistory(null);
          }}
        />
      )}
    </>
  );
}
function LlmHistoryDialog({
  item,
  onClose,
  onRestore,
}: {
  item: LlmConfiguration;
  onClose: () => void;
  onRestore: (history: LlmHistory) => void;
}) {
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<LlmHistory | null>(null);
  const query = useLlmHistory(item.llmConfigurationId, page);
  return (
    <Modal open title={`${item.name} 변경 이력`} onClose={onClose}>
      <p>과거 기록은 수정하지 않습니다. 복원은 현재 버전을 확인하고 새 변경 이력으로 남깁니다.</p>
      {query.isPending ? (
        <LoadingState />
      ) : !query.data ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <ul className="knowledge-list">
            {query.data.content.map((h) => (
              <li key={h.historyId}>
                <div>
                  <strong>
                    {historyLabels[h.action] ?? h.action} · 버전 {h.configurationRevision}
                  </strong>
                  <p>
                    {new Date(h.changedAt).toLocaleString('ko-KR')} · {h.changedBy}
                  </p>
                  <p>{h.reason || '변경 사유 없음'}</p>
                </div>
                <button className="btn" onClick={() => setSelected(h)}>
                  이력 #{h.historyId} 상세
                </button>
              </li>
            ))}
          </ul>
          <ListPager
            page={page}
            size={10}
            total={query.data.totalElements}
            onChange={(p) => {
              setPage(p);
              setSelected(null);
            }}
            label="모델 변경 이력 페이지"
          />
        </>
      )}
      {selected && (
        <section className="card">
          <h3>이력 #{selected.historyId}의 구성</h3>
          <LlmConfigurationContent values={selected.values} />
          <button className="btn btn-primary" onClick={() => onRestore(selected)}>
            이 값으로 복원 검토
          </button>
        </section>
      )}
      <button className="btn" onClick={onClose}>
        닫기
      </button>
    </Modal>
  );
}
