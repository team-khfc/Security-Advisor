'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Icon, LoadingState, Modal, Notice, PageHeading } from '@/components/ui';
import { useSession } from '@/features/auth';
import { useInputDraft } from '@/lib/inputDrafts';
import type { Actor } from '@/lib/types';
import { rememberUpload, rememberInitialAnalysis, validateUploadFiles } from '@/lib/uploadDraft';
import { DOCUMENT_LABELS, type DocumentType } from './types';
import { useCreateCase, useAnalysis } from './useRequests';

/** 시안의 파일 선택 화면에서 시작 의도를 확인한 뒤 사업 정보를 입력받는다. */
export function NewRequest() {
  const session = useSession();
  if (session.isPending) return <LoadingState />;
  if (session.data?.member.role !== 'APPLICANT')
    return (
      <>
        <PageHeading title="새 신청" />
        <Notice tone="warning">일반 사용자로 로그인하면 새 사업을 신청할 수 있습니다.</Notice>
      </>
    );
  return (
    <NewRequestForm
      key={session.data.member.id}
      actor={session.data.member}
      mock={session.data.mock}
    />
  );
}

interface NewCaseDraft {
  files?: File[];
  title: string;
  department: string;
  description: string;
  docTypes: DocumentType[];
}

type StartMode = 'conversation' | 'file';

