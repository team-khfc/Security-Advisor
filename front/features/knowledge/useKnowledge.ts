import { useQuery, useQueryClient } from '@tanstack/react-query';
import { requestJson } from '@/lib/httpClient';
import {
  comparisonSchema,
  contextSchema,
  draftSchema,
  pageSchema,
  publicationSchema,
  snapshotSchema,
  snippetSchema,
} from './types';

export function useKnowledgeDraft() {
  return useQuery({
    queryKey: ['knowledge', 'draft'],
    queryFn: async ({ signal }) =>
      draftSchema.parse(await requestJson('/api/knowledge-drafts/current', { signal })),
  });
}
export function useKnowledgeList(kind: 'public' | 'private', q: string, page: number) {
  return useQuery({
    queryKey: ['knowledge', 'list', kind, q, page],
    queryFn: async ({ signal }) => {
      const result = await requestJson(
        `/api/knowledge-drafts/current/${kind === 'public' ? 'snippets' : 'private-contexts'}?page=${page}&size=10&q=${encodeURIComponent(q)}`,
        { signal },
      );
      return kind === 'public'
        ? pageSchema(snippetSchema).parse(result)
        : pageSchema(contextSchema).parse(result);
    },
  });
}
export function useKnowledgeHistory(page: number) {
  return useQuery({
    queryKey: ['knowledge', 'history', page],
    queryFn: async ({ signal }) =>
      pageSchema(publicationSchema).parse(
        await requestJson(`/api/knowledge-publications?page=${page}&size=10`, { signal }),
      ),
  });
}
export function useKnowledgeSnapshot(id: number | null) {
  return useQuery({
    queryKey: ['knowledge', 'snapshot', id],
    enabled: id !== null,
    queryFn: async ({ signal }) => ({
      snapshot: snapshotSchema.parse(
        await requestJson(`/api/knowledge-publications/${id}`, { signal }),
      ),
      comparison: comparisonSchema.parse(
        await requestJson(`/api/knowledge-publications/${id}/comparison`, { signal }),
      ),
    }),
  });
}
export function useRefreshKnowledge() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: ['knowledge'] });
}
