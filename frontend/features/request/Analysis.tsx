'use client';
import { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession, useMemoryDraft } from '@/features/auth';
import { analysisSchema, type Analysis, type SecurityRequest } from './types';
import { requestJson } from '@/lib/http';
import { formatAnswerValue, formatDate } from '@/lib/format';
import { Badge, ErrorNotice, Heading, Icon, Modal, Notice } from '@/components/ui';
import { useAnalyses, useRequestMutation } from './useRequests';

export const EXAMPLE_PLAN =
  '사업 목적: 공개된 주택연금 안내를 쉽게 찾을 수 있는 챗봇을 준비합니다.\n이용 대상: 일반 국민과 안내 담당자\n처리 정보: 공개 FAQ와 합성 질문. 실제 개인정보를 사용하지 않습니다.\n외부 전송: NO\n운영 기간: 2026-11-06부터 2026-12-06까지 합성 시연\n데이터 흐름: 합성 질문 → 공개 안내 검색 → 안내 답변';
/** 전송 전에 사용자에게 지원 형식과 용량 제한을 알린다. 서버의 본문 검증을 대체하지 않는다. */
export function validateAnalysisFile(file: Pick<File, 'name' | 'size'>): string | null {
  if (!/\.(txt|md)$/i.test(file.name)) return 'UTF-8 TXT 또는 MD 파일을 선택해 주세요.';
  if (file.size > 1024 * 1024) return '파일 크기는 1MiB 이하로 줄여 주세요.';
  if (!file.size) return '내용이 있는 파일을 선택해 주세요.';
  return null;
}
interface AnalysisInput {
  text: string;
  file?: File;
}
/** 파일 선택과 명시적 전송을 분리하고 AI 정보 후보는 미확정으로만 표시한다. */
export function AnalysisView({
  procedure,
  analyses,
  preview = false,
  busy = false,
  error,
  onAnalyze,
  onApply,
  initialInput,
  onInputChange,
}: {
  procedure: SecurityRequest;
  analyses: Analysis[];
  preview?: boolean;
  busy?: boolean;
  error?: unknown;
  onAnalyze?: (text: string, file?: File) => Promise<void>;
  onApply?: (analysis: Analysis) => Promise<void>;
  initialInput?: AnalysisInput;
  onInputChange?: (input: AnalysisInput) => void;
}) {
  const [text, setText] = useState(initialInput?.text ?? (preview ? EXAMPLE_PLAN : ''));
  const [file, setFile] = useState<File | undefined>(initialInput?.file);
  const [attempted, setAttempted] = useState(false);
  useEffect(() => {
    onInputChange?.({ text, file });
  }, [text, file, onInputChange]);
  const [fileError, setFileError] = useState<string>();
  const [fullName, setFullName] = useState(false);
  const [transmitted, setTransmitted] = useState(false);
  const [analysisFailed, setAnalysisFailed] = useState(false);
  const [confirm, setConfirm] = useState<Analysis>();
  const fileRef = useRef<HTMLInputElement>(null);
  const locked = preview || !procedure.allowedActions.includes('ANALYZE');
  const latest = [...analyses].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  async function start() {
    if (!onAnalyze) return;
    setAttempted(true);
    setTransmitted(false);
    setAnalysisFailed(false);
    try {
      await onAnalyze(text, file);
      setTransmitted(true);
    } catch {
      setAnalysisFailed(true);
      /* 오류는 API 요청을 소유한 컨테이너에서 표시한다. */
    }
  }
  return (
    <>
      <Heading title={`${procedure.title} 이어서 작성`}>
        <Badge tone="blue">기관 설정 v{procedure.policyVersion}</Badge>
      </Heading>
      <section className="docbar" aria-label="첨부 문서">
        <div className="docbar-in">
          <div className="dchips">
            <Icon name="file" />
            {file ? (
              <span className={fullName ? 'fname full' : 'fname'}>{file.name}</span>
            ) : (
              <span className="help">
                첨부 문서 없음. 자료를 추가하거나 사업 설명을 입력해 주세요.
              </span>
            )}
            {file && (
              <Badge tone={busy ? 'blue' : analysisFailed ? 'red' : transmitted ? 'green' : 'gray'}>
                {busy
                  ? '전송 및 분석 중'
                  : analysisFailed
                    ? '분석 실패'
                    : transmitted
                      ? '분석 완료'
                      : attempted
                        ? '분석 이력 확인'
                        : '선택됨 · 아직 전송하지 않음'}
              </Badge>
            )}
          </div>
          <div className="btn-row">
            {file && (
              <>
                <button
                  className="btn btn-tertiary btn-sm"
                  type="button"
                  onClick={() => setFullName(!fullName)}
                  aria-expanded={fullName}
                >
                  {fullName ? '이름 접기' : '전체 이름 보기'}
                </button>
                <button
                  className="btn btn-tertiary btn-sm"
                  type="button"
                  disabled={locked || busy}
                  onClick={() => {
                    setFile(undefined);
                    setTransmitted(false);
                    setAnalysisFailed(false);
                    setAttempted(false);
                    if (fileRef.current) fileRef.current.value = '';
                  }}
                >
                  파일 빼기
                </button>
              </>
            )}
            <button
              className="btn btn-sm"
              type="button"
              disabled={locked || busy}
              onClick={() => fileRef.current?.click()}
            >
              {file ? '파일 변경' : '문서 추가'}
            </button>
          </div>
        </div>
      </section>
      <input
        ref={fileRef}
        className="file-native"
        type="file"
        accept=".txt,.md,text/plain,text/markdown"
        aria-label="사업 자료 파일 선택"
        disabled={locked || busy}
        onChange={(event) => {
          const next = event.target.files?.[0];
          if (!next) return;
          const issue = validateAnalysisFile(next);
          setFileError(issue ?? undefined);
          if (!issue) {
            setFile(next);
            setTransmitted(false);
            setAnalysisFailed(false);
            setAttempted(false);
          } else {
            setFile(undefined);
            event.target.value = '';
          }
        }}
      />
      <div className="work app-analysis">
        <section className="chatp" aria-labelledby="analysis-assistant-title">
          <div className="chatp-h">
            <div className="ttl">
              <span className="av" aria-hidden="true">
                AI
              </span>
              <h2 className="h-panel" id="analysis-assistant-title">
                보안정보 도우미
              </h2>
            </div>
            <span className="meta">AI 답변은 제안이며 확정 전 확인이 필요합니다</span>
          </div>
          <div className="msgs" tabIndex={0} aria-label="자료와 분석 요청">
            <div className="m-ai">
              <span className="av" aria-hidden="true">
                AI
              </span>
              <div className="body">
                <div className="bubble">
                  <p>사업 설명에서 필요한 보안정보를 함께 찾아볼게요.</p>
                  <p>
                    자료를 선택한 뒤 분석을 시작하면 원문 근거와 정보 후보가 오른쪽에 표시됩니다.
                    자료가 없으면 직접 답변할 수 있습니다.
                  </p>
                </div>
                <p className="m-src">자료 준비 안내 · 분석은 아래 버튼을 누를 때 실행됩니다.</p>
              </div>
            </div>
            {preview && (
              <Notice>
                합성 자료로 구성한 읽기전용 시안입니다. 자료나 답변을 전송하지 않습니다.
              </Notice>
            )}
            <ErrorNotice error={error} />
            {fileError && <Notice error>{fileError}</Notice>}
            {!file && (
              <div className="dropzone analysis-dropzone">
                <span className="dz-ic">
                  <Icon name="upload" width={32} height={32} />
                </span>
                <h3 className="h-panel">사업계획서 또는 서비스 개요서</h3>
                <button
                  className="btn"
                  type="button"
                  disabled={locked || busy}
                  onClick={() => fileRef.current?.click()}
                >
                  파일 선택
                </button>
                <p className="help">UTF-8 TXT·MD · 1MiB 이하 · 파일 1개</p>
              </div>
            )}
            <div className="sf-field">
              <label htmlFor="analysis-text">
                분석할 사업 설명 <span className="optional">파일과 함께 또는 단독 사용</span>
              </label>
              <textarea
                id="analysis-text"
                rows={6}
                maxLength={20000}
                value={text}
                disabled={locked || busy}
                onChange={(event) => setText(event.target.value)}
                placeholder="사업 목적, 이용 대상, 처리 정보, 운영 기간을 적어 주세요."
              />
              <span className="char-count">{text.length.toLocaleString()} / 20,000자</span>
              <p className="help">파일과 직접 입력을 합해 40,000자까지 분석할 수 있습니다.</p>
            </div>
            <button
              className="btn btn-tertiary"
              type="button"
              disabled={locked || busy}
              onClick={() => setText(EXAMPLE_PLAN)}
            >
              합성 예시 계획서 입력
            </button>
          </div>
          <div className="infop-f">
            <button
              className="btn btn-primary btn-block"
              type="button"
              disabled={locked || busy || (!file && !text.trim())}
              onClick={() => void start()}
            >
              <Icon name="sparkle" />
              {busy
                ? '분석 요청 처리 중…'
                : file
                  ? '파일 전송 및 AI 분석 시작'
                  : '사업 설명 AI 분석 시작'}
            </button>
            <p className="help">
              파일 선택만으로는 전송하지 않습니다. 실제 개인정보와 내부 자료는 넣지 마세요.
            </p>
          </div>
        </section>
        <div className="work-divider" aria-hidden="true" />
        <aside className="infop" aria-labelledby="analysis-information-title">
          <div className="infop-h">
            <div className="row">
              <h2 className="h-panel" id="analysis-information-title">
                수집된 보안정보
              </h2>
              <span className="help">정보 후보 {latest?.suggestions.length ?? 0}개</span>
            </div>
          </div>
          <div className="infop-b">
            <div className="irow namerow">
              <span className="k">사업명</span>
              <strong>{procedure.title}</strong>
            </div>
            {latest ? (
              <>
                <h3 className="grp">
                  <span>문서에서 찾은 정보</span>
                  <Badge tone={latest.mode === 'EXAMPLE' ? 'gray' : 'blue'}>
                    {latest.mode === 'EXAMPLE' ? '예시 분석' : '실제 모델 연결'}
                  </Badge>
                </h3>
                <p className="source-meta">
                  {latest.provider} · {latest.model} · {formatDate(latest.createdAt, true)} · 수정본
                  v{latest.revision}
                </p>
                {latest.status !== 'SUCCEEDED' && (
                  <Notice error={latest.status === 'FAILED'}>
                    {latest.status === 'RUNNING'
                      ? '분석이 진행 중입니다. 완료 후 이력을 다시 확인해 주세요.'
                      : latest.status === 'STALE'
                        ? '분석 후 신청이 변경되어 이 후보를 적용할 수 없습니다. 다시 분석해 주세요.'
                        : (latest.error ??
                          '분석이 실패했습니다. 입력 자료와 모델 연결을 확인한 뒤 다시 요청해 주세요.')}
                  </Notice>
                )}
                {latest.suggestions.map((suggestion) => (
                  <div className="drow" key={suggestion.key}>
                    <div className="drow-top">
                      <span className="k">{suggestion.label}</span>
                      <Badge tone="amber">AI 제안 · 미확정</Badge>
                    </div>
                    <p className="drow-v readonly-value">
                      {formatAnswerValue(suggestion.key, suggestion.value)}
                    </p>
                    <p className="evi">
                      <Icon name="file" width={16} height={16} />
                      <span>근거: {suggestion.evidence}</span>
                    </p>
                  </div>
                ))}
                {latest.revision !== procedure.revision && (
                  <p className="help">
                    현재 수정본과 분석 시점이 다릅니다. 이미 적용했거나 내용을 수정한 경우 새로
                    분석해야 합니다.
                  </p>
                )}
                {latest.references.length > 0 && (
                  <>
                    <h3 className="grp">참고한 공개 자료</h3>
                    {latest.references.map((reference) => (
                      <p className="help" key={`${reference.title}-${reference.section}`}>
                        {reference.title} · {reference.version} · {reference.section}
                      </p>
                    ))}
                  </>
                )}
              </>
            ) : (
              <>
                <h3 className="grp">문서에서 찾은 정보</h3>
                <p className="help">
                  분석 결과가 아직 없습니다. 분석을 시작하거나 질문에 직접 답해 주세요.
                </p>
              </>
            )}
            <h3 className="grp">담당자 확인 항목</h3>
            <p className="help">
              서버·IP·포트는 ICT인프라 담당자가, 보안 요건은 정보보안 담당자가 확인합니다.
            </p>
          </div>
          <div className="infop-f">
            {latest && latest.suggestions.length > 0 && (
              <button
                className="btn btn-block"
                type="button"
                disabled={
                  locked ||
                  busy ||
                  latest.status !== 'SUCCEEDED' ||
                  latest.revision !== procedure.revision
                }
                onClick={() => setConfirm(latest)}
              >
                정보 후보를 답변 초안에 적용
              </button>
            )}
            <Link
              className="btn btn-primary btn-block"
              href={preview ? '/design-preview/interview' : `/requests/${procedure.id}/questions`}
            >
              {preview ? 'AI 인터뷰 화면 보기' : 'AI 인터뷰 계속'}
              <Icon name="arrow" />
            </Link>
            <p className="help">
              후보 적용 후에도 미확정 상태입니다. 원문과 답변을 직접 확인해 주세요.
            </p>
          </div>
        </aside>
      </div>
      <Modal
        open={Boolean(confirm)}
        title="AI 정보 후보 적용"
        onClose={() => setConfirm(undefined)}
      >
        <Notice>
          저장된 분석 후보를 답변 초안에 적용합니다. 적용 후에도 미확정 상태이며, 기관별 질문에서
          근거를 읽고 직접 확인해야 합니다.
        </Notice>
        <p>이미 확정한 값은 덮어쓰지 않습니다. 신청 수정본이 바뀌면 서버가 적용을 거절합니다.</p>
        <div className="dialog-actions">
          <button className="button" type="button" onClick={() => setConfirm(undefined)}>
            취소
          </button>
          <button
            className="button primary"
            type="button"
            disabled={busy}
            onClick={() => {
              if (confirm && onApply)
                void onApply(confirm)
                  .then(() => setConfirm(undefined))
                  .catch(() => setConfirm(undefined));
            }}
          >
            미확정 후보로 적용
          </button>
        </div>
      </Modal>
    </>
  );
}
/** 분석은 명시적 클릭에서만 실행하며 적용은 서버에 저장된 후보와 기준 수정본을 사용한다. */
export function AnalysisPage({ procedure }: { procedure: SecurityRequest }) {
  const [input, setInput] = useMemoryDraft<AnalysisInput>(`analysis-input:${procedure.id}`, {
    text: '',
  });
  const analyses = useAnalyses(procedure.id);
  const apply = useRequestMutation(procedure.id);
  const client = useQueryClient();
  const { user } = useSession();
  const analyze = useMutation({
    mutationFn: ({ text, file }: { text: string; file?: File }) => {
      const form = new FormData();
      form.set('expectedRevision', String(procedure.revision));
      form.set('text', text);
      if (file) form.set('file', file);
      return requestJson(`/security-requests/${procedure.id}/analysis`, analysisSchema, {
        method: 'POST',
        body: form,
      });
    },
    onSettled: () => {
      void client.invalidateQueries({
        queryKey: ['analyses', user.institutionId, user.userId, procedure.id],
      });
    },
  });
  return (
    <AnalysisView
      key={procedure.id}
      initialInput={input}
      onInputChange={setInput}
      procedure={procedure}
      analyses={analyses.data ?? []}
      busy={analyze.isPending || apply.isPending}
      error={analyze.error ?? apply.error ?? analyses.error}
      onAnalyze={async (text, file) => {
        await analyze.mutateAsync({ text, file });
      }}
      onApply={async (analysis) => {
        await apply.mutateAsync({
          endpoint: `/analysis/${analysis.id}/apply`,
          body: { expectedRevision: procedure.revision },
        });
      }}
    />
  );
}