function NewRequestForm({ actor, mock }: { actor: Actor; mock: boolean }) {
  const router = useRouter();
  const create = useCreateCase();
  const analysis = useAnalysis();
  const [preparing, setPreparing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState('');
  const busy = create.isPending || preparing;
  const inputRef = useRef<HTMLInputElement>(null);
  const pickButton = useRef<HTMLButtonElement>(null);
  const startTrigger = useRef<HTMLButtonElement | null>(null);
  const submitting = useRef(false);
  const { draft, saveDraft, clearDraft } = useInputDraft<NewCaseDraft>(actor.id, 'new-case');
  const values: NewCaseDraft = draft ?? {
    title: '',
    department: mock ? actor.department : '',
    description: '',
    docTypes: ['FIREWALL', 'SECURITY_REVIEW'],
  };
  const { title, department, description, docTypes } = values;
  const files = values.files ?? [];
  const update = (change: Partial<NewCaseDraft>) => saveDraft({ ...values, ...change });
  const [startMode, setStartMode] = useState<StartMode | null>(null);
  const [error, setError] = useState('');
  const [fileError, setFileError] = useState('');
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (startMode === null) startTrigger.current?.focus();
  }, [startMode]);

  const selectFiles = (selected: FileList | null) => {
    if (!selected?.length) return;
    const next = [...files, ...Array.from(selected)];
    const message = validateUploadFiles(next);
    setFileError(message);
    if (!message) update({ files: next });
  };

  const openStart = (mode: StartMode, trigger: HTMLButtonElement) => {
    if (busy || submitting.current) return;
    startTrigger.current = trigger;
    setError('');
    setStartMode(mode);
  };
  const closeStart = () => {
    if (busy || submitting.current) return;
    setStartMode(null);
    setError('');
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || submitting.current || !startMode) return;
    setError('');
    if (!title.trim()) {
      setError('사업명을 입력해 주세요.');
      return;
    }
    if (!docTypes.length) {
      setError('신청할 서류를 한 가지 이상 선택해 주세요.');
      return;
    }
    if (!department.trim()) {
      setError('담당 부서를 입력해 주세요.');
      return;
    }
    submitting.current = true;
    setPreparing(true);
    try {
      const result = await create.mutateAsync({
        title: title.trim(),
        department: department.trim(),
        description,
        docTypes,
      });
      // 대화로 시작한 경우에는 선택해 둔 파일을 자동 첨부하지 않는다.
      if (startMode === 'file' && files.length) {
        rememberUpload(actor.id, result.id, files);
        const failures: { name: string; message: string }[] = [];
        for (const [index, file] of files.entries()) {
          setAnalysisProgress(`문서 분석 중 ${index + 1}/${files.length}: ${file.name}`);
          try {
            await analysis.mutateAsync({
              caseId: result.id,
              expectedRevision: result.revision,
              text: description,
              file,
            });
          } catch (cause) {
            failures.push({
              name: file.name,
              message: cause instanceof Error ? cause.message : '문서 분석에 실패했습니다.',
            });
          }
        }
        rememberInitialAnalysis(actor.id, result.id, { total: files.length, failures });
      }
      clearDraft();
      router.push(`/cases/${encodeURIComponent(result.id)}`);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : '사업 건을 만들지 못했습니다. 다시 시도해 주세요.',
      );
    } finally {
      submitting.current = false;
      setPreparing(false);
      setAnalysisProgress('');
    }
  };

  return (
    <div className="new-request-page">
      <PageHeading title="새 신청" />
      <section className="intake new-case-intake" aria-labelledby="intake-heading">
        <div
          className={`dropzone${dragging ? ' drag' : ''}`}
          onDragOver={(event) => {
            event.preventDefault();
            if (!busy) setDragging(true);
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null))
              setDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            if (!busy) selectFiles(event.dataTransfer.files);
          }}
        >
          <span className="dz-ic" aria-hidden="true">
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 15V4M7.5 8.5L12 4l4.5 4.5" />
              <path d="M4 14v4a2 2 0 002 2h12a2 2 0 002-2v-4" />
            </svg>
          </span>
          <h2 className="h-panel" id="intake-heading">
            기획서를 끌어다 놓으세요
          </h2>
          <p className="help">기획서, 구성도, 요구사항 정의서를 올릴 수 있습니다.</p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.hwpx,.docx,.txt"
            className="sr-only"
            tabIndex={-1}
            aria-label="기획서 파일"
            onChange={(event) => {
              selectFiles(event.currentTarget.files);
              event.currentTarget.value = '';
            }}
          />
          <button
            ref={pickButton}
            type="button"
            className="btn"
            aria-describedby="file-help"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            파일 선택
          </button>
          <p className="help" id="file-help">
            PDF, HWPX, DOCX, TXT 파일, 최대 3개 · 파일당 20MB · 합계 60MB
          </p>
          {fileError && (
            <p className="ferr" role="alert">
              {fileError}
            </p>
          )}
          {files.length > 0 && (
            <>
              <ul className="pend" aria-label="분석 전 파일">
                {files.map((file, index) => (
                  <li key={`${file.name}-${index}`}>
                    <Icon name="file" size={18} />
                    <span className="pn" title={file.name}>
                      {file.name}
                    </span>
                    <span className="help">
                      {(file.name.split('.').pop() ?? '').toUpperCase()},{' '}
                      {file.size >= 1024 * 1024
                        ? `${(file.size / 1024 / 1024).toFixed(1)}MB`
                        : `${(file.size / 1024).toFixed(1)}KB`}
                    </span>
                    <span className="badge b-neutral">분석 전</span>
                    <button
                      type="button"
                      className="iedit-btn"
                      aria-label={`${file.name} 선택 취소`}
                      title="선택 취소"
                      disabled={busy}
                      onClick={() => {
                        update({ files: files.filter((_, fileIndex) => fileIndex !== index) });
                        setFileError('');
                        if (inputRef.current) inputRef.current.value = '';
                        pickButton.current?.focus();
                      }}
                    >
                      <Icon name="x" size={18} />
                    </button>
                  </li>
                ))}
              </ul>
              <p className="help">
                선택한 파일은 아직 전송되지 않았습니다. 신청 정보를 입력하고 ‘인터뷰 시작’을 누르면
                파일을 전송·분석한 뒤 인터뷰로 이동합니다.
              </p>
            </>
          )}
        </div>
        <div className="intake-actions new-case-actions">
          <button
            type="button"
            className="btn btn-tertiary"
            onClick={(event) => openStart('conversation', event.currentTarget)}
            disabled={busy}
          >
            기획서 없이 대화로 시작
          </button>
          {files.length > 0 && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={(event) => openStart('file', event.currentTarget)}
              disabled={busy}
            >
              기획서와 함께 작성 시작 ({files.length})
            </button>
          )}
        </div>
      </section>
      <Modal open={startMode !== null} onClose={closeStart} title="신청 정보 입력">
        {startMode && (
          <form
            className="new-case-start-form"
            onSubmit={(event) => {
              void submit(event);
            }}
            aria-busy={busy}
          >
            <p className="help">사업 정보를 입력하면 공통 인터뷰를 시작합니다.</p>
            <section className="card new-case-basics" aria-labelledby="case-title">
              <h2 className="h-panel" id="case-title">
                어떤 사업의 서류를 작성하시나요?
              </h2>
              <div className="form-two">
                <div className="field">
                  <label htmlFor="business-title">
                    사업명 <span className="required">(필수)</span>
                  </label>
                  <input
                    className="input"
                    id="business-title"
                    value={title}
                    onChange={(e) => update({ title: e.target.value })}
                    disabled={busy}
                    required
                    maxLength={120}
                    placeholder="예: 공공자료 안내 서비스 구축"
                  />
                </div>
                <div className="field">
                  <label htmlFor="business-department">
                    담당 부서 <span className="required">(필수)</span>
                  </label>
                  <input
                    className="input"
                    id="business-department"
                    value={department}
                    onChange={(e) => update({ department: e.target.value })}
                    required
                    disabled={busy}
                    maxLength={80}
                    placeholder="담당 부서명"
                  />
                </div>
              </div>
              <fieldset className="document-choice">
                <legend>
                  신청할 서류 <span className="required">(복수 선택 가능)</span>
                </legend>
                {(['FIREWALL', 'SECURITY_REVIEW'] as const).map((type) => (
                  <label
                    className={`document-option ${docTypes.includes(type) ? 'selected' : ''}`}
                    key={type}
                  >
                    <input
                      type="checkbox"
                      checked={docTypes.includes(type)}
                      disabled={busy}
                      onChange={(e) =>
                        update({
                          docTypes: e.target.checked
                            ? [...docTypes, type]
                            : docTypes.filter((item) => item !== type),
                        })
                      }
                    />
                    <Icon name={type === 'FIREWALL' ? 'shield' : 'file'} />
                    <span>
                      <strong>{DOCUMENT_LABELS[type]}</strong>
                      <small>
                        {type === 'FIREWALL'
                          ? '시스템 간 통신 허용을 요청해요'
                          : '사업의 정보보안 사항을 검토해요'}
                      </small>
                    </span>
                  </label>
                ))}
              </fieldset>
              <p className="help">
                공통 정보는 한 번만 작성합니다. 이후 협의·제출·확정은 서류마다 독립적으로
                진행됩니다.
              </p>
            </section>
            <details className="sub-block">
              <summary>기획서 없이 사업 개요 직접 입력</summary>
              <div className="field">
                <label htmlFor="business-description">사업 개요</label>
                <textarea
                  className="input"
                  id="business-description"
                  value={description}
                  onChange={(e) => update({ description: e.target.value })}
                  disabled={busy}
                  maxLength={4000}
                  rows={4}
                  placeholder="어떤 업무를 위해 어떤 서비스를 만드는지 알려주세요."
                />
              </div>
            </details>

            {startMode === 'file' && files.length > 0 && (
              <p className="help">
                선택한 기획서: <strong>{files.map((file) => file.name).join(', ')}</strong>
              </p>
            )}
            {startMode === 'file' && (
              <p className="help">
                인터뷰를 시작하면 첨부 문서를 AI로 분석합니다. 완료된 분석 요약은 보안정보 도우미가
                미확정 참고자료로 사용합니다.
              </p>
            )}
            {analysisProgress && (
              <p role="status">{analysisProgress} · 분석이 끝날 때까지 이 화면을 유지해 주세요.</p>
            )}
            {error && <Notice tone="danger">{error}</Notice>}
            {draft && (
              <p className="help" role="status">
                저장하지 않은 입력은 이 탭에서 같은 계정으로 돌아오면 복원됩니다. 새로고침하거나
                탭을 닫으면 사라집니다.
              </p>
            )}
            <p className="help">AI는 초안을 제안하며 최종 판단은 사람이 합니다.</p>
            <div className="dlg-actions">
              <button
                type="button"
                className="btn btn-tertiary"
                disabled={busy}
                onClick={closeStart}
              >
                취소
              </button>
              <button className="btn btn-primary" disabled={busy}>
                {busy ? (analysisProgress ? '문서 분석 중…' : '사업 건 생성 중…') : '인터뷰 시작'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
