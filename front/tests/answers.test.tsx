import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { AnswerEditor, AnswerView } from '@/features/request/AnswerEditor';
import type { Answer } from '@/features/request/types';
import { MOCK_MEMBERS } from '@/mocks/seed';
import { clearInputDraft, getInputDraft } from '@/lib/inputDrafts';

const applicant = MOCK_MEMBERS[0];
const infra = MOCK_MEMBERS.find((member) => member.role === 'INFRA')!;
const otherApplicant = MOCK_MEMBERS.find((member) => member.username === 'applicant2')!;
const recoveryKey = 'request:recovery-test:answers';
afterEach(() => {
  for (const actor of [applicant, otherApplicant]) clearInputDraft(actor.id, recoveryKey);
});
function answer(overrides: Partial<Answer> = {}): Answer {
  return {
    key: 'purpose',
    label: '사업 목적',
    scope: 'CASE',
    ownerRole: 'APPLICANT',
    required: true,
    value: '합성 시험 사업',
    source: 'USER_ANSWER',
    evidence: null,
    confirmed: true,
    notApplicable: false,
    confirmation: null,
    ...overrides,
  };
}

describe('답변의 출처와 입력 보존', () => {
  test('다른 담당 분야의 AI 값·재검토 항목은 확인 UI도 제공하지 않는다', () => {
    render(
      <AnswerEditor
        answers={[answer({ ownerRole: 'SECURITY', source: 'AI_INFERRED', needsReview: true })]}
        revision={1}
        actor={infra}
        onSave={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: '답변 저장' })).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  test('잘못된 기간은 전송하지 않고 입력과 오류를 보존한다', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <AnswerEditor
        answers={[answer({ inputType: 'DATE_RANGE', value: '2028-01-01~2028-12-31' })]}
        revision={1}
        actor={applicant}
        onSave={onSave}
      />,
    );
    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, '2028-12-31~2028-01-01');
    await user.click(screen.getByRole('button', { name: '답변 저장' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/종료일은 시작일보다 빠를 수 없습니다/)).toBeTruthy();
    expect((input as HTMLTextAreaElement).value).toBe('2028-12-31~2028-01-01');
  });
  test('반환된 사용자 답변은 담당자가 원문을 바꾸지 않고 명시적으로 재확인한다', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <AnswerEditor
        answers={[answer({ needsReview: true, revision: 7 })]}
        revision={4}
        actor={infra}
        onSave={onSave}
      />,
    );
    expect(
      screen.getByRole<HTMLTextAreaElement>('textbox', { name: /^사업 목적(?: \(필수\))?$/ })
        .readOnly,
    ).toBe(true);
    expect(
      screen.getByRole<HTMLInputElement>('checkbox', { name: '이 항목의 내용을 확인했습니다' })
        .checked,
    ).toBe(false);
    await user.click(screen.getByRole('button', { name: '답변 저장' }));
    expect(onSave).toHaveBeenLastCalledWith(4, []);
    await user.click(screen.getByRole('checkbox', { name: '이 항목의 내용을 확인했습니다' }));
    await user.click(screen.getByRole('button', { name: '답변 저장' }));
    expect(onSave).toHaveBeenLastCalledWith(4, [
      expect.objectContaining({
        key: 'purpose',
        value: '합성 시험 사업',
        confirmed: true,
        expectedRevision: 7,
      }),
    ]);
  });
  test('AI 추론은 근거와 미확정을 표시하며 HTML을 실행 가능한 노드로 만들지 않는다', () => {
    const value = '<img src=x onerror=alert(1)>';
    const { container } = render(
      <AnswerView
        answers={[
          answer({
            value,
            source: 'AI_INFERRED',
            confirmed: false,
            evidence: '사용자가 제공한 공개 설명',
          }),
        ]}
      />,
    );
    expect(screen.getByText('AI 추론 · 미확정')).toBeTruthy();
    expect(screen.getByText(value)).toBeTruthy();
    expect(screen.getByText('사용자가 제공한 공개 설명')).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
  });

  test('출처가 없는 값은 담당자 확인 필요로 표시한다', () => {
    render(<AnswerView answers={[answer({ source: null })]} />);
    expect(screen.getByText('담당자 확인 필요')).toBeTruthy();
  });

  test('수정 도중 서버 값이 바뀌어도 입력을 보존하고 비교 후 새 revision으로 저장한다', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <AnswerEditor answers={[answer()]} revision={1} actor={applicant} onSave={onSave} />,
    );
    await user.clear(screen.getByLabelText(/^사업 목적(?: \(필수\))?$/));
    await user.type(screen.getByLabelText(/^사업 목적(?: \(필수\))?$/), '작성 중인 내 답변');
    rerender(
      <AnswerEditor
        answers={[answer({ value: '다른 창에서 저장한 답변' })]}
        revision={2}
        actor={applicant}
        onSave={onSave}
      />,
    );
    expect((screen.getByLabelText(/^사업 목적(?: \(필수\))?$/) as HTMLTextAreaElement).value).toBe(
      '작성 중인 내 답변',
    );
    expect((screen.getByRole('button', { name: '답변 저장' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.getByText('다른 창에서 저장한 답변')).toBeTruthy();
    await user.click(
      screen.getByRole('button', { name: '내 입력을 유지하고 최신 버전 기준으로 저장 준비' }),
    );
    await user.click(screen.getByRole('button', { name: '답변 저장' }));
    expect(onSave).toHaveBeenCalledWith(2, [
      expect.objectContaining({ key: 'purpose', value: '작성 중인 내 답변', confirmed: false }),
    ]);
  });

  test('저장 실패 시 오류를 알리고 사용자가 쓴 값을 지우지 않는다', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockRejectedValue(new Error('수정본이 충돌했습니다.'));
    render(<AnswerEditor answers={[answer()]} revision={1} actor={applicant} onSave={onSave} />);
    await user.type(screen.getByLabelText(/^사업 목적(?: \(필수\))?$/), ' 보완');
    await user.click(screen.getByRole('button', { name: '답변 저장' }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('입력값은 지워지지 않았습니다.'),
    );
    expect((screen.getByLabelText(/^사업 목적(?: \(필수\))?$/) as HTMLTextAreaElement).value).toBe(
      '합성 시험 사업 보완',
    );
  });

  test('입력 중이 아니면 새 서버 값을 반영하고 새 AI 필드도 확인 후 저장한다', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <AnswerEditor answers={[answer()]} revision={1} actor={applicant} onSave={onSave} />,
    );
    rerender(
      <AnswerEditor
        answers={[
          answer({ value: '변경된 사업 목적' }),
          answer({
            key: 'finalSummary',
            label: '최종 요약',
            source: 'AI_INFERRED',
            confirmed: false,
            value: '합성 AI 최종 초안',
          }),
        ]}
        revision={2}
        actor={applicant}
        onSave={onSave}
      />,
    );
    expect((screen.getByLabelText(/^사업 목적(?: \(필수\))?$/) as HTMLTextAreaElement).value).toBe(
      '변경된 사업 목적',
    );
    await user.click(screen.getAllByRole('checkbox', { name: '이 항목의 내용을 확인했습니다' })[1]);
    await user.click(screen.getByRole('button', { name: '답변 저장' }));
    expect(onSave).toHaveBeenCalledWith(
      2,
      expect.arrayContaining([
        expect.objectContaining({
          key: 'finalSummary',
          value: '합성 AI 최종 초안',
          confirmed: true,
        }),
      ]),
    );
  });

  test('INFRA는 자기 필드를 편집하고 다른 역할의 AI 값은 확인만 한다', () => {
    render(
      <AnswerEditor
        answers={[
          answer({ source: 'AI_INFERRED', confirmed: false }),
          answer({
            key: 'sourceIp',
            label: '출발지 IP',
            ownerRole: 'INFRA',
            value: '192.0.2.20',
            source: 'STAFF_INPUT',
          }),
          answer({ key: 'privateApplicant', source: 'USER_ANSWER', label: '일반 답변' }),
        ]}
        revision={1}
        actor={infra}
        onSave={vi.fn()}
      />,
    );
    expect(
      (screen.getByLabelText(/^사업 목적(?: \(필수\))?$/) as HTMLTextAreaElement).readOnly,
    ).toBe(true);
    expect((screen.getByLabelText('출발지 IP (필수)') as HTMLTextAreaElement).readOnly).toBe(false);
    expect(screen.queryByLabelText('일반 답변 (필수)')).toBeNull();
  });

  test('세션 만료처럼 편집기가 사라져도 같은 계정 입력을 복원하고 다른 계정에는 노출하지 않는다', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const first = render(
      <AnswerEditor
        draftKey={recoveryKey}
        answers={[answer()]}
        revision={1}
        actor={applicant}
        onSave={onSave}
      />,
    );
    await user.clear(screen.getByLabelText(/^사업 목적(?: \(필수\))?$/));
    await user.type(
      screen.getByLabelText(/^사업 목적(?: \(필수\))?$/),
      '아직 저장하지 않은 합성 답변',
    );
    first.unmount();
    const second = render(
      <AnswerEditor
        draftKey={recoveryKey}
        answers={[answer({ value: '다른 계정의 서버 값' })]}
        revision={1}
        actor={otherApplicant}
        onSave={onSave}
      />,
    );
    expect((screen.getByLabelText(/^사업 목적(?: \(필수\))?$/) as HTMLTextAreaElement).value).toBe(
      '다른 계정의 서버 값',
    );
    second.unmount();
    render(
      <AnswerEditor
        draftKey={recoveryKey}
        answers={[answer({ value: '서버의 새 답변' })]}
        revision={2}
        actor={applicant}
        onSave={onSave}
      />,
    );
    expect((screen.getByLabelText(/^사업 목적(?: \(필수\))?$/) as HTMLTextAreaElement).value).toBe(
      '아직 저장하지 않은 합성 답변',
    );
    expect((screen.getByRole('button', { name: '답변 저장' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    await user.click(
      screen.getByRole('button', { name: '내 입력을 유지하고 최신 버전 기준으로 저장 준비' }),
    );
    await user.click(screen.getByRole('button', { name: '답변 저장' }));
    await waitFor(() => expect(getInputDraft(applicant.id, recoveryKey)).toBeUndefined());
    expect(onSave).toHaveBeenCalledWith(2, [
      expect.objectContaining({ value: '아직 저장하지 않은 합성 답변' }),
    ]);
  });

  test.each([false, true])(
    '다른 역할 AI 값의 기존 confirmed=%s 상태를 담당자 자신의 저장에 섞지 않는다',
    async (confirmed) => {
      const user = userEvent.setup();
      const onSave = vi.fn().mockResolvedValue(undefined);
      render(
        <AnswerEditor
          answers={[
            answer({ source: 'AI_INFERRED', confirmed }),
            answer({
              key: 'sourceIp',
              label: '출발지 IP',
              ownerRole: 'INFRA',
              value: '192.0.2.20',
              source: 'STAFF_INPUT',
            }),
          ]}
          revision={3}
          actor={infra}
          onSave={onSave}
        />,
      );
      await user.type(screen.getByLabelText('출발지 IP (필수)'), ' 합성 검증');
      await user.click(screen.getByRole('button', { name: '답변 저장' }));
      expect(onSave).toHaveBeenCalledWith(3, [expect.objectContaining({ key: 'sourceIp' })]);
      await user.click(
        screen.getAllByRole('checkbox', { name: '이 항목의 내용을 확인했습니다' })[0],
      );
      await user.click(screen.getByRole('button', { name: '답변 저장' }));
      expect(onSave).toHaveBeenLastCalledWith(
        3,
        expect.arrayContaining([expect.objectContaining({ key: 'purpose', confirmed: true })]),
      );
    },
  );
});

test('신청자에게 필수 문구와 선택 문구를 임의로 표시하지 않는다', () => {
  render(
    <AnswerEditor
      actor={applicant}
      revision={1}
      onSave={vi.fn()}
      answers={[
        answer({ key: 'firewall.protocol', label: '프로토콜', scope: 'REQUEST', required: true }),
      ]}
    />,
  );
  expect(screen.getByRole('textbox', { name: '프로토콜' })).toBeTruthy();
  expect(screen.queryByText('(필수)')).toBeNull();
  expect(screen.queryByText('(선택)')).toBeNull();
});

test('현업 방화벽 답변은 선택형 통신 입력과 달력을 제공하고 저장 위에서 한 번 확인한다', async () => {
  const user = userEvent.setup();
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(
    <AnswerEditor
      actor={applicant}
      revision={1}
      onSave={onSave}
      answers={[
        answer({
          key: 'firewall.protocol',
          required: false,
          label: '프로토콜',
          scope: 'REQUEST',
          value: '',
          confirmed: false,
        }),
        answer({
          key: 'firewall.port',
          required: false,
          label: '포트',
          scope: 'REQUEST',
          value: '',
          confirmed: false,
        }),
        answer({
          key: 'firewall.period',
          label: '허용 기간',
          scope: 'REQUEST',
          value: '2026-11-10 ~ 2026-12-10',
          confirmed: false,
        }),
        answer({
          key: 'firewall.purpose',
          label: '허용 목적',
          scope: 'REQUEST',
          value: '합성 서비스 연결',
          confirmed: false,
        }),
      ]}
    />,
  );
  expect(screen.getByRole('textbox', { name: '프로토콜 (선택)' }).tagName).toBe('INPUT');
  expect(screen.getByRole('textbox', { name: '포트 (선택)' }).tagName).toBe('INPUT');
  expect(screen.getByLabelText('시작일').getAttribute('type')).toBe('date');
  expect(screen.getByLabelText('종료일').getAttribute('type')).toBe('date');
  expect(screen.queryByLabelText('이 항목의 내용을 확인했습니다')).toBeNull();
  await user.click(screen.getByLabelText('작성한 답변의 내용을 확인했습니다'));
  await user.click(screen.getByRole('button', { name: '답변 저장' }));
  await waitFor(() =>
    expect(onSave).toHaveBeenCalledWith(
      1,
      expect.arrayContaining([
        expect.objectContaining({ key: 'firewall.protocol', value: '', confirmed: false }),
        expect.objectContaining({ key: 'firewall.port', value: '', confirmed: false }),
        expect.objectContaining({ key: 'firewall.period', confirmed: true }),
        expect.objectContaining({ key: 'firewall.purpose', confirmed: true }),
      ]),
    ),
  );
});
