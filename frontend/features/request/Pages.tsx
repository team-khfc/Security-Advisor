'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession, useMemoryDraft } from '@/features/auth';
import { requestSchema, type SecurityRequest } from './types';
import { requestJson } from '@/lib/http';
import { writeDraft } from '@/lib/draft';
import { documentLabel, formatDate, shortId, stepPath } from '@/lib/format';
import {
  Heading,
  Badge,
  Notice,
  ErrorNotice,
  Loading,
  Icon,
  Stepper,
  FormHelp,
  Modal,
  Empty,
} from '@/components/ui';
import { useRequests, useRequest, useRequestMutation } from './useRequests';
import { WorkspaceView, RequestsView, DEFAULT_REQUEST_FILTERS } from './Overview';
import { AnswerEditor } from './AnswerEditor';
import { AnalysisPage, validateAnalysisFile } from './Analysis';
import { CollectedInformation, DetailView } from './Details';
import {
  ReviewPanel,
  SubmitPanel,
  ReviewProgress,
  WorkflowActions,
  ReturnNotice,
  TerminalNotice,
} from '@/features/review';
import { DocumentPanel } from '@/features/document';
import { FinalDraftPanel, StaffAssistant } from '@/features/llm';
import { NetworkEditor, NetworkTable } from './Network';

/** 기관 관리자의 설정 업무와 일반 업무 목록을 구분하여 불필요한 신청 조회를 하지 않는다. */
export function WorkspacePage() {
  const session = useSession();
  const requests = useRequests(session.user.role !== 'ADMIN');
  if (session.user.role === 'ADMIN')
    return (
      <>
        <Heading
          title="기관 운영 한눈에 보기"
          description="질문과 검토 절차를 준비하고 새 신청부터 적용하세요."
        />
        <div className="workspace-intro">
          <span className="workspace-intro-icon">
            <Icon name="settings" width={30} height={30} />
          </span>
          <div>
            <h2>기관의 절차에 맞게, 담당자의 판단을 돕습니다.</h2>
            <p>설정 초안과 게시본을 구분하고, 기존 신청의 적용 버전을 유지합니다.</p>
          </div>
        </div>
        <div className="document-grid">
          {[
            ['questions', '인터뷰 질문', '역할별 추가 질문과 작성 이유를 정리합니다.'],
            ['workflow', '검토 절차', 'ICT인프라 선행 고정 절차와 양측 검토를 확인합니다.'],
            ['versions', '설정 게시', '초안을 검토하고 게시 이력을 확인합니다.'],
            ['models', 'AI 모델 연결', '예시 분석과 실제 연결을 명확히 구분합니다.'],
            ['context', '기관 컨텍스트', '기관 내부 참고 정보를 공개 지식과 분리합니다.'],
          ].map(([path, title, body]) => (
            <section className="sf-panel" key={path}>
              <h2>{title}</h2>
              <p>{body}</p>
              <Link className="text-button" href={`/admin/${path}`}>
                관리하기
                <Icon name="arrow" />
              </Link>
            </section>
          ))}
        </div>
      </>
    );
  if (requests.isPending) return <Loading />;
  if (requests.error)
    return <ErrorNotice error={requests.error} retry={() => void requests.refetch()} />;
  return (
    <WorkspaceView
      items={requests.data}
      role={session.user.role}
      institutionName={session.institutionName}
    />
  );
}
/** 인증된 사용자별 조회 문맥을 유지하고 서버 목록 조회 권한을 확대하지 않는다. */
export function RequestsPage({ initialQuery = '' }: { initialQuery?: string }) {
  const { user } = useSession();
  const [filters, setFilters] = useMemoryDraft(`request-list-filters:${initialQuery}`, {
    ...DEFAULT_REQUEST_FILTERS,
    query: initialQuery,
  });
  const query = useRequests(user.role !== 'ADMIN');
  if (user.role === 'ADMIN')
    return (
      <Notice>
        기관 관리자는 기관 설정을 관리합니다. 신청 내용은 업무 담당자 계정으로 확인해 주세요.
      </Notice>
    );
  if (query.isPending) return <Loading />;
  if (query.error) return <ErrorNotice error={query.error} retry={() => void query.refetch()} />;
  return (
    <RequestsView
      items={query.data}
      role={user.role}
      filters={filters}
      onFiltersChange={setFilters}
    />
  );
}

