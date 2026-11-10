'use client';

import { answerValueError } from './answerFieldPolicy';

import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { requestJson } from '@/lib/httpClient';
import { useSession } from '@/features/auth';
import * as dto from './apiTypes';
import { adaptCase, adaptList, adaptRequest } from './adapters/backend';
import type {
  AnswerInput,
  AnalysisInput,
  CommandInput,
  CreateCaseInput,
  SecurityRequest,
} from './types';

const encoded = encodeURIComponent;
const read = async <T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> =>
  schema.parse(await requestJson<unknown>(path, { signal }));
const publication = (id: number, signal?: AbortSignal) =>
  read(`/api/publications/${id}`, dto.publicationDto, signal);
async function readCase(id: string, signal?: AbortSignal) {
  const value = await read(`/api/business-cases/${encoded(id)}`, dto.caseDto, signal);
  const pub = await publication(value.publicationId, signal);
  return { value, pub, view: adaptCase(value, pub) };
}
async function readParts(id: string, signal?: AbortSignal) {
  const base = `/api/security-requests/${encoded(id)}`;
  const [reviews, assignments, supplements, returns, deadlines, submissions] = await Promise.all([
    read(`${base}/reviews`, z.array(dto.reviewDto), signal),
    read(`${base}/assignments`, z.array(dto.assignmentDto), signal),
    read(`${base}/supplements`, z.array(dto.supplementDto), signal),
    read(`${base}/stage-returns`, z.array(dto.returnDto), signal),
    read(`${base}/deadlines`, z.array(dto.deadlineDto), signal),
    read(`${base}/submissions`, z.array(dto.submissionDto), signal),
  ]);
  const snapshots = await Promise.all(
    submissions.map((v) => read(`/api/submissions/${v.submissionId}`, dto.submissionDto, signal)),
  );
  const latest = submissions.find((v) => v.latest);
  const finalConfirmations = latest
    ? await read(
        `/api/submissions/${latest.submissionId}/final-confirmations`,
        z.array(dto.finalConfirmationDto),
        signal,
      )
    : [];
  return {
    reviews,
    assignments,
    supplements,
    returns,
    deadlines,
    submissions: snapshots,
    finalConfirmations,
  };
}
/** 목록의 검색 조건과 페이지를 서버에 전달한다. 상세 조립은 현재 페이지에만 한정한다. */
export interface RequestListOptions {
  page?: number;
  size?: number;
  query?: string;
  inbox?: string;
  from?: string;
  to?: string;
  businessCaseId?: string;
  documentKind?: string;
  supplementState?: string;
  sort?: string;
}
export function useRequests(detailed = false, options: RequestListOptions = {}) {
  const session = useSession();
  const result = useQuery<{
    items: SecurityRequest[];
    page: { number: number; size: number; totalElements: number; totalPages: number };
    summary: { all: number; mine: number; staff: number; done: number };
  }>({
    queryKey: ['requests', 'list', { detailed, ...options, actor: session.data?.member.id }],
    enabled: !!session.data,
    placeholderData: (previous, query) => {
      const key = query?.queryKey[2];
      return key &&
        typeof key === 'object' &&
        'actor' in key &&
        key.actor === session.data?.member.id
        ? previous
        : undefined;
    },
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({
        page: String(options.page ?? 0),
        size: String(options.size ?? 20),
      });
      for (const [key, value] of Object.entries(options))
        if (value !== undefined && value !== '') params.set(key, String(value));
      const raw = await requestJson<unknown>(`/api/security-requests?${params}`, { signal });
      const page = dto.pageDto(dto.requestListDto).parse(raw);
      const summary = z
        .object({
          summary: z.object({
            all: z.number(),
            mine: z.number(),
            staff: z.number(),
            done: z.number(),
          }),
        })
        .parse(raw).summary;
      const items = await Promise.all(
        page.content.map(async (value) => {
          if (!detailed) return adaptList(value, session.data?.member.role);
          const [request, businessCase, parts] = await Promise.all([
            read(`/api/security-requests/${value.securityRequestId}`, dto.requestDto, signal),
            readCase(String(value.businessCaseId), signal),
            readParts(String(value.securityRequestId), signal),
          ]);
          return adaptRequest(
            request,
            businessCase.view,
            businessCase.pub,
            parts,
            session.data?.member.role,
          );
        }),
      );
      return { items, page: page.page, summary };
    },
  });
  return {
    ...result,
    data: result.data?.items,
    pagination: result.data?.page,
    summary: result.data?.summary,
  };
}

