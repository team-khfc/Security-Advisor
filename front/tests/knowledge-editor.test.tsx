import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from './queryRender';
import { KnowledgePage } from '@/features/knowledge/KnowledgePage';
import { KnowledgeItemEditor } from '@/features/knowledge/KnowledgeItemEditor';
import { InsightPage } from '@/features/insight/InsightPage';
import { MockKnowledge } from '@/mocks/knowledge';
import { MockConfigurations } from '@/mocks/configurations';
import { mockInsights } from '@/mocks/insights';
import { createMockState, MOCK_MEMBERS } from '@/mocks/seed';
import * as http from '@/lib/httpClient';
import { DomainError } from '@/lib/problem';
import type { Snippet } from '@/features/knowledge/types';

const session = vi.hoisted(() => ({ role: 'ADMIN' }));
vi.mock('@/features/auth', () => ({
  useSession: () => ({ data: { member: { id: 'admin', role: session.role } }, isPending: false }),
}));
const admin = MOCK_MEMBERS.find((m) => m.role === 'ADMIN')!;
let api: MockKnowledge;
beforeEach(() => {
  session.role = 'ADMIN';
  const state = createMockState(),
    settings = new MockConfigurations(state);
  api = new MockKnowledge(state, () =>
    settings.publication('current').fieldSchema.fields.map((f) => f.key),
  );
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.open = false;
    },
  });
  vi.spyOn(http, 'requestJson').mockImplementation(async (path, options) => {
    const url = new URL(path, 'http://test');
    const parts = url.pathname.split('/');
    const body = options?.body as Record<string, unknown>;
    const now = '2026-11-10T01:00:00Z';
    try {
      if (path === '/api/publications/current') return settings.publication('current');
      if (path === '/api/insights/summary') return mockInsights(state, admin, now);
      if (parts[2] === 'knowledge-drafts') {
        if (!parts[4]) return api.current(admin);
        if (parts[4] === 'comparison') return api.compare(admin);
        if (parts[4] === 'publications')
          return api.publish(admin, Number(body.expectedRevision), now);
        const kind = parts[4] === 'snippets' ? 'public' : 'private';
        return parts[5]
          ? api.item(admin, kind, Number(parts[5]))
          : api.list(
              admin,
              kind,
              url.searchParams.get('q') ?? '',
              Number(url.searchParams.get('page')),
              10,
            );
      }
      if (parts[2] === 'knowledge-publications')
        return !parts[3]
          ? api.history(admin, Number(url.searchParams.get('page')), 10)
          : parts[4] === 'comparison'
            ? api.comparison(admin, Number(parts[3]))
            : api.published(admin, Number(parts[3]));
      return api.save(
        admin,
        parts[2] === 'knowledge-snippets' ? 'public' : 'private',
        Number(parts[3]) || null,
        body,
        now,
      );
    } catch (error) {
      if (error instanceof DomainError)
        throw new http.ApiError({
          type: 'about:blank',
          title: '검증 오류',
          detail: error.message,
          status: error.status,
          code: error.code,
        });
      throw error;
    }
  });
});
afterEach(() => vi.restoreAllMocks());

test('공개 지식 초안을 저장·비교·게시하고 과거 게시 이력을 읽는다', async () => {
  const user = userEvent.setup(),
    old = api.published(admin, 1);
  render(<KnowledgePage />);
  await user.click(await screen.findByRole('button', { name: /보안 검토 안내.*편집/ }));
  const input = screen.getByLabelText('발췌 본문');
  await user.clear(input);
  await user.type(input, '합성 새 지식 v2');
  await user.click(screen.getByRole('button', { name: '초안 저장' }));
  await screen.findByText(/초안을 저장했습니다/);
  expect(api.currentId()).toBe(1);
  expect(api.publicSearch('합성 새 지식')).toHaveLength(0);
  await user.click(screen.getByRole('button', { name: '변경 검토·게시' }));
  const dialog = await screen.findByRole('dialog', { name: '지식 변경 검토·게시' });
  expect(within(dialog).getByText(/합성 새 지식 v2/)).toBeTruthy();
  await user.click(within(dialog).getByRole('button', { name: '지식 v2 게시' }));
  await waitFor(() => expect(api.currentId()).toBe(2));
  expect(api.published(admin, 1)).toEqual(old);
  await user.click(screen.getByRole('tab', { name: '게시 이력' }));
  await user.click(await screen.findByRole('button', { name: 'v2 내용 보기' }));
  expect(await screen.findByRole('dialog', { name: '지식 게시본과 변경 이력' })).toBeTruthy();
});

