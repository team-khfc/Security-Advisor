import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requestJson } from '@/lib/httpClient';
import {
  comparisonSchema,
  configurationSchema,
  historySchema,
  publicationSchema,
  type Settings,
} from './types';

/** 관리자 초안·게시본은 같은 출처 세션과 계약 검증을 거쳐 읽는다. */
export function useConfiguration() {
  return useQuery({
    queryKey: ['configuration'],
    queryFn: async ({ signal }) =>
      configurationSchema.parse(await requestJson('/api/configurations/current', { signal })),
  });
}
/** 게시 완료 시 새 신청의 설정 조회도 갱신한다. */
export function useConfigurationActions() {
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: async (input: {
      id: number;
      draft: Settings;
      note: string;
      expectedRevision: number;
    }) =>
      configurationSchema.parse(
        await requestJson(`/api/configurations/${input.id}`, {
          method: 'PUT',
          body: { draft: input.draft, note: input.note, expectedRevision: input.expectedRevision },
        }),
      ),
    onSuccess: (data) => client.setQueryData(['configuration'], data),
  });
  const compare = useMutation({
    mutationFn: async (id: number) =>
      comparisonSchema.parse(await requestJson(`/api/configurations/${id}/comparison`)),
  });
  const publish = useMutation({
    mutationFn: async (input: { id: number; expectedRevision: number }) =>
      publicationSchema.parse(
        await requestJson(`/api/configurations/${input.id}/publications`, {
          method: 'POST',
          body: { expectedRevision: input.expectedRevision },
        }),
      ),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['configuration'] });
      await client.invalidateQueries({ queryKey: ['publications'] });
    },
  });
  return { save, compare, publish };
}
/** 현재 게시본 또는 과거 게시본의 고정된 내용을 읽는다. */
export function usePublication(id: number | 'current' | null) {
  return useQuery({
    queryKey: ['publications', id],
    enabled: id !== null,
    queryFn: async ({ signal }) =>
      publicationSchema.parse(await requestJson(`/api/publications/${id}`, { signal })),
  });
}
/** 게시 이력은 전체 건수를 포함한 서버 페이지를 사용한다. */
export function usePublicationHistory(page: number) {
  return useQuery({
    queryKey: ['publications', 'history', page],
    queryFn: async ({ signal }) =>
      historySchema.parse(await requestJson(`/api/publications?page=${page}&size=10`, { signal })),
  });
}
/** 게시 당시 기준과 비교하며 나중에 저장한 초안을 사용하지 않는다. */
export function usePublishedComparison(id: number | null) {
  return useQuery({
    queryKey: ['publications', id, 'comparison'],
    enabled: id !== null,
    queryFn: async ({ signal }) =>
      comparisonSchema.parse(await requestJson(`/api/publications/${id}/comparison`, { signal })),
  });
}