/** 관련 신청은 해당 사업 범위만 조회한다. 유형이 늘어도 첫 페이지에서 끊지 않는다. */
export function useRelatedRequests(businessCaseId?: string) {
  const session = useSession();
  return useQuery({
    queryKey: ['requests', 'related', businessCaseId, session.data?.member.id],
    enabled: !!businessCaseId && !!session.data,
    queryFn: async ({ signal }) => {
      const items: SecurityRequest[] = [];
      for (let number = 0; ; number++) {
        const page = await read(
          `/api/security-requests?businessCaseId=${encoded(businessCaseId!)}&page=${number}&size=100&sort=id,asc`,
          dto.pageDto(dto.requestListDto),
          signal,
        );
        items.push(...page.content.map((item) => adaptList(item, session.data?.member.role)));
        if (number + 1 >= page.page.totalPages) break;
      }
      return items;
    },
  });
}
/** 사업 목록에서 받은 식별자로 공통 답변을 조회한다. */
export function useCases() {
  return useQuery({
    queryKey: ['cases'],
    queryFn: async ({ signal }) => {
      const page = await read('/api/business-cases?size=100', dto.pageDto(dto.caseListDto), signal);
      return Promise.all(
        page.content.map(async (c) => (await readCase(String(c.businessCaseId), signal)).view),
      );
    },
  });
}
/** 신청 본체와 하위 자원은 독립 Query로 조회하고 어댑터에서 합친다. */
export function useRequest(id: string) {
  const session = useSession();
  const request = useQuery({
    queryKey: ['requests', id, 'body'],
    queryFn: ({ signal }) => read(`/api/security-requests/${encoded(id)}`, dto.requestDto, signal),
  });
  const caseQuery = useQuery({
    queryKey: ['cases', request.data?.businessCaseId, 'detail'],
    enabled: !!request.data,
    queryFn: ({ signal }) => readCase(String(request.data!.businessCaseId), signal),
  });
  const base = `/api/security-requests/${encoded(id)}`;
  const enabled = !!request.data;
  const queries = useQueries({
    queries: [
      {
        queryKey: ['requests', id, 'reviews'],
        enabled,
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          read(base + '/reviews', z.array(dto.reviewDto), signal),
      },
      {
        queryKey: ['requests', id, 'assignments'],
        enabled,
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          read(base + '/assignments', z.array(dto.assignmentDto), signal),
      },
      {
        queryKey: ['requests', id, 'supplements'],
        enabled,
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          read(base + '/supplements', z.array(dto.supplementDto), signal),
      },
      {
        queryKey: ['requests', id, 'returns'],
        enabled,
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          read(base + '/stage-returns', z.array(dto.returnDto), signal),
      },
      {
        queryKey: ['requests', id, 'deadlines'],
        enabled,
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          read(base + '/deadlines', z.array(dto.deadlineDto), signal),
      },
      {
        queryKey: ['requests', id, 'submissions'],
        enabled,
        queryFn: async ({ signal }: { signal: AbortSignal }) => {
          const values = await read(base + '/submissions', z.array(dto.submissionDto), signal);
          return Promise.all(
            values.map((v) =>
              read(`/api/submissions/${v.submissionId}`, dto.submissionDto, signal),
            ),
          );
        },
      },
    ],
  });
  const [reviews, assignments, supplements, returns, deadlines, submissions] = queries;
  const latest = submissions.data?.find((v) => v.latest);
  const confirmations = useQuery({
    queryKey: ['requests', id, 'confirmations', latest?.submissionId],
    enabled: !!submissions.data,
    queryFn: ({ signal }) =>
      latest
        ? read(
            `/api/submissions/${latest.submissionId}/final-confirmations`,
            z.array(dto.finalConfirmationDto),
            signal,
          )
        : Promise.resolve([]),
  });
  const error =
    request.error ?? caseQuery.error ?? queries.find((q) => q.error)?.error ?? confirmations.error;
  const parts =
    reviews.data &&
    assignments.data &&
    supplements.data &&
    returns.data &&
    deadlines.data &&
    submissions.data &&
    confirmations.data
      ? {
          reviews: reviews.data,
          assignments: assignments.data,
          supplements: supplements.data,
          returns: returns.data,
          deadlines: deadlines.data,
          submissions: submissions.data,
          finalConfirmations: confirmations.data,
        }
      : undefined;
  return {
    data:
      request.data && caseQuery.data && parts
        ? adaptRequest(
            request.data,
            caseQuery.data.view,
            caseQuery.data.pub,
            parts,
            session.data?.member.role,
          )
        : undefined,
    error,
    isPending:
      !error &&
      (request.isPending ||
        caseQuery.isPending ||
        queries.some((q) => q.isPending) ||
        confirmations.isPending),
    refetch: () =>
      Promise.all([
        request.refetch(),
        caseQuery.refetch(),
        ...queries.map((q) => q.refetch()),
        confirmations.refetch(),
      ]),
  };
}
/** 공통 정보 재조회 시에도 입력 초안을 유지한다. */
export function useCase(id: string, enabled = true) {
  return useQuery({
    queryKey: ['cases', id],
    enabled,
    queryFn: async ({ signal }) => (await readCase(id, signal)).view,
  });
}
/** 사업 생성의 summary와 숫자 식별자를 계약에 맞춘다. */
export function useCreateCase() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateCaseInput) => {
      const { description, ...rest } = input;
      const value = dto.caseDto.parse(
        await requestJson('/api/business-cases', {
          method: 'POST',
          body: { ...rest, summary: description },
        }),
      );
      return adaptCase(value, await publication(value.publicationId));
    },
    onSuccess: () => client.invalidateQueries(),
  });
}