test('다른 관리자의 수정 충돌 시 내 입력을 보존하고 명시적으로 최신본으로 교체한다', async () => {
  const user = userEvent.setup();
  const closed = vi.fn();
  const initial = api.item(admin, 'public', 1) as Snippet;
  render(
    <KnowledgeItemEditor kind="public" initial={initial} onClose={closed} onSaved={vi.fn()} />,
  );
  await user.clear(screen.getByLabelText('발췌 본문'));
  await user.type(screen.getByLabelText('발췌 본문'), '내 입력 유지');
  api.save(
    admin,
    'public',
    1,
    { ...initial, body: '다른 관리자 입력', expectedRevision: 0 },
    '2026-11-10T02:00:00Z',
  );
  await user.click(screen.getByRole('button', { name: '초안 저장' }));
  await screen.findByText(/내 입력은 보존했습니다/);
  expect((screen.getByLabelText('발췌 본문') as HTMLTextAreaElement).value).toBe('내 입력 유지');
  await user.click(screen.getByRole('button', { name: '최신 초안 확인' }));
  await screen.findByText('다른 관리자 입력');
  await user.click(screen.getByRole('button', { name: '내 입력을 대체하고 최신본으로 편집' }));
  expect((screen.getByLabelText('발췌 본문') as HTMLTextAreaElement).value).toBe(
    '다른 관리자 입력',
  );
  await user.click(screen.getByRole('button', { name: '닫기' }));
  expect(closed).toHaveBeenCalledOnce();
});

test('비공개 필수 입력 오류를 안내하고 빈 별칭을 정리한 유효 입력은 초안으로만 저장한다', async () => {
  const user = userEvent.setup(),
    saved = vi.fn();
  render(<KnowledgeItemEditor kind="private" initial={null} onClose={vi.fn()} onSaved={saved} />);
  await user.click(screen.getByRole('button', { name: '초안 저장' }));
  expect(await screen.findByText(/정보 이름은 1~200자/)).toBeTruthy();
  expect(saved).not.toHaveBeenCalled();
  await user.type(screen.getByLabelText('정보 이름'), '합성 서버 새 초안');
  await user.type(screen.getByLabelText('속성 1 이름'), 'ip');
  await user.type(screen.getByLabelText('속성 1 값'), '192.0.2.55');
  await user.type(screen.getByLabelText('별칭'), '합성별칭{Enter}');
  await user.click(screen.getByRole('button', { name: '초안 저장' }));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(api.suggestions(admin, '합성 서버 새 초안')).toHaveLength(0);
});

test.each(['APPLICANT', 'INFRA', 'SECURITY'])(
  '%s 역할은 비공개 관리·지표 데이터를 요청하지 않는다',
  async (role) => {
    session.role = role;
    render(
      <>
        <KnowledgePage />
        <InsightPage />
      </>,
    );
    expect(screen.getAllByText(/기관 관리자만/)).toHaveLength(2);
    expect(http.requestJson).not.toHaveBeenCalled();
  },
);

test('지표는 도메인 상태를 한글로 표시하고 분모가 없는 비율은 산정 불가로 안내한다', async () => {
  render(<InsightPage />);
  await screen.findByText('업무 지표');
  expect(screen.getByText('작성 중')).toBeTruthy();
  expect(screen.getAllByText('산정할 자료 없음').length).toBeGreaterThan(0);
  expect(screen.queryByText('DRAFTING')).toBeNull();
  expect(screen.queryByRole('button', { name: /저장|게시/ })).toBeNull();
});
