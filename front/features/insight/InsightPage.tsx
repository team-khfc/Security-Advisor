'use client';

import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { useSession } from '@/features/auth';
import { requestJson } from '@/lib/httpClient';
import { ErrorState, LoadingState, Notice, PageHeading } from '@/components/ui';

const counts = z.record(z.string(), z.number().nonnegative());
export const insightSchema = z.object({
  requestsByDocType: counts,
  requestsByStage: counts,
  requestsByStatus: counts,
  averageBusinessDaysByStage: z.record(z.string(), z.number().nullable()),
  completedByStage: counts,
  activeDeadlines: counts,
  overdueDeadlines: z.number(),
  supplements: counts,
  supplementsPerRequest: z.number().nullable(),
  stageReturnRate: z.number().nullable(),
  firstPassRate: z.number().nullable(),
  aiProposals: z.number(),
  aiProposalsConfirmedUnchanged: z.number(),
  aiProposalsModified: z.number(),
  aiProposalConfirmRate: z.number().nullable(),
  firewallRules: counts,
  averageReviewDays: z.number().nullable(),
  completedReviewCount: z.number(),
  calculatedAt: z.string(),
});
const statusLabels: Record<string, string> = {
  DRAFTING: '작성 중',
  IN_REVIEW: '협의 중',
  SUPPLEMENT_REQUESTED: '보완 요청',
  FINAL_REVIEW: '사용자 최종 검토',
  SUBMITTED: '제출됨',
  CONFIRMED: '확정',
  CLOSED: '종결',
  WITHDRAWN: '철회',
};
const stageLabels: Record<string, string> = {
  '1': '작성',
  '2': '담당자 협의',
  '3': '사용자 최종 검토',
  '4': '확정·관리',
};
const n = (value: number) => value.toLocaleString('ko-KR');
const percent = (value: number | null) =>
  value === null
    ? '산정할 자료 없음'
    : `${(value * 100).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}%`;
