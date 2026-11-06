'use client';
import { useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/layout';
import { Notice, Badge, Heading, Icon, Stepper } from '@/components/ui';
import {
  RequestsView,
  AnalysisView,
  DetailView,
  NetworkTable,
  RegisterView,
  EvidenceList,
} from '@/features/request';
import { PreviewReview } from '@/features/review';
import { DocumentPreview } from '@/features/document';
import { AdminView } from '@/features/configuration';
import {
  previewRequest,
  previewRequests,
  previewPolicy,
  previewSettings,
  previewAnalyses,
} from './fixtures';
function NewRequestPreview() {
  const [type, setType] = useState('FIREWALL');
  return (
    <>
      <Heading
        title="새 신청 시작"
        description="작성할 서류를 선택하고 알고 있는 사업 정보부터 알려주세요."
      />
      <Stepper current={0} />
      <div className="form-layout">
        <section className="sf-panel form-panel">
          <h2>어떤 보안 신청을 준비하시나요?</h2>
          <div className="document-choice">
            {[
              ['FIREWALL', '방화벽 신청서', '외부 서비스·시스템과 통신이 필요할 때'],
              ['SECURITY_REVIEW', '보안성검토 신청서', '새 서비스나 정보화 사업을 검토할 때'],
            ].map(([value, label, description]) => (
              <label key={value} className={type === value ? 'selected' : ''}>
                <input
                  type="radio"
                  name="preview-document-type"
                  value={value}
                  checked={type === value}
                  onChange={() => setType(value)}
                />
                <span>
                  <strong>{label}</strong>
                  <small>{description}</small>
                </span>
              </label>
            ))}
          </div>
          <div className="sf-field">
            <label htmlFor="preview-title">
              프로젝트명 <span className="required">필수</span>
            </label>
            <input id="preview-title" value="공개 안내 챗봇 서비스 구축 (합성)" readOnly />
          </div>
          <div className="sf-field">
            <label htmlFor="preview-department">신청 부서</label>
            <input id="preview-department" value="디지털서비스팀 (합성)" readOnly />
          </div>
          <div className="sf-field">
            <label htmlFor="preview-description">사업 설명</label>
            <textarea
              id="preview-description"
              rows={5}
              readOnly
              value="공개된 안내 자료를 쉽게 찾을 수 있도록 챗봇을 준비합니다. 공개 FAQ와 합성 질문을 사용하며 내부 시스템 연계 사항은 담당자와 협의합니다."
            />
          </div>
          <Notice>
            자료가 없어도 직접 설명할 수 있습니다. 파일 선택만으로는 서버에 전송하지 않으며, 분석
            시작 버튼에서 전송 내용을 확인합니다.
          </Notice>
          <div className="form-actions">
            <Link className="button primary" href="/design-preview/analysis">
              자료·AI 분석 화면 보기
              <Icon name="arrow" />
            </Link>
          </div>
        </section>
        <aside className="form-help">
          <section className="sf-panel">
            <span className="overline">작성 안내</span>
            <h3>모르는 기술 정보는 함께 확인해요.</h3>
            <p>사업 목적·이용 대상은 신청자가, 서버·IP·포트는 ICT인프라 담당자가 입력합니다.</p>
            <hr />
            <h4>절차는 4단계입니다</h4>
            <ol className="notes-list">
              <li>작성 · 업로드와 AI 인터뷰</li>
              <li>담당자 협의 · 인프라 선행</li>
              <li>사용자 최종 검토</li>
              <li>확정·관리 · 적용은 별도</li>
            </ol>
          </section>
        </aside>
      </div>
    </>
  );
}
/** 인증 훅을 호출하지 않고 합성 값으로 새 시안의 모든 업무 상태를 검토한다. */
export function PreviewPage({
  screen,
  tab = 'questions',
  query = '',
}: {
  screen: string;
  tab?: string;
  query?: string;
}) {
  const role =
    screen === 'admin'
      ? 'ADMIN'
      : screen === 'security'
        ? 'SECURITY'
        : screen === 'infra' || screen === 'returned'
          ? 'INFRA'
          : 'APPLICANT';
  const item =
    screen === 'closed'
      ? previewRequests[7]
      : screen === 'withdrawn'
        ? previewRequests[8]
        : screen === 'returned'
          ? previewRequests[4]
          : screen === 'final-review'
            ? previewRequests[9]
            : screen === 'submitted'
              ? previewRequests[5]
              : screen === 'confirmed'
                ? previewRequests[6]
                : previewRequest;
  const detail = [
    'security',
    'infra',
    'returned',
    'final-review',
    'submitted',
    'confirmed',
    'closed',
    'withdrawn',
  ].includes(screen);
  return (
    <AppShell preview institutionName={previewPolicy.institutionName} role={role}>
      {screen === 'workspace' || screen === 'requests' ? (
        <RequestsView
          key={query}
          items={previewRequests}
          role="APPLICANT"
          preview
          initialQuery={query}
        />
      ) : screen === 'new-request' ? (
        <NewRequestPreview />
      ) : screen === 'analysis' ? (
        <AnalysisView
          procedure={{ ...previewRequests[3], stage: 1 }}
          analyses={previewAnalyses}
          preview
        />
      ) : screen === 'interview' ? (
        <>
          <Heading
            title="AI 인터뷰·답변 확인"
            description="합성 예시의 출처와 질문 이유를 확인합니다."
          />
          <Stepper current={0} />
          <div className="interview-layout">
            <section className="sf-panel">
              <h2>사업 내용을 함께 확인해요</h2>
              <div className="interview-intro">
                <span className="ai-avatar">
                  <Icon name="sparkle" />
                </span>
                <div className="interview-bubble">
                  <p>
                    공개 자료와 합성 질문을 사용하는 서비스로 이해했어요. 어떤 정보를 처리하고 누가
                    사용하는지 확인해 주세요.
                  </p>
                  <p className="source-meta">기관 질문 템플릿 기반 · 예시 모드</p>
                </div>
              </div>
              <EvidenceList
                answers={previewRequest.answers.filter(
                  (answer) => answer.ownerRole === 'APPLICANT',
                )}
              />
            </section>
            <aside className="sf-panel">
              <DocumentPreview procedure={previewRequest} />
            </aside>
          </div>
        </>
      ) : detail ? (
        <>
          <nav className="preview-options" aria-label="합성 업무 상태 선택">
            <Link href="/design-preview/infra">인프라 협의</Link>
            <Link href="/design-preview/security">정보보안 검토</Link>
            <Link href="/design-preview/returned">반환·보완</Link>
            <Link href="/design-preview/final-review">AI 최종 초안 미확정</Link>
            <Link href="/design-preview/submitted">양측 최종 확인</Link>
            <Link href="/design-preview/confirmed">서류 확정</Link>
            <Link href="/design-preview/closed">종결(반려)</Link>
            <Link href="/design-preview/withdrawn">철회</Link>
          </nav>
          <DetailView
            procedure={item}
            step={screen}
            preview
            aside={<PreviewReview procedure={item} role={role} />}
          >
            {item.documentType === 'FIREWALL' && (
              <section
                id="field-network"
                tabIndex={-1}
                className={`sf-panel ${item.returnItems.some((entry) => entry.fieldKey === 'network' && entry.status === 'OPEN') ? 'returned-field' : ''}`}
              >
                <div className="panel-heading">
                  <h2>서버·IP·포트 할당 정보</h2>
                  <Badge tone="blue">담당자 입력 · 합성</Badge>
                </div>
                {item.returnItems
                  .filter((entry) => entry.fieldKey === 'network' && entry.status === 'OPEN')
                  .map((entry) => (
                    <p className="returned-reason" key={entry.id}>
                      <strong>↩ 보완 필요</strong>
                      {entry.reason}
                    </p>
                  ))}
                <NetworkTable procedure={item} />
              </section>
            )}
            {item.finalDraft && (
              <section className="sf-panel">
                <div className="panel-heading">
                  <h2>
                    <Icon name="sparkle" /> AI 최종 초안
                  </h2>
                  <Badge tone={item.finalDraft.confirmed ? 'green' : 'amber'}>
                    {item.finalDraft.confirmed ? '사람 확인 완료' : 'AI 제안 · 미확정'}
                  </Badge>
                </div>
                <Badge>예시 모드 · 외부 LLM 호출 없음</Badge>
                <div className="assistant-answer">{item.finalDraft.summary}</div>
                <p className="source-meta">근거: {item.finalDraft.evidence}</p>
                <Notice>
                  생성 결과를 사람이 확인한 뒤 제출하며, 제출 후 양측 최종 검토를 거쳐 서류를
                  확정합니다.
                </Notice>
              </section>
            )}
          </DetailView>
        </>
      ) : ['documents', 'network', 'history', 'supplements'].includes(screen) ? (
        <RegisterView
          kind={screen as 'documents' | 'network' | 'history' | 'supplements'}
          items={previewRequests}
          role="APPLICANT"
          preview
        />
      ) : screen === 'admin' ? (
        <AdminView settings={previewSettings} policy={previewPolicy} tab={tab} preview>
          {tab === 'context' && (
            <section className="sf-panel">
              <h2>기관 컨텍스트</h2>
              <Notice>
                공개 지식과 기관 비공개 사실을 분리합니다. 이 디자인 시안은 실제 내부 자산·비공개
                규정 대신 합성 설명만 표시합니다.
              </Notice>
              <article className="context-card">
                <Badge>담당자 입력 · 합성</Badge>
                <h3>시연용 자료 관리 기준</h3>
                <p>
                  공개 자료와 합성 입력만 사용합니다. 실제 내부 서버·계정·자산 정보는 포함하지
                  않습니다.
                </p>
              </article>
            </section>
          )}
        </AdminView>
      ) : (
        <>
          <Heading title="디자인 미리보기" />
          <Notice>왼쪽 메뉴에서 확인할 화면을 선택해 주세요.</Notice>
        </>
      )}
    </AppShell>
  );
}
