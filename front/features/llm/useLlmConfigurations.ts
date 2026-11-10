import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requestJson } from '@/lib/httpClient';
import {
  llmConfigurationSchema,
  llmManagementSchema,
  llmComparisonSchema,
  llmHistoryPageSchema,
  llmTestSchema,
  type LlmCommand,
} from './configurationTypes';

/** 관리자 화면의 목록과 실제 용도별 선택 결과를 같은 갱신 단위로 조회한다. */
export function useLlmConfigurations() {
  return useQuery({
    queryKey: ['llm-admin', 'list'],
    queryFn: async ({ signal }) => {
      const [list, management] = await Promise.all([
        requestJson('/api/llm-configurations', { signal }),
        requestJson('/api/llm-configurations/management', { signal }),
      ]);
      return {
        list: llmConfigurationSchema.array().parse(list),
        management: llmManagementSchema.parse(management),
      };
    },
  });
}
/** 과거 구성의 사본을 페이지별로 조회하며 구성 간 캐시를 분리한다. */
export function useLlmHistory(id: number, page: number) {
  return useQuery({
    queryKey: ['llm-admin', 'history', id, page],
    queryFn: async ({ signal }) =>
      llmHistoryPageSchema.parse(
        await requestJson(`/api/llm-configurations/${id}/history?page=${page}&size=10`, { signal }),
      ),
  });
}
/** 상태 변경과 연결 시험은 명시적인 사용자 동작으로만 실행한다. */
export function useLlmActions() {
  const client = useQueryClient();
  const compare = useMutation({
    mutationFn: async ({ id, command }: { id: number | null; command: LlmCommand }) =>
      llmComparisonSchema.parse(
        await requestJson(`/api/llm-configurations${id === null ? '' : `/${id}`}/comparisons`, {
          method: 'POST',
          body: command,
        }),
      ),
  });
  const save = useMutation({
    mutationFn: async ({
      id,
      command,
      historyId,
    }: {
      id: number | null;
      command: LlmCommand;
      historyId?: number;
    }) => {
      const restoring = historyId !== undefined;
      const path = `/api/llm-configurations${id === null ? '' : `/${id}`}${restoring ? '/restorations' : ''}`;
      return llmConfigurationSchema.parse(
        await requestJson(path, {
          method: id === null || restoring ? 'POST' : 'PUT',
          body: restoring
            ? { historyId, expectedRevision: command.expectedRevision, reason: command.reason }
            : command,
        }),
      );
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['llm-admin'] }),
  });
  const test = useMutation({
    mutationFn: async ({ id, command }: { id: number | null; command: LlmCommand }) =>
      llmTestSchema.parse(
        await requestJson('/api/llm-connection-tests', {
          method: 'POST',
          body: {
            configurationId: id,
            expectedRevision: command.expectedRevision,
            configuration: command,
          },
        }),
      ),
  });
  const latest = useMutation({
    mutationFn: async (id: number) =>
      llmConfigurationSchema.parse(await requestJson(`/api/llm-configurations/${id}`)),
    onSuccess: () => client.invalidateQueries({ queryKey: ['llm-admin'] }),
  });
  return { compare, save, test, latest };
}