async function saveAnswers(
  base: string,
  answers: AnswerInput[],
  existing: SecurityRequest['answers'],
  reviewId?: string,
) {
  // 일괄 요청을 보내기 전에 전체 입력을 검사해 잘못된 항목 앞의 값만 저장되지 않게 한다.
  for (const input of answers) {
    const field = existing.find((a) => a.key === input.key);
    if (!field) throw new Error('게시본에 없는 답변 항목입니다.');
    if (!input.value.trim() && !input.confirmed && !input.notApplicable) continue;
    const issue = answerValueError(field, input.notApplicable ? '미해당' : input.value);
    if (issue) throw new Error(issue);
  }
  const changed = answers.filter((a) => {
    const old = existing.find((v) => v.key === a.key);
    // 게시본에만 있고 아직 답변 행이 없는 다른 질문은 빈 값으로 생성하지 않는다.
    if (!a.notApplicable && !a.value.trim() && !old?.value.trim()) return false;
    return (
      !old ||
      old.revision === undefined ||
      old.notApplicable !== a.notApplicable ||
      (!a.notApplicable && old.value !== a.value)
    );
  });
  const payload = changed.map((a) => ({
    fieldKey: a.key,
    value: a.notApplicable ? '' : a.value,
    ...(a.notApplicable ? { notApplicable: true } : {}),
    expectedRevision: a.expectedRevision ?? existing.find((v) => v.key === a.key)?.revision,
  }));
  const saved = payload.length
    ? z
        .array(dto.answerDto)
        .parse(
          await requestJson(
            reviewId ? `/api/reviews/${encoded(reviewId)}/answers` : base + '/answers',
            { method: 'PATCH', body: { answers: payload } },
          ),
        )
    : [];
  for (const a of answers.filter((a) => a.confirmed && (a.notApplicable || a.value.trim()))) {
    const old = existing.find((v) => v.key === a.key);
    const value = saved.find((v) => v.fieldKey === a.key);
    const source = value?.valueSource ?? old?.source;
    if (!reviewId && source !== 'AI_INFERRED') continue;
    if (value?.confirmed) continue;
    if (
      !value &&
      old?.confirmed &&
      !old.needsReview &&
      (!reviewId || old.source === 'STAFF_CONFIRMED')
    )
      continue;
    const revision = value?.revision ?? a.expectedRevision ?? old?.revision;
    if (revision === undefined) throw new Error('저장된 답변을 다시 불러온 뒤 확인해 주세요.');
    const path = reviewId
      ? `/api/reviews/${encoded(reviewId)}/answers/${encoded(a.key)}/confirmation`
      : `${base}/answers/${encoded(a.key)}/confirmation`;
    await requestJson(path, { method: 'PUT', body: { expectedRevision: revision } });
  }
}
/** 답변 저장과 확인을 나누어 기존 AI 출처를 보존한다. */
export function useSaveCase(id: string, request?: SecurityRequest) {
  const client = useQueryClient();
  const session = useSession();
  const current = useCase(id);
  return useMutation({
    mutationFn: async (body: { expectedRevision: number; answers: AnswerInput[] }) => {
      const role = session.data?.member.role;
      const reviewId =
        role === 'INFRA' || role === 'SECURITY'
          ? request?.reviews.find((v) => v.field === role)?.id
          : undefined;
      if ((role === 'INFRA' || role === 'SECURITY') && !reviewId)
        throw new Error('신청 상세에서 담당 분야의 공통 답변을 입력해 주세요.');
      await saveAnswers(
        `/api/business-cases/${encoded(id)}`,
        body.answers,
        request?.commonAnswers ?? current.data?.answers ?? [],
        reviewId,
      );
    },
    onSettled: () => client.invalidateQueries(),
  });
}

