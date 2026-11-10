'use client';

import { useSession } from '@/features/auth';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { auditDto, pageDto } from '@/features/request/apiTypes';
import { adaptAudit } from '@/features/request/adapters/backend';
import { requestJson } from './httpClient';
import type { Installation } from './types';

const installationSchema = z.union([
  // Back InstallationController의 공개 계약은 name/code이며 실행 모드 값은 포함하지 않는다.
  z.object({ name: z.string().trim().min(1), code: z.string() }).transform((value) => ({
    institutionName: value.name,
    institutionCode: value.code,
    mode: 'api' as const,
  })),
  z.object({
    institutionName: z.string().trim().min(1),
    institutionCode: z.string(),
    mode: z.literal('mock'),
  }),
]);

/** 기관 정보는 설치값의 읽기 전용 표시이며 기관 선택 기능을 만들지 않는다. */
export function useInstallation() {
  return useQuery({
    queryKey: ['installation'],
    queryFn: async ({ signal }): Promise<Installation> =>
      installationSchema.parse(await requestJson<unknown>('/api/installation', { signal })),
    staleTime: Infinity,
    retry: false,
  });
}

/** 검색 조건·현재 계정·조회 기준을 캐시 키에 포함한다. */
export function useAudit(
  requestId?: string,
  options: {
    page?: number;
    size?: number;
    query?: string;
    action?: string;
    throughId?: number;
  } = {},
) {
  const session = useSession();
  const result = useQuery<{
    entries: ReturnType<typeof adaptAudit>[];
    pagination: { number: number; size: number; totalElements: number; totalPages: number };
    throughId: number;
  }>({
    queryKey: ['audit', requestId, session.data?.member.id, options],
    enabled: !!session.data,
    placeholderData: (previous, query) =>
      query?.queryKey[1] === requestId && query?.queryKey[2] === session.data?.member.id
        ? previous
        : undefined,
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({
        page: String(options.page ?? 0),
        size: String(options.size ?? 20),
      });
      if (requestId) {
        params.set('targetType', 'SECURITY_REQUEST');
        params.set('targetId', requestId);
      }
      for (const [key, value] of Object.entries(options))
        if (value !== undefined && value !== '') params.set(key, String(value));
      const raw = await requestJson<unknown>(`/api/audit-events?${params}`, { signal });
      const page = pageDto(auditDto).parse(raw);
      const throughId = z.object({ throughId: z.number() }).parse(raw).throughId;
      return { entries: page.content.map(adaptAudit), pagination: page.page, throughId };
    },
    retry: false,
  });
  return {
    ...result,
    data: result.data?.entries,
    pagination: result.data?.pagination,
    throughId: result.data?.throughId,
  };
}
