'use client';

import { useState, type ReactNode } from 'react';
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';

/** 서버 데이터 캐시는 탭 메모리에만 유지한다. */
export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => {
    const queryClient: QueryClient = new QueryClient({
      mutationCache: new MutationCache({
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: ['activity'] });
        },
      }),
      defaultOptions: {
        queries: { staleTime: 15_000, retry: false, refetchOnWindowFocus: false },
        mutations: { retry: false },
      },
    });
    return queryClient;
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
