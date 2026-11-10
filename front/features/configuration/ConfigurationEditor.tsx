import { useEffect, useState } from 'react';
import { Badge, ErrorState, Field, LoadingState, Modal, Notice } from '@/components/ui';
import { ApiError } from '@/lib/httpClient';
import { QuestionEditor } from './QuestionEditor';
import { DeadlineEditor } from './DeadlineEditor';
import { PublicationHistory } from './PublicationHistory';
import { ChangeList } from './ChangeList';
import { useConfigurationActions, usePublication } from './useConfiguration';
import {
  validateSettings,
  roleLabels,
  typeLabels,
  type Comparison,
  type Configuration,
} from './types';

const tabs = ['인터뷰 질문', '검토 절차', '문서 양식', '처리 기한·공휴일', '설정 버전'];

/** 편집 사본과 서버 사본을 분리하여 재조회·충돌 때 사용자의 입력을 덮어쓰지 않는다. */
export function ConfigurationEditor({
  initial,
  reload,
}: {
  initial: Configuration;
  reload: () => Promise<Configuration>;
}) {
  const [base, setBase] = useState(initial);
  const [draft, setDraft] = useState(initial.draft);
  const [note, setNote] = useState(initial.note ?? '');
  const [active, setActive] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [review, setReview] = useState<Comparison | null>(null);
  const [conflict, setConflict] = useState(false);
  const [latest, setLatest] = useState<Configuration | null>(null);
  const [restore, setRestore] = useState(false);
  const [loadingLatest, setLoadingLatest] = useState(false);
  const publication = usePublication('current');
  const actions = useConfigurationActions();
  const dirty = JSON.stringify(draft) !== JSON.stringify(base.draft) || note !== (base.note ?? '');
  const different =
    publication.data && JSON.stringify(draft) !== JSON.stringify(publication.data.fieldSchema);
  const busy =
    actions.save.isPending ||
    actions.compare.isPending ||
    actions.publish.isPending ||
    loadingLatest;

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function load(value: Configuration) {
    setBase(value);
    setDraft(value.draft);
    setNote(value.note ?? '');
    setConflict(false);
    setErrors([]);
    setLatest(null);
    setReview(null);
  }
  function fail(error: unknown) {
    setErrors([
      error instanceof Error ? error.message : '처리하지 못했습니다. 다시 시도해 주세요.',
    ]);
    if (error instanceof ApiError && error.status === 409) {
      setConflict(true);
      setReview(null);
    }
  }
  async function save() {
    setMessage('');
    const issues = validateSettings(
      draft,
      note,
      base.builtInFields.map((field) => field.key),
    );
    setErrors(issues);
    if (issues.length) {
      document.getElementById('configuration-errors')?.focus();
      return;
    }
    try {
      load(
        await actions.save.mutateAsync({
          id: base.configurationId,
          draft,
          note,
          expectedRevision: base.revision,
        }),
      );
      setMessage('설정 초안을 저장했습니다. 게시 전까지 운영에는 반영되지 않습니다.');
    } catch (error) {
      fail(error);
    }
  }
  async function compare() {
    setErrors([]);
    setMessage('');
    try {
      const value = await actions.compare.mutateAsync(base.configurationId);
      if (value.revision !== base.revision) {
        setConflict(true);
        setErrors(['다른 관리자가 초안을 변경했습니다. 최신 초안을 확인해 주세요.']);
        return;
      }
      setReview(value);
    } catch (error) {
      fail(error);
    }
  }
  async function publish() {
    if (!review || review.revision === null) return;
    try {
      const result = await actions.publish.mutateAsync({
        id: base.configurationId,
        expectedRevision: review.revision,
      });
      setReview(null);
      load(await reload());
      setMessage(`게시본 v${result.version}을 게시했습니다. 새 사업 건부터 적용됩니다.`);
    } catch (error) {
      fail(error);
    }
  }
  return (
    <div className="configuration-editor">
      <div className="verbar">
        <Badge tone={dirty || different ? 'warning' : 'neutral'}>
          {dirty
            ? '저장하지 않은 입력'
            : publication.isPending
              ? '게시본 비교 중'
              : different
                ? '저장된 수정 초안'
                : '게시본과 같음'}
        </Badge>
        <span className="help">
          최근 저장: {base.updatedBy} · {new Date(base.updatedAt).toLocaleString('ko-KR')}
        </span>
      </div>
      {message && (
        <div role="status">
          <Notice tone="success">{message}</Notice>
        </div>
      )}
      <div id="configuration-errors" tabIndex={-1}>
        {errors.length > 0 && (
          <Notice tone="danger">
            <ul>
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </Notice>
        )}
      </div>
      {conflict && (
        <Notice tone="warning">
          <p>
            입력한 내용은 이 화면에 보존했습니다. 최신 초안을 확인하기 전에는 저장·게시할 수
            없습니다.
          </p>
          <button
            className="btn"
            type="button"
            disabled={busy}
            onClick={async () => {
              setLoadingLatest(true);
              try {
                setLatest(await reload());
              } catch (error) {
                fail(error);
              } finally {
                setLoadingLatest(false);
              }
            }}
          >
            최신 초안 확인
          </button>
        </Notice>
      )}
      <div className="tabs" role="tablist" aria-label="기관 설정 항목">
        {tabs.map((tab, index) => (
          <button
            type="button"
            role="tab"
            id={`setting-tab-${index}`}
            aria-selected={active === index}
            aria-controls={`setting-panel-${index}`}
            tabIndex={active === index ? 0 : -1}
            key={tab}
            onClick={() => setActive(index)}
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? tabs.length - 1
                    : (active + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
              setActive(next);
              document.getElementById(`setting-tab-${next}`)?.focus();
            }}
          >
            {tab}
          </button>
        ))}
      </div>
      <section
        role="tabpanel"
        id={`setting-panel-${active}`}
        aria-labelledby={`setting-tab-${active}`}
        tabIndex={0}
      >
        <fieldset className="configuration-inputs" disabled={busy}>
          <legend className="sr-only">설정 초안 편집</legend>
          {active === 0 && (
            <QuestionEditor
              draft={draft}
              builtIns={base.builtInFields}
              savedFields={base.draft.fields}
              publishedKeys={
                publication.data?.fieldSchema.fields.map((field) => field.key) ??
                base.draft.fields.map((field) => field.key)
              }
              onChange={setDraft}
            />
          )}
          {active === 1 && (
            <div className="card">
              <h2 className="h-panel">기관 검토 절차</h2>
              <p>ICT인프라 선행 고정</p>
              <ol className="flow">
                {['작성', 'ICT인프라 협의', '정보보안 협의', '사용자 최종 검토', '확정·관리'].map(
                  (step) => (
                    <li key={step}>{step}</li>
                  ),
                )}
              </ol>
              <p className="help">
                검토 절차는 업무 규칙에 따라 운영하며 이번 편집 대상에 포함되지 않습니다.
              </p>
            </div>
          )}
          {active === 2 && (
            <div className="card">
              <h2 className="h-panel">서버 문서 양식</h2>
              <ul>
                {draft.docTypes.map((doc) => (
                  <li key={doc.code}>
                    {doc.name} ·{' '}
                    {doc.exportFormats
                      .map((format) => (format === 'PDF' ? 'PDF' : '마크다운'))
                      .join(', ')}
                  </li>
                ))}
              </ul>
              <p>
                문서 미리보기와 다운로드는 신청에 고정된 게시본의 정식 문서를 사용합니다. 양식 파일
                편집은 제공하지 않습니다.
              </p>
            </div>
          )}
          {active === 3 && <DeadlineEditor draft={draft} onChange={setDraft} />}
        </fieldset>
        {active === 4 && <PublicationHistory currentVersion={initial.currentPublishedVersion} />}
      </section>
      {active !== 4 && (
        <>
          <Field
            label="변경 메모"
            htmlFor="configuration-note"
            hint="이 메모는 게시 시 게시 이력에 함께 남습니다(선택, 500자 이하)."
          >
            <textarea
              className="input"
              id="configuration-note"
              maxLength={500}
              disabled={busy}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
          {publication.isError && (
            <ErrorState error={publication.error} onRetry={() => void publication.refetch()} />
          )}
          <p className="help" id="configuration-action-help">
            {dirty
              ? '먼저 초안을 저장하면 변경 내용을 검토하고 게시할 수 있습니다.'
              : !different
                ? '게시본과 다른 내용이 없어 게시할 내용이 없습니다.'
                : '저장된 초안의 변경 내용을 확인한 뒤 게시하세요.'}
          </p>
          <div className="actions">
            <button
              type="button"
              className="btn btn-tertiary"
              disabled={busy || conflict || !different || !publication.data}
              onClick={() => setRestore(true)}
            >
              게시본으로 초안 되돌리기
            </button>
            <div className="btn-row">
              <button
                type="button"
                className="btn"
                disabled={busy || conflict || !dirty}
                aria-describedby="configuration-action-help"
                onClick={() => void save()}
              >
                설정 초안 저장
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || conflict || dirty || !different || !publication.data}
                aria-describedby="configuration-action-help"
                onClick={() => void compare()}
              >
                변경 검토·게시
              </button>
            </div>
          </div>
        </>
      )}
      <Modal
        open={review !== null}
        title="변경 검토·게시"
        onClose={() => {
          if (!busy) setReview(null);
        }}
      >
        {review && (
          <>
            <p>
              게시본 v{review.fromVersion}에서 아래 내용이 바뀝니다. 새 사업 건부터 적용되며 기존
              사업 건의 질문·기한은 유지됩니다.
            </p>
            <p>변경 메모: {base.note || '없음'}</p>
            <ChangeList changes={review.changes} />
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || !review.changes.length}
              onClick={() => void publish()}
            >
              {actions.publish.isPending ? '게시 중…' : `v${review.fromVersion + 1} 게시`}
            </button>
          </>
        )}
      </Modal>
      <Modal open={restore} title="초안을 게시본으로 되돌리기" onClose={() => setRestore(false)}>
        <p>
          현재 화면의 편집 내용을 게시본으로 바꿉니다. 초안 저장 전까지 서버의 초안은 유지됩니다.
        </p>
        <button
          type="button"
          className="btn"
          onClick={() => {
            if (publication.data) setDraft(publication.data.fieldSchema);
            setRestore(false);
            setMessage('게시본을 불러왔습니다. 초안에 반영하려면 저장하세요.');
          }}
        >
          게시본 불러오기
        </button>
      </Modal>
      <Modal
        open={latest !== null}
        title="최신 초안과 내 입력 확인"
        onClose={() => setLatest(null)}
      >
        {latest ? (
          <>
            <p>
              최신 저장자: {latest.updatedBy}. 아래 두 내용을 비교하세요. 닫으면 내 입력을 계속
              보존합니다.
            </p>
            <div className="configuration-conflict">
              <section>
                <h3>내 입력</h3>
                <DraftSummary configuration={{ ...base, draft, note }} />
              </section>
              <section>
                <h3>서버 최신 초안</h3>
                <DraftSummary configuration={latest} />
              </section>
            </div>
            <p>
              최신본으로 다시 편집하면 현재 입력을 대체합니다. 필요한 내용은 위에서 먼저 복사하세요.
            </p>
            <button
              className="btn"
              type="button"
              onClick={() => {
                load(latest);
                setMessage('최신 초안을 불러왔습니다. 필요한 변경을 다시 입력하고 저장하세요.');
              }}
            >
              내 입력을 대체하고 최신본으로 편집
            </button>
          </>
        ) : (
          <LoadingState />
        )}
      </Modal>
    </div>
  );
}