/** 행위별 본문을 만들고 화면 내부 action 값은 전송하지 않는다. */
export function commandRequest(request: SecurityRequest, c: CommandInput) {
  const base = `/api/security-requests/${encoded(request.id)}`;
  const review = request.reviews.find((v) => v.field === c.field);
  const supplement = request.supplements.find((v) => v.id === c.supplementId);
  const expectedRevision = c.expectedRevision;
  switch (c.action) {
    case 'REQUEST_REVIEW':
      return { path: `${base}/reviews`, method: 'POST', body: { expectedRevision } };
    case 'COMPLETE_ALLOCATION':
    case 'COMPLETE_REVIEW':
    case 'REQUEST_SUPPLEMENT':
      if (!review) throw new Error('담당 분야의 협의 정보를 다시 불러와 주세요.');
      return {
        path: `/api/reviews/${encoded(review.id)}/${c.action === 'REQUEST_SUPPLEMENT' ? 'supplements' : c.action === 'COMPLETE_REVIEW' ? 'completion' : 'allocation-completion'}`,
        method: c.action === 'REQUEST_SUPPLEMENT' ? 'POST' : 'PUT',
        body:
          c.action === 'COMPLETE_REVIEW'
            ? {
                opinion: c.comment ?? '',
                checklist: c.checklist ?? review.checklist ?? {},
                expectedRevision: review.revision ?? expectedRevision,
              }
            : c.action === 'REQUEST_SUPPLEMENT'
              ? {
                  fieldKeys: c.fieldKeys ?? [],
                  reason: c.reason,
                  expectedRevision: review.revision ?? expectedRevision,
                }
              : { expectedRevision: review.revision ?? expectedRevision },
      };
    case 'ANSWER_SUPPLEMENT':
    case 'RESOLVE_SUPPLEMENT':
      return {
        path: `/api/supplements/${encoded(c.supplementId ?? '')}/${c.action === 'ANSWER_SUPPLEMENT' ? 'answers' : 'resolution'}`,
        method: c.action === 'ANSWER_SUPPLEMENT' ? 'POST' : 'PUT',
        body: {
          note: c.answer ?? c.comment,
          expectedRevision: supplement?.revision ?? expectedRevision,
        },
      };
    case 'RETURN':
      return {
        path: `${base}/stage-returns`,
        method: 'POST',
        body: {
          targetStage: c.targetStage,
          reason: c.reason,
          fieldKeys: c.fieldKeys ?? [],
          fieldReasons:
            c.fieldReasons ??
            Object.fromEntries((c.fieldKeys ?? []).map((k) => [k, c.reason ?? ''])),
          expectedRevision,
        },
      };
    case 'SUBMIT':
      return {
        path: `${base}/submissions`,
        method: 'POST',
        body: { expectedRevision },
        headers: { 'Idempotency-Key': c.idempotencyKey ?? crypto.randomUUID() },
      };
    case 'FINAL_CONFIRM':
    case 'FINALIZE':
      return {
        path: `/api/submissions/${encoded(request.currentSubmissionId ?? '')}/${c.action === 'FINAL_CONFIRM' ? 'final-confirmations' : 'confirmation'}`,
        method: c.action === 'FINAL_CONFIRM' ? 'POST' : 'PUT',
        body:
          c.action === 'FINAL_CONFIRM'
            ? { opinion: c.comment, expectedRevision }
            : { expectedRevision },
      };
    case 'REASSIGN':
      return {
        path: `${base}/assignments`,
        method: 'POST',
        body: { field: c.field, assigneeUsername: c.assigneeId, reason: c.reason },
      };
    case 'CLOSE':
    case 'WITHDRAW':
      return {
        path: `${base}/${c.action === 'CLOSE' ? 'closure' : 'withdrawal'}`,
        method: 'PUT',
        body: { reason: c.reason, expectedRevision },
      };
    case 'GENERATE_DRAFT':
      return { path: `${base}/draft-generations`, method: 'POST', body: { expectedRevision } };
    default:
      throw new Error('지원하지 않는 업무 요청입니다.');
  }
}
/** 서버의 422 안내를 그대로 화면의 오류 영역에 전달한다. */
export function useRequestCommand(request: SecurityRequest) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (c: CommandInput) => {
      if (c.action === 'SAVE_ANSWERS') {
        await saveAnswers(
          `/api/security-requests/${encoded(request.id)}`,
          c.answers ?? [],
          request.answers,
          c.field ? request.reviews.find((v) => v.field === c.field)?.id : undefined,
        );
        return;
      }
      const { path, ...options } = commandRequest(request, c);
      return requestJson<unknown>(path, options);
    },
    onSettled: () => client.invalidateQueries(),
  });
}
/** 명시적 요청으로 파일을 업로드하고 제한 시간 안에서 분석 상태를 조회한다. */
export function useAnalysis() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: AnalysisInput) => {
      const base = `/api/business-cases/${encoded(input.caseId)}`;
      if (input.file && /\.hwp$/i.test(input.file.name))
        throw new Error('HWPX 로 변환해 올려 주세요.');
      const businessCase = await readCase(input.caseId);
      if (input.text !== businessCase.view.description)
        await requestJson(base, {
          method: 'PUT',
          body: {
            title: businessCase.view.title,
            summary: input.text,
            department: businessCase.view.department,
            expectedRevision: input.expectedRevision,
          },
        });
      if (!input.file)
        return {
          id: '',
          caseId: input.caseId,
          revision: input.expectedRevision,
          status: 'SUCCEEDED' as const,
          mode: 'LIVE' as const,
          provider: '',
          model: '',
          error: null,
          suggestions: [],
          createdAt: new Date().toISOString(),
          summaryOnly: true,
        };
      const analysisRevision = (await readCase(input.caseId)).view.revision;
      const form = new FormData();
      form.set('file', input.file);
      const uploaded = z
        .object({ uploadedFileId: z.number() })
        .parse(await requestJson(`${base}/uploaded-files`, { method: 'POST', body: form }));
      let job = dto.analysisDto.parse(
        await requestJson(`${base}/analysis-jobs`, {
          method: 'POST',
          body: { uploadedFileId: uploaded.uploadedFileId },
        }),
      );
      for (let attempt = 0; ['QUEUED', 'RUNNING'].includes(job.status); attempt++) {
        if (attempt >= 90)
          throw new Error('분석 시간이 길어지고 있습니다. 잠시 후 다시 확인해 주세요.');
        await new Promise((resolve) => setTimeout(resolve, 2000));
        job = await read(`/api/analysis-jobs/${job.analysisJobId}`, dto.analysisDto);
      }
      if (job.status === 'FAILED')
        throw new Error(
          job.errorMessage ?? '분석에 실패했습니다. 직접 입력하거나 다시 시도해 주세요.',
        );
      return {
        id: String(job.analysisJobId),
        caseId: input.caseId,
        revision: analysisRevision,
        status: 'SUCCEEDED' as const,
        mode: 'LIVE' as const,
        provider: job.modelReference ?? '',
        model: job.modelReference ?? '',
        error: null,
        suggestions: job.summary
          ? [
              {
                key: 'project.summary',
                value: job.summary,
                evidence: job.modelReference ?? '분석 결과',
              },
            ]
          : [],
        createdAt: new Date().toISOString(),
        summaryOnly: false,
      };
    },
    onSuccess: () => client.invalidateQueries(),
  });
}
/** 적용 결과의 경고를 화면에 전달하고 사업 데이터를 갱신한다. */
export function useApplyAnalysis() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, expectedRevision }: { id: string; expectedRevision: number }) =>
      dto.applicationDto.parse(
        await requestJson(`/api/analysis-jobs/${encoded(id)}/applications`, {
          method: 'POST',
          body: { expectedRevision },
        }),
      ),
    onSuccess: () => client.invalidateQueries(),
  });
}
