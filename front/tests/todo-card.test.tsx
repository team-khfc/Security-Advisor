import { render, screen, within } from '@testing-library/react';
import { expect, test } from 'vitest';
import { TodoCard } from '@/features/notification/TodoCard';

test('처리 카드에 사업·서류·상태와 다음 행동을 표시한다', () => {
  render(
    <TodoCard
      item={{
        key: 'REVIEW:5',
        kind: 'REVIEW',
        securityRequestId: 5,
        title: '신청 #5 · 담당자 협의',
        link: '/requests/5',
        context: {
          caseTitle: '합성 자료 조회 사업',
          department: '합성 운영부',
          docType: 'SECURITY_REVIEW',
          statusLabel: '사전 협의 중',
          stage: 2,
          updatedAt: '2026-11-11T00:00:00Z',
        },
      }}
    />,
  );
  const card = screen.getByRole('article');
  expect(within(card).getByRole('heading', { name: '합성 자료 조회 사업' })).toBeTruthy();
  expect(within(card).getByText('합성 운영부')).toBeTruthy();
  expect(within(card).getByText(/보안성검토 신청서/)).toBeTruthy();
  expect(within(card).getByText(/서버·네트워크 구성을 검토/)).toBeTruthy();
  expect(
    within(card).getByRole('link', { name: '담당자 협의하러 가기' }).getAttribute('href'),
  ).toBe('/requests/5');
});