/** 실제 작성과 공개 시안이 같은 업로드 시작 화면을 쓰되 시안에서는 파일을 받지 않는다. */
export function NewRequestIntake({
  preview = false,
  error,
  onChooseFile,
  onFileDrop,
  onStart,
}: {
  preview?: boolean;
  error?: string;
  onChooseFile?: () => void;
  onFileDrop?: (files: FileList) => void;
  onStart?: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  return (
    <section className="intake" aria-labelledby="intake-title">
      <div
        className={`dropzone${dragging ? ' drag' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          if (!preview) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!preview) onFileDrop?.(event.dataTransfer.files);
        }}
      >
        <span className="dz-ic">
          <Icon name="upload" width={40} height={40} />
        </span>
        <h2 className="h-panel" id="intake-title">
          기획서를 끌어다 놓으세요
        </h2>
        <p className="help">기획서나 서비스 설명에서 필요한 보안정보를 함께 정리합니다.</p>
        {preview ? (
          <Link className="btn" href="/design-preview/analysis">
            자료 분석 시안 보기
          </Link>
        ) : (
          <button
            type="button"
            className="btn"
            onClick={onChooseFile}
            aria-describedby="intake-file-help"
          >
            파일 선택
          </button>
        )}
        <p className="help" id="intake-file-help">
          UTF-8 TXT·MD · 1MiB 이하 · 파일 1개
        </p>
        <p className="help">
          {preview
            ? '파일을 전송하지 않는 합성 시안입니다.'
            : '선택한 파일은 분석 시작을 누르기 전까지 전송되지 않습니다.'}
        </p>
      </div>
      {error && <Notice error>{error}</Notice>}
      <div className="intake-actions">
        {preview ? (
          <Link className="btn btn-tertiary" href="/design-preview/interview">
            기획서 없이 대화로 시작
          </Link>
        ) : (
          <button type="button" className="btn btn-tertiary" onClick={onStart}>
            기획서 없이 대화로 시작
          </button>
        )}
      </div>
    </section>
  );
}

/** 새 신청은 명시적 초안 생성에서만 서버에 저장하며 AI가 내부 사실을 채우지 않는다. */
export function CreatePage() {
  const { user } = useSession();
  const router = useRouter();
  const client = useQueryClient();
  const [draft, setDraft, clear] = useMemoryDraft('new-procedure', {
    title: '',
    documentType: 'FIREWALL',
    department: '',
    description: '',
  });
  const [material, setMaterial, clearMaterial] = useMemoryDraft<{ file?: File }>(
    'new-request-material',
    {},
  );
  const [started, setStarted] = useState(Boolean(draft.title || material.file));
  const [fileError, setFileError] = useState<string>();
  const fileRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  function begin() {
    setStarted(true);
    requestAnimationFrame(() => titleRef.current?.focus());
  }
  function chooseFile(file?: File) {
    if (!file) return;
    const issue = validateAnalysisFile(file);
    setFileError(issue ?? undefined);
    if (issue) return;
    setMaterial({ file });
    begin();
  }
  const mutation = useMutation({
    mutationFn: () =>
      requestJson('/security-requests', requestSchema, {
        method: 'POST',
        body: JSON.stringify(draft),
      }),
    onSuccess: (procedure) => {
      if (material.file) {
        writeDraft(`${user.institutionId}:${user.userId}`, `analysis-input:${procedure.id}`, {
          text: '',
          file: material.file,
        });
      }
      clear();
      clearMaterial();
      void client.invalidateQueries({ queryKey: ['requests'] });
      router.push(`/requests/${procedure.id}/${material.file ? 'analysis' : 'questions'}`);
    },
  });
  if (user.role !== 'APPLICANT')
    return <Notice>새 보안 신청은 일반 사용자 계정으로 작성해 주세요.</Notice>;
  return (
    <>
      <Heading title="새 신청" />
      <input
        ref={fileRef}
        className="file-native"
        type="file"
        accept=".txt,.md,text/plain,text/markdown"
        aria-label="사업 자료 파일 선택"
        disabled={mutation.isPending}
        onChange={(event) => {
          chooseFile(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      {!started ? (
        <NewRequestIntake
          error={fileError}
          onChooseFile={() => fileRef.current?.click()}
          onStart={begin}
          onFileDrop={(files) => {
            if (files.length > 1) {
              setFileError('한 번에 파일 1개를 선택해 주세요.');
              return;
            }
            chooseFile(files[0]);
          }}
        />
      ) : (
        <div className="request-setup intake">
          <section className="docbar" aria-label="첨부 문서">
            <div className="docbar-in">
              <div className="dchips">
                <Icon name="file" />
                <span>{material.file?.name ?? '기획서 없이 대화로 작성합니다.'}</span>
                {material.file && <Badge>선택됨 · 아직 전송하지 않음</Badge>}
              </div>
              <div className="btn-row">
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={mutation.isPending}
                  onClick={() => fileRef.current?.click()}
                >
                  {material.file ? '파일 변경' : '문서 추가'}
                </button>
                {material.file && (
                  <button
                    type="button"
                    className="btn btn-tertiary btn-sm"
                    disabled={mutation.isPending}
                    onClick={() => setMaterial({})}
                  >
                    파일 빼기
                  </button>
                )}
              </div>
            </div>
          </section>
          {fileError && <Notice error>{fileError}</Notice>}
          <form
            className="form-main"
            onSubmit={(event) => {
              event.preventDefault();
              mutation.mutate();
            }}
          >
            <section className="card form-panel">
              <div className="card-h">
                <div>
                  <h2 className="h-panel">먼저 신청 정보를 알려 주세요</h2>
                  <p className="help">
                    사업 정보를 저장한 뒤{' '}
                    {material.file
                      ? '자료 분석과 질문을 이어갑니다.'
                      : '도우미와 질문을 이어갑니다.'}
                  </p>
                </div>
              </div>
              <ErrorNotice error={mutation.error} />
              <div className="sf-field">
                <label id="document-type-label">
                  작성할 서류 <span className="required">필수</span>
                </label>
                <div
                  className="document-choice"
                  role="radiogroup"
                  aria-labelledby="document-type-label"
                >
                  {[
                    ['FIREWALL', '방화벽 신청서', '서비스·시스템 간 통신이 필요할 때'],
                    ['SECURITY_REVIEW', '보안성검토 신청서', '정보화 사업의 보안 요건을 검토할 때'],
                  ].map(([value, label, description]) => (
                    <label key={value} className={draft.documentType === value ? 'selected' : ''}>
                      <input
                        type="radio"
                        name="document-type"
                        value={value}
                        checked={draft.documentType === value}
                        disabled={mutation.isPending}
                        onChange={() => setDraft({ ...draft, documentType: value })}
                      />
                      <span>
                        <strong>{label}</strong>
                        <small>{description}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="sf-field">
                <label htmlFor="project-title">
                  사업명 <span className="required">필수</span>
                </label>
                <p className="field-hint" id="title-hint">
                  어떤 사업인지 알 수 있는 이름을 입력해 주세요.
                </p>
                <input
                  ref={titleRef}
                  id="project-title"
                  required
                  maxLength={160}
                  aria-describedby="title-hint"
                  disabled={mutation.isPending}
                  value={draft.title}
                  onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                  placeholder="예: 공개 안내 챗봇 서비스 구축 (합성)"
                />
                <span className="char-count">{draft.title.length} / 160자</span>
              </div>
              <div className="sf-field">
                <label htmlFor="department">
                  신청 부서 <span className="required">필수</span>
                </label>
                <input
                  id="department"
                  required
                  maxLength={100}
                  disabled={mutation.isPending}
                  value={draft.department}
                  onChange={(event) => setDraft({ ...draft, department: event.target.value })}
                  placeholder="합성 부서명"
                />
              </div>
              <div className="sf-field">
                <label htmlFor="description">
                  서비스 설명 <span className="required">필수</span>
                </label>
                <p className="field-hint" id="description-hint">
                  이용 대상과 제공하려는 서비스, 현재 정해진 범위를 알려 주세요.
                </p>
                <textarea
                  id="description"
                  rows={6}
                  maxLength={20000}
                  required
                  aria-describedby="description-hint"
                  disabled={mutation.isPending}
                  value={draft.description}
                  onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                  placeholder="어떤 서비스를 누구에게 제공하고 싶나요?"
                />
                <span className="char-count">
                  {draft.description.length.toLocaleString()} / 20,000자
                </span>
              </div>
              <button
                type="button"
                className="text-button"
                disabled={mutation.isPending}
                onClick={() =>
                  setDraft({
                    ...draft,
                    title: '공개 주택연금 안내 챗봇 (합성)',
                    department: '디지털서비스팀 (합성)',
                    description:
                      '공개된 주택연금 안내 자료를 검색해 일반 국민에게 안내하는 챗봇을 준비합니다. 실제 개인정보와 내부 시스템 정보는 사용하지 않습니다. 합성 질문과 공개 FAQ로 시연합니다.',
                  })
                }
              >
                합성 작성 예시 채우기
              </button>
            </section>
            <div className="form-actions">
              <button className="button primary" type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? '초안 생성 중…' : '초안 생성 후 다음 단계'}
                <Icon name="arrow" />
              </button>
              <Link className="button subtle" href="/requests">
                <Icon name="back" />
                목록으로
              </Link>
            </div>
            <p className="save-status">초안 생성 버튼을 누르면 사업 정보를 서버에 저장합니다.</p>
          </form>
        </div>
      )}
    </>
  );
}
function QuestionsPage({ procedure }: { procedure: SecurityRequest }) {
  return (
    <>
      <Heading title={`${procedure.title} 이어서 작성`}>
        <Badge tone="blue">기관 설정 v{procedure.policyVersion}</Badge>
      </Heading>
      <TerminalNotice procedure={procedure} />
      <ReturnNotice procedure={procedure} />
      <section className="docbar" aria-label="자료와 분석">
        <div className="docbar-in">
          <span className="help">
            <Icon name="file" /> 자료를 분석하거나 알고 있는 내용을 직접 답할 수 있습니다.
          </span>
          <Link className="btn btn-sm" href={`/requests/${procedure.id}/analysis`}>
            문서·분석 결과
          </Link>
        </div>
      </section>
      <div className="work app-interview">
        <section className="chatp" aria-labelledby="interview-title">
          <div className="chatp-h">
            <div className="ttl">
              <span className="av" aria-hidden="true">
                AI
              </span>
              <h2 className="h-panel" id="interview-title">
                보안정보 도우미
              </h2>
            </div>
            <span className="meta">AI 답변은 제안이며 확정 전 확인이 필요합니다</span>
          </div>
          <div className="msgs" tabIndex={0} aria-label="질문과 답변 확인">
            <div className="m-ai">
              <span className="av" aria-hidden="true">
                AI
              </span>
              <div className="body">
                <div className="bubble">
                  <p>신청에 필요한 보안정보를 함께 정리해 드릴게요.</p>
                  <p>
                    각 질문의 이유와 원문 근거를 읽고 답변해 주세요. 모르는 서버·IP·포트는 담당자가
                    확인합니다.
                  </p>
                </div>
                <p className="m-src">기관 질문 템플릿 기반 안내</p>
              </div>
            </div>
            <div className="interview-answer-fields">
              <AnswerEditor procedure={procedure} />
            </div>
          </div>
        </section>
        <div className="work-divider" aria-hidden="true" />
        <CollectedInformation procedure={procedure}>
          <Link className="btn btn-primary btn-block" href={`/requests/${procedure.id}/summary`}>
            저장 내용 확인 후 협의 요청
          </Link>
          <p className="help">수정한 답변은 먼저 ‘답변·확인 상태 저장’을 눌러 주세요.</p>
        </CollectedInformation>
      </div>
    </>
  );
}
function SummaryPage({ procedure }: { procedure: SecurityRequest }) {
  const mutation = useRequestMutation(procedure.id);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  async function consult() {
    try {
      await mutation.mutateAsync({
        endpoint: '/consult',
        body: { expectedRevision: procedure.revision },
      });
      setOpen(false);
      router.push(`/requests/${procedure.id}/submit`);
    } catch {
      setOpen(false);
    }
  }
  return (
    <>
      <Heading
        title={procedure.status === 'DRAFT' ? '새 보안 신청' : '협의 요청 내용'}
        description="사업 정보와 확인된 내용을 정리해 담당자에게 전달합니다."
      >
        <Badge tone="blue">기관 설정 v{procedure.policyVersion}</Badge>
      </Heading>
      <Stepper
        current={procedure.stage - 1}
        returned={procedure.returnItems.some((item) => item.status === 'OPEN')}
      />
      <ReturnNotice procedure={procedure} />
      <TerminalNotice procedure={procedure} />
      <div className="form-layout">
        <div className="form-main">
          <section className="sf-panel form-panel">
            <div className="section-heading">
              <span className="section-num">04</span>
              <div>
                <h2>
                  {procedure.status === 'DRAFT'
                    ? '사전 협의를 요청할까요?'
                    : '저장된 협의 요청 내용'}
                </h2>
                <p>정보보안·ICT인프라 담당자가 필요한 전문 정보를 확인합니다.</p>
              </div>
            </div>
            <ErrorNotice error={mutation.error} />
            <dl className="summary-list">
              <div>
                <dt>사업명</dt>
                <dd>{procedure.title}</dd>
              </div>
              <div>
                <dt>신청자</dt>
                <dd>
                  {procedure.ownerName} · {procedure.department}
                </dd>
              </div>
              <div>
                <dt>요청 문서</dt>
                <dd>{documentLabel(procedure.documentType)}</dd>
              </div>
              <div>
                <dt>서비스 설명</dt>
                <dd>{procedure.description}</dd>
              </div>
              <div>
                <dt>기관 설정</dt>
                <dd>v{procedure.policyVersion} · ICT인프라 할당 → 정보보안 검토</dd>
              </div>
              <div>
                <dt>답변 확인</dt>
                <dd>
                  {
                    procedure.answers.filter((answer) =>
                      ['CONFIRMED', 'NOT_APPLICABLE'].includes(answer.status),
                    ).length
                  }
                  개 확인 ·{' '}
                  {
                    procedure.answers.filter(
                      (answer) => !['CONFIRMED', 'NOT_APPLICABLE'].includes(answer.status),
                    ).length
                  }
                  개 미확정
                </dd>
              </div>
            </dl>
            <Notice>
              이 단계는 담당자 사전 협의 요청입니다. 검토와 보완을 마친 후 최종 제출 화면에서
              제출본을 확정합니다.
            </Notice>
            {procedure.status === 'DRAFT' && !procedure.allowedActions.includes('CONSULT') && (
              <Notice error>사업 목적과 이용 대상을 입력하고 직접 확인한 후 저장해 주세요.</Notice>
            )}
          </section>
          <div className="form-actions">
            {procedure.status === 'DRAFT' ? (
              <button
                className="button primary"
                type="button"
                disabled={!procedure.allowedActions.includes('CONSULT') || mutation.isPending}
                onClick={() => setOpen(true)}
              >
                사전 협의 요청
                <Icon name="arrow" />
              </button>
            ) : (
              <Link className="button primary" href={`/requests/${procedure.id}/submit`}>
                협의 현황 확인
                <Icon name="arrow" />
              </Link>
            )}
            <Link className="button subtle" href={`/requests/${procedure.id}/questions`}>
              <Icon name="back" />
              기관별 질문
            </Link>
          </div>
        </div>
        <aside>
          <FormHelp />
          <WorkflowActions procedure={procedure} />
        </aside>
      </div>
      <Modal open={open} title="사전 협의 요청" onClose={() => setOpen(false)}>
        <p>
          {procedure.title}의 수정본 v{procedure.revision}을 기관의 정보보안·ICT인프라 담당자가 볼
          수 있도록 사전 협의를 요청합니다.
        </p>
        <Notice>
          부족한 전문 정보는 담당자가 보완합니다. 최종 제출 단계는 별도로 남아 있습니다.
        </Notice>
        <div className="dialog-actions">
          <button className="button" type="button" onClick={() => setOpen(false)}>
            취소
          </button>
          <button
            className="button primary"
            type="button"
            disabled={mutation.isPending}
            onClick={() => void consult()}
          >
            {mutation.isPending ? '요청 처리 중…' : '담당자 협의 시작'}
          </button>
        </div>
      </Modal>
    </>
  );
}
function SupplementEntry({ procedure, id }: { procedure: SecurityRequest; id: string }) {
  const entry = procedure.supplements.find((supplement) => supplement.id === id)!;
  const { user } = useSession();
  const mutation = useRequestMutation(procedure.id);
  const [answer, setAnswer] = useMemoryDraft(`supplement-answer:${id}`, entry.answer);
  const [open, setOpen] = useState(false);
  const mayAnswer =
    user.role === 'APPLICANT' &&
    procedure.allowedActions.includes('ANSWER') &&
    entry.status !== 'RESOLVED';
  const mayResolve =
    user.role === entry.requestedByRole &&
    procedure.allowedActions.includes('RESOLVE') &&
    entry.status === 'ANSWERED';
  async function submit(resolve = false) {
    try {
      await mutation.mutateAsync({
        endpoint: `/supplements/${id}/${resolve ? 'resolve' : 'answer'}`,
        body: { expectedRevision: procedure.revision, ...(!resolve ? { answer } : {}) },
      });
      setOpen(false);
    } catch {
      setOpen(false);
    }
  }
  return (
    <article className="supplement-item">
      <div className="row-between">
        <h3>{entry.requestedByRole === 'SECURITY' ? '정보보안' : 'ICT인프라'} 확인 요청</h3>
        <Badge tone={entry.status === 'RESOLVED' ? 'green' : 'amber'}>
          {entry.status === 'RESOLVED'
            ? '해소 확인'
            : entry.status === 'ANSWERED'
              ? '답변 완료 · 담당자 확인 대기'
              : '답변 필요'}
        </Badge>
      </div>
      <p>{entry.question}</p>
      <small>
        {entry.requestedBy} · {formatDate(entry.createdAt, true)}
      </small>
      <ErrorNotice error={mutation.error} />
      {mayAnswer ? (
        <>
          <label htmlFor={`supplement-${id}`}>보완 답변</label>
          <textarea
            id={`supplement-${id}`}
            rows={4}
            maxLength={4000}
            value={answer}
            disabled={mutation.isPending}
            onChange={(event) => setAnswer(event.target.value)}
          />
          <button
            className="button"
            type="button"
            disabled={!answer.trim() || mutation.isPending}
            onClick={() => void submit()}
          >
            보완 답변 저장
          </button>
        </>
      ) : entry.answer ? (
        <blockquote>{entry.answer}</blockquote>
      ) : (
        <p className="muted">신청자 답변을 기다리고 있습니다.</p>
      )}
      {mayResolve && (
        <button className="button" type="button" onClick={() => setOpen(true)}>
          답변 확인 후 보완 해소
        </button>
      )}
      <Modal open={open} title="보완 해소 확인" onClose={() => setOpen(false)}>
        <p>
          위 답변으로 요청한 정보가 충분히 확인되었나요? 보완 해소는 별도의 분야별 검토 완료와
          구분하여 기록합니다.
        </p>
        <div className="dialog-actions">
          <button className="button" type="button" onClick={() => setOpen(false)}>
            취소
          </button>
          <button
            className="button primary"
            type="button"
            disabled={mutation.isPending}
            onClick={() => void submit(true)}
          >
            보완 해소 기록
          </button>
        </div>
      </Modal>
    </article>
  );
}
function ReceiptPage({ procedure }: { procedure: SecurityRequest }) {
  const { user } = useSession();
  return (
    <DetailView
      procedure={procedure}
      step="receipt"
      aside={
        user.role === 'INFRA' || user.role === 'SECURITY' ? (
          <ReviewPanel procedure={procedure} role={user.role} />
        ) : (
          <SubmitPanel procedure={procedure} />
        )
      }
    >
      <section className="sf-panel">
        <div className="panel-heading">
          <h2>
            {procedure.status === 'CONFIRMED'
              ? '서류가 확정되었습니다'
              : procedure.stage === 4
                ? '양측 최종 확인을 진행합니다'
                : '신청 상태와 보관 이력'}
          </h2>
          <Badge tone={procedure.status === 'CONFIRMED' ? 'green' : 'blue'}>
            제출 차수 {procedure.submissionVersion}
          </Badge>
        </div>
        <Notice>
          정보보안·ICT인프라 양측의 최종 확인 후 서류를 확정합니다. 실제 방화벽 장비 적용이나 운영
          승인을 수행하지 않습니다.
        </Notice>
        <ReviewProgress procedure={procedure} />
      </section>
    </DetailView>
  );
}
/** 같은 신청 데이터를 단계별 화면으로 나누고 단계 링크만으로 업무 전이를 실행하지 않는다. */
export function RequestPage({ id, step }: { id: string; step: string }) {
  const query = useRequest(id);
  const { user } = useSession();
  if (query.isPending) return <Loading />;
  if (query.error) return <ErrorNotice error={query.error} retry={() => void query.refetch()} />;
  const procedure = query.data;
  if (step === 'analysis' && ['CLOSED', 'WITHDRAWN', 'CONFIRMED'].includes(procedure.status))
    return <ReceiptPage procedure={procedure} />;
  if (step === 'analysis') return <AnalysisPage procedure={procedure} />;
  if (step === 'questions') return <QuestionsPage procedure={procedure} />;
  if (step === 'summary') return <SummaryPage procedure={procedure} />;
  if (step === 'receipt') return <ReceiptPage procedure={procedure} />;
  if (step === 'security' || step === 'infra')
    return (
      <DetailView
        procedure={procedure}
        step={step}
        aside={
          <ReviewPanel procedure={procedure} role={step === 'security' ? 'SECURITY' : 'INFRA'} />
        }
      >
        {step === 'security' && procedure.allocation.status !== 'COMPLETE' && (
          <div className="allocation-banner">
            <strong>ICT인프라 할당을 기다리고 있습니다.</strong>
            <p>서버·IP·포트 할당이 완료되면 정보보안 검토를 시작할 수 있습니다.</p>
          </div>
        )}
        <StaffAssistant procedure={procedure} />
        {step === 'infra' && procedure.documentType === 'FIREWALL' && (
          <section
            id="field-network"
            tabIndex={-1}
            className={`sf-panel ${procedure.returnItems.some((item) => item.fieldKey === 'network' && item.status === 'OPEN') ? 'returned-field' : ''}`}
          >
            {procedure.returnItems
              .filter((item) => item.fieldKey === 'network' && item.status === 'OPEN')
              .map((item) => (
                <p className="returned-reason" key={item.id}>
                  <strong>↩ 보완 필요</strong>
                  {item.reason}
                </p>
              ))}
            {user.role === 'INFRA' && procedure.allowedActions.includes('EDIT') ? (
              <NetworkEditor procedure={procedure} />
            ) : (
              <>
                <div className="panel-heading">
                  <h2>통신 규칙</h2>
                  <Badge>담당자 입력</Badge>
                </div>
                <NetworkTable procedure={procedure} />
              </>
            )}
          </section>
        )}
      </DetailView>
    );
  if (step === 'supplement')
    return (
      <DetailView
        procedure={procedure}
        step={step}
        aside={
          <section className="sf-panel review-panel">
            <h2>담당자 협의 현황</h2>
            <ReviewProgress procedure={procedure} />
            <Notice>신청자의 답변 후 요청한 담당자가 보완 해소를 확인합니다.</Notice>
            <Link className="button primary full" href={`/requests/${id}/submit`}>
              제출 준비 확인
              <Icon name="arrow" />
            </Link>
          </section>
        }
      >
        <section className="sf-panel">
          <div className="panel-heading">
            <h2>보완 요청과 답변</h2>
            <Badge tone="amber">
              {procedure.supplements.filter((entry) => entry.status !== 'RESOLVED').length}건 미해소
            </Badge>
          </div>
          {procedure.supplements.length ? (
            procedure.supplements.map((entry) => (
              <SupplementEntry key={entry.id} procedure={procedure} id={entry.id} />
            ))
          ) : (
            <Empty
              title="보완 요청이 없습니다"
              description="담당자가 추가 확인할 내용을 요청하면 여기에 표시됩니다."
            />
          )}
        </section>
      </DetailView>
    );
  if (step === 'submit')
    return (
      <DetailView procedure={procedure} step={step} aside={<SubmitPanel procedure={procedure} />}>
        {procedure.stage === 3 && (
          <>
            <FinalDraftPanel procedure={procedure} />
            {user.role === 'APPLICANT' && (
              <section className="sf-panel">
                <h2>사용자 답변 최종 확인</h2>
                <AnswerEditor procedure={procedure} />
              </section>
            )}
          </>
        )}
      </DetailView>
    );
  return (
    <Notice>
      존재하지 않는 신청 단계입니다. <Link href="/requests">협의 요청함으로 이동</Link>
    </Notice>
  );
}
/** 검토 초안과 불변 제출본을 구분하여 검색·열람·다운로드할 수 있게 한다. */
export function DocumentsPage() {
  const { user } = useSession();
  const query = useRequests(user.role !== 'ADMIN');
  const [search, setSearch] = useMemoryDraft('document-search', '');
  const [kind, setKind] = useMemoryDraft('document-kind', 'ALL');
  if (user.role === 'ADMIN')
    return <Notice>문서함은 신청자와 담당자 계정에서 확인할 수 있습니다.</Notice>;
  if (query.isPending) return <Loading />;
  if (query.error) return <ErrorNotice error={query.error} retry={() => void query.refetch()} />;
  const list = query.data.filter(
    (item) =>
      `${item.title} ${shortId(item.id)}`.includes(search) &&
      (kind === 'ALL' ||
        (kind === 'SUBMITTED') === ['SUBMITTED', 'CONFIRMED'].includes(item.status)),
  );
  return (
    <>
      <Heading
        title="문서함"
        description="진행 중인 검토 초안과 제출 시점에 확정한 문서를 확인하세요."
      />
      <Notice>
        저장된 내용과 출처를 HTML 문서로 내려받습니다. 공식 양식·PDF·DOCX 발급은 연결되지
        않았습니다.
      </Notice>
      <section className="sf-panel document-search" aria-label="문서 검색">
        <div className="filter-field">
          <label htmlFor="document-query">사업명·신청번호</label>
          <div className="search-input">
            <Icon name="search" />
            <input
              id="document-query"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="문서를 검색해 주세요"
            />
          </div>
        </div>
        <div className="filter-field">
          <label htmlFor="document-kind">문서 구분</label>
          <select id="document-kind" value={kind} onChange={(event) => setKind(event.target.value)}>
            <option value="ALL">전체</option>
            <option value="DRAFT">검토 초안</option>
            <option value="SUBMITTED">제출본</option>
          </select>
        </div>
        <button
          className="button"
          type="button"
          onClick={() => {
            setSearch('');
            setKind('ALL');
          }}
        >
          검색 초기화
        </button>
      </section>
      <p className="document-count" role="status">
        문서 <strong>{list.length}</strong>건 · 초안은 저장한 최신 내용으로 표시됩니다.
      </p>
      <div className="document-grid">
        {list.map((item) => (
          <section className="sf-panel document-card" key={item.id}>
            <div className="row-between">
              <span className="document-symbol">
                <Icon name="file" width={26} height={26} />
              </span>
              <Badge tone={['SUBMITTED', 'CONFIRMED'].includes(item.status) ? 'green' : 'gray'}>
                {['SUBMITTED', 'CONFIRMED'].includes(item.status) ? '제출본' : '검토 초안'} v
                {item.revision}
              </Badge>
            </div>
            <h2>{item.title}</h2>
            <p>{shortId(item.id)}</p>
            <dl className="document-facts">
              <div>
                <dt>적용 설정</dt>
                <dd>v{item.policyVersion}</dd>
              </div>
              <div>
                <dt>확인 상태</dt>
                <dd>
                  미확정{' '}
                  {
                    item.answers.filter(
                      (answer) => !['CONFIRMED', 'NOT_APPLICABLE'].includes(answer.status),
                    ).length
                  }
                  개
                </dd>
              </div>
              <div>
                <dt>문서 형식</dt>
                <dd>HTML · 출처·확인 이력 포함</dd>
              </div>
            </dl>
            <div className="document-state">
              <Icon name="info" width={16} height={16} />
              <span>
                {['SUBMITTED', 'CONFIRMED'].includes(item.status)
                  ? '제출 시점에 고정 · 읽기전용'
                  : '검토 중 변경될 수 있는 초안입니다.'}
              </span>
            </div>
            <DocumentPanel procedure={item} compact />
            <Link className="document-detail-link" href={stepPath(item, user.role)}>
              협의 내용과 원문 근거
              <Icon name="arrow" width={16} height={16} />
            </Link>
          </section>
        ))}
      </div>
      {!list.length && (
        <Empty
          title="문서가 없습니다"
          description="검색 조건을 바꾸거나 새 보안 신청을 작성해 주세요."
        />
      )}
    </>
  );
}