export function InsightPage() {
  const session = useSession();
  if (session.isPending) return <LoadingState />;
  if (session.data?.member.role !== 'ADMIN')
    return <Notice tone="warning">기관 관리자만 업무 지표를 조회할 수 있습니다.</Notice>;
  return (
    <>
      {session.data.mock && (
        <Notice tone="info">
          모의 환경은 현재 상태 중심의 집계입니다. 정확한 단계 소요 시간과 AI 확인율은 백엔드 연동
          환경에서 확인하세요.
        </Notice>
      )}
      <InsightReport key={session.data.member.id} />
    </>
  );
}
function InsightReport() {
  const query = useQuery({
    queryKey: ['insights'],
    queryFn: async ({ signal }) =>
      insightSchema.parse(await requestJson('/api/insights/summary', { signal })),
  });
  if (query.isPending) return <LoadingState />;
  if (!query.data) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const data = query.data;
  const total = Object.values(data.requestsByDocType).reduce((a, b) => a + b, 0);
  return (
    <>
      <PageHeading
        title="업무 지표"
        description="기관 전체 신청과 감사 이력에서 조회 시점에 계산합니다. 개인별 순위와 성과 비교는 제공하지 않습니다."
      />
      <Notice tone="info">
        시연 수치는 합성 데이터 기준입니다. 실제 업무 개선 효과를 입증하는 수치가 아닙니다.
      </Notice>
      <div className="knowledge-publish-bar">
        <p>계산 시각: {new Date(data.calculatedAt).toLocaleString('ko-KR')} · 누적 전체 기간</p>
        <button
          type="button"
          className="btn"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          {query.isFetching ? '조회 중…' : '지표 새로고침'}
        </button>
      </div>
      {query.isError && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
      <div className="insight-grid">
        <Metric label="전체 신청" value={`${n(total)}건`} description="진행 중·종료된 신청 전체" />
        <Metric
          label="기한 경과"
          value={`${n(data.overdueDeadlines)}건`}
          description="활성 업무 기한 기준 · 신청 한 건에 여러 기한이 있을 수 있습니다"
        />
        <Metric
          label="신청당 보완 요청"
          value={
            data.supplementsPerRequest === null
              ? '산정할 자료 없음'
              : `${n(data.supplementsPerRequest)}회`
          }
          description="협의를 요청한 신청 기준"
        />
        <Metric
          label="차수 반환률"
          value={percent(data.stageReturnRate)}
          description="협의 요청 신청 중 한 번 이상 반환된 비율"
        />
        <Metric
          label="1회 통과율"
          value={percent(data.firstPassRate)}
          description="확정 신청 중 보완·반환 없이 확정된 비율"
        />
        <Metric
          label="AI 제안 확인율"
          value={percent(data.aiProposalConfirmRate)}
          description="확인 또는 수정으로 결론난 제안 중 수정 없이 확인된 비율"
        />
      </div>
      <div className="knowledge-grid">
        <CountTable
          title="서류 유형별 신청"
          values={data.requestsByDocType}
          labels={{ FIREWALL: '방화벽 정책 허용', SECURITY_REVIEW: '정보화사업 보안성검토' }}
        />
        <CountTable title="상태별 신청" values={data.requestsByStatus} labels={statusLabels} />
        <CountTable
          title="진행 중 단계별 신청"
          values={data.requestsByStage}
          labels={stageLabels}
        />
        <CountTable
          title="활성 기한 상태"
          values={data.activeDeadlines}
          labels={{ ON_TRACK: '기한 내', IMMINENT: '기한 임박', OVERDUE: '기한 경과' }}
        />
      </div>
      <section className="card">
        <h2 className="h-panel">단계별 평균 소요 영업일</h2>
        <p>
          각 신청에 고정된 공휴일을 적용합니다. 단계의 첫 진입부터 첫 완료까지이며 반환 후 반복 소요
          기간은 포함하지 않습니다.
        </p>
        <div className="tbl-wrap">
          <table className="tbl">
            <caption className="sr-only">단계별 완료 건수와 평균 소요 영업일</caption>
            <thead>
              <tr>
                <th scope="col">단계</th>
                <th scope="col">완료 건수</th>
                <th scope="col">평균 영업일</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(stageLabels).map(([key, label]) => (
                <tr key={key}>
                  <th scope="row">{label}</th>
                  <td>{n(data.completedByStage[key] ?? 0)}건</td>
                  <td>
                    {data.averageBusinessDaysByStage[key] == null
                      ? '산정할 자료 없음'
                      : `${n(data.averageBusinessDaysByStage[key])}일`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="knowledge-grid">
        <CountTable
          title="보완 요청 상태"
          values={data.supplements}
          labels={{
            OPEN: '답변 대기',
            ANSWERED: '답변 완료',
            RESOLVED: '보완 해결',
            CANCELLED: '취소',
          }}
        />
        <CountTable
          title="방화벽 규칙 상태"
          values={data.firewallRules}
          labels={{
            CONFIRMED: '확정',
            PENDING: '적용 대기',
            PENDING_APPLY: '적용 대기',
            APPLIED: '적용 완료',
            NOT_APPLICABLE: '적용 불가',
            EXPIRING: '만료 예정',
            EXPIRED: '만료',
            REVOKED: '회수 완료',
          }}
        />
      </div>
      <section className="card">
        <h2 className="h-panel">AI 제안 처리</h2>
        <p>
          제안 {n(data.aiProposals)}건 · 수정 없이 확인 {n(data.aiProposalsConfirmedUnchanged)}건 ·
          확인 전 수정 {n(data.aiProposalsModified)}건
        </p>
        <p className="help">
          아직 확인·수정되지 않은 제안은 확인율의 분모에서 제외합니다. 분모가 0인 비율은 0%로
          표시하지 않습니다. 이 화면의 조회는 업무 상태를 변경하지 않습니다.
        </p>
      </section>
    </>
  );
}
function Metric({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description: string;
}) {
  return (
    <section className="card insight-metric">
      <h2>{label}</h2>
      <p className="insight-value">{value}</p>
      <p className="help">{description}</p>
    </section>
  );
}
function CountTable({
  title,
  values,
  labels,
}: {
  title: string;
  values: Record<string, number>;
  labels: Record<string, string>;
}) {
  return (
    <section className="card">
      <h2 className="h-panel">{title}</h2>
      {Object.keys(values).length ? (
        <dl className="insight-counts">
          {Object.entries(values).map(([key, value]) => (
            <div key={key}>
              <dt>{labels[key] ?? '기타'}</dt>
              <dd>{n(value)}건</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p>아직 집계할 항목이 없습니다.</p>
      )}
    </section>
  );
}