function DraftSummary({ configuration }: { configuration: Configuration }) {
  return (
    <>
      <p>
        협의 {configuration.draft.deadlinePolicy.reviewBusinessDays}일 · 보완{' '}
        {configuration.draft.deadlinePolicy.supplementBusinessDays}일 · 최종 확정{' '}
        {configuration.draft.deadlinePolicy.finalConfirmationBusinessDays}일
      </p>
      <p>공휴일: {configuration.draft.deadlinePolicy.holidays.join(', ')}</p>
      <p>메모: {configuration.note || '없음'}</p>
      <ol>
        {configuration.draft.fields.map((field) => (
          <li key={field.key}>
            <b>{field.label}</b>
            <p>{field.hint}</p>
            <span className="help">
              {field.key} · {field.required ? '필수' : '선택'}
            </span>
            <p className="help">
              {typeLabels[field.type]} · {roleLabels[field.askRole]} ·{' '}
              {field.scope === 'CASE' ? '사업 공통 정보' : '서류별 정보'} ·{' '}
              {field.docTypes.length
                ? field.docTypes
                    .map(
                      (code) =>
                        configuration.draft.docTypes.find((doc) => doc.code === code)?.name ?? code,
                    )
                    .join(', ')
                : '모든 서류'}
            </p>
          </li>
        ))}
      </ol>
    </>
  );
}
