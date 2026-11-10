import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from './queryRender';
import { LlmConfigurationPage } from '@/features/llm/LlmConfigurationPage';
import { MockLlmConfigurations } from '@/mocks/llmConfigurations';
import { createMockState, MOCK_MEMBERS } from '@/mocks/seed';
import * as http from '@/lib/httpClient';
import { DomainError } from '@/lib/problem';

const session = vi.hoisted(() => ({ role: 'ADMIN' }));
vi.mock('@/features/auth', () => ({
  useSession: () => ({ data: { member: { id: 'admin', role: session.role } }, isPending: false }),
}));
const admin = MOCK_MEMBERS.find((m) => m.role === 'ADMIN')!;
const now = '2026-11-10T02:00:00Z';
let api: MockLlmConfigurations;
beforeEach(() => {
  session.role = 'ADMIN';
  api = new MockLlmConfigurations(createMockState());
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
    const url = new URL(path, 'http://test'),
      parts = url.pathname.split('/'),
      id = Number(parts[3]) || null,
      body = options?.body;
    try {
      if (parts[2] === 'llm-connection-tests') return api.test(admin, body, now);
      if (parts[3] === 'management') return api.management(admin);
      if (parts[3] === 'comparisons' || parts[4] === 'comparisons')
        return api.compare(admin, id, body);
      if (parts[4] === 'restorations') return api.restore(admin, id!, body, now);
      if (parts[4] === 'history')
        return api.history(admin, id!, Number(url.searchParams.get('page')), 10);
      if (options?.method === 'PUT' || options?.method === 'POST')
        return api.save(admin, id, body, now);
      return id ? api.item(admin, id) : api.list(admin);
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

test('변경 비교 후에만 적용하고 과거 이력을 사유와 함께 새 버전으로 복원한다', async () => {
  const user = userEvent.setup();
  render(<LlmConfigurationPage />);
  await user.click(await screen.findByRole('button', { name: '합성 기본 모델 편집' }));
  const model = screen.getByLabelText('모델명');
  await user.clear(model);
  await user.type(model, 'synthetic/second');
  expect(screen.queryByRole('button', { name: '변경 적용' })).toBeNull();
  await user.click(screen.getByRole('button', { name: '변경 비교' }));
  await user.click(await screen.findByRole('button', { name: '변경 적용' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(api.item(admin, 1).model).toBe('synthetic/second');
  await user.click(screen.getByRole('button', { name: '합성 기본 모델 변경 이력' }));
  await user.click(await screen.findByRole('button', { name: '이력 #1 상세' }));
  await user.click(screen.getByRole('button', { name: '이 값으로 복원 검토' }));
  await user.type(screen.getByLabelText('복원 사유'), '합성 복원 검증');
  await user.click(screen.getByRole('button', { name: '변경 비교' }));
  await user.click(await screen.findByRole('button', { name: '이 구성으로 복원' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(api.item(admin, 1)).toMatchObject({ model: 'synthetic/model', revision: 2 });
  expect(api.history(admin, 1, 0, 10).content[0]).toMatchObject({
    action: 'RESTORED',
    restoredFromId: 1,
  });
});

test('비교 이후 동시 수정 충돌에서도 입력을 보존하고 명시적으로 최신 값으로 교체한다', async () => {
  const user = userEvent.setup();
  render(<LlmConfigurationPage />);
  await user.click(await screen.findByRole('button', { name: '합성 기본 모델 편집' }));
  await user.clear(screen.getByLabelText('모델명'));
  await user.type(screen.getByLabelText('모델명'), 'synthetic/mine');
  await user.click(screen.getByRole('button', { name: '변경 비교' }));
  await screen.findByRole('button', { name: '변경 적용' });
  api.save(
    admin,
    1,
    { ...api.item(admin, 1), model: 'synthetic/theirs', expectedRevision: 0 },
    now,
  );
  await user.click(screen.getByRole('button', { name: '변경 적용' }));
  await screen.findByText(/내 입력은 보존했습니다/);
  expect((screen.getByLabelText('모델명') as HTMLInputElement).value).toBe('synthetic/mine');
  await user.click(screen.getByRole('button', { name: '최신 구성 확인' }));
  await user.click(await screen.findByRole('button', { name: '내 입력을 최신 값으로 교체' }));
  expect((screen.getByLabelText('모델명') as HTMLInputElement).value).toBe('synthetic/theirs');
  expect(api.history(admin, 1, 0, 10).totalElements).toBe(2);
});

test('모의 연결은 실제 성공으로 표시하지 않고 입력 변경 시 지난 시험 결과를 제거한다', async () => {
  const user = userEvent.setup();
  render(<LlmConfigurationPage />);
  await user.click(await screen.findByRole('button', { name: '합성 기본 모델 편집' }));
  await user.click(screen.getByRole('button', { name: '연결 시험' }));
  await screen.findByText('모의 시험 결과');
  expect(screen.queryByText('연결 성공', { exact: true })).toBeNull();
  expect(api.history(admin, 1, 0, 10).totalElements).toBe(1);
  await user.type(screen.getByLabelText('모델명'), '-edited');
  expect(screen.queryByText('모의 시험 결과')).toBeNull();
  await user.click(screen.getByRole('button', { name: '닫기' }));
  await screen.findByText('아직 적용하지 않은 입력이 있습니다.');
  await user.click(screen.getByRole('button', { name: '계속 편집' }));
  expect(screen.getByRole('dialog')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: '닫기' }));
  await user.click(screen.getByRole('button', { name: '저장하지 않고 닫기' }));
  expect(document.activeElement).toBe(screen.getByRole('button', { name: '합성 기본 모델 편집' }));
});

test.each(['APPLICANT', 'INFRA', 'SECURITY'])(
  '%s 화면은 관리자 데이터를 조회하지 않는다',
  async (role) => {
    session.role = role;
    render(<LlmConfigurationPage />);
    expect(screen.getByText('기관 관리자만 AI 모델 구성을 관리할 수 있습니다.')).toBeTruthy();
    expect(http.requestJson).not.toHaveBeenCalled();
  },
);
