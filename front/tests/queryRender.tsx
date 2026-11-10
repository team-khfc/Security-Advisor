import type { ReactElement } from 'react';
import { render as renderView } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/** 각 테스트의 서버 상태를 격리하고 실패한 질의를 자동 재시도하지 않는다. */
export function render(view: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return renderView(view, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}
