import { render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { AnswerView } from '@/features/request/AnswerEditor';
import type { Answer } from '@/features/request/types';

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

function item(label: string) {
  const term = screen.getByText(label, { selector: 'dt' });
  return term.parentElement as HTMLElement;
}

describe('값 목록의 빈 값·출처 표시', () => {
  test('값도 출처도 없으면 담당자 확인 필요를 한 번만(배지로) 표시한다', () => {
    render(<AnswerView answers={[answer({ value: '', source: null, confirmed: false })]} />);
    const row = item('사업 목적');
    const notices = within(row).getAllByText('담당자 확인 필요');
    expect(notices).toHaveLength(1);
    expect(notices[0].classList.contains('badge')).toBe(true);
  });

  test('필수 빈 값이 보완 대상이어도 보완 배지와 확인 필요 배지가 각각 한 번씩 보인다', () => {
    render(
      <AnswerView
        answers={[answer({ value: '', source: null, confirmed: false })]}
        highlighted={['purpose']}
      />,
    );
    const row = item('사업 목적');
    expect(within(row).getAllByText('담당자 확인 필요')).toHaveLength(1);
    expect(within(row).getByText(/보완 필요 · 재검토/)).toBeTruthy();
  });

  test.each([
    ['사용자 답변', answer(), '사용자 답변'],
    [
      'AI 추론(미확정)',
      answer({ source: 'AI_INFERRED', confirmed: false, evidence: '합성 근거' }),
      'AI 추론 · 미확정',
    ],
    [
      '담당자 입력',
      answer({
        source: 'STAFF_INPUT',
        confirmation: {
          actorId: 'demo-infra',
          actorName: '인프라 담당 가',
          role: 'INFRA',
          at: '2026-11-08T09:00:00+09:00',
        },
      }),
      '담당자 입력',
    ],
    [
      '담당자 확인',
      answer({
        source: 'STAFF_CONFIRMED',
        confirmation: {
          actorId: 'demo-security',
          actorName: '보안 담당 가',
          role: 'SECURITY',
          at: '2026-11-08T09:00:00+09:00',
        },
      }),
      '담당자 확인',
    ],
  ])('%s 값은 값 글자와 출처 배지를 함께 유지한다', (_name, value, label) => {
    render(<AnswerView answers={[value]} />);
    const row = item('사업 목적');
    expect(within(row).getByText('합성 시험 사업')).toBeTruthy();
    expect(within(row).getByText(new RegExp(label)).classList.contains('badge')).toBe(true);
    expect(within(row).queryByText('담당자 확인 필요')).toBeNull();
  });

  test('출처는 있지만 값이 비어 있으면 빈 값 안내와 출처 배지를 함께 둔다(서로 다른 정보)', () => {
    render(<AnswerView answers={[answer({ value: '', source: 'STAFF_INPUT' })]} />);
    const row = item('사업 목적');
    expect(within(row).getByText('담당자 확인 필요').tagName).toBe('P');
    expect(within(row).getByText('담당자 입력')).toBeTruthy();
  });

  test('미해당은 값 자리에 미해당을 표시한다', () => {
    render(<AnswerView answers={[answer({ value: '', notApplicable: true })]} />);
    expect(within(item('사업 목적')).getByText('미해당')).toBeTruthy();
  });

  test('AI 확인 플래그만 있고 확인자가 없으면 미확정으로 남긴다', () => {
    render(<AnswerView answers={[answer({ source: 'AI_INFERRED', confirmed: true })]} />);
    expect(screen.getByText('AI 추론 · 미확정')).toBeTruthy();
    expect(screen.queryByText(/사용자 확인/)).toBeNull();
  });

  test('담당자가 확인한 AI 값의 확인 주체를 사용자로 바꾸지 않는다', () => {
    render(
      <AnswerView
        answers={[
          answer({
            source: 'AI_INFERRED',
            confirmation: {
              actorId: 'synthetic-infra',
              actorName: '인프라 담당 가',
              role: 'INFRA',
              at: '2026-11-09T09:00:00+09:00',
            },
          }),
        ]}
      />,
    );
    expect(screen.getByText(/AI 추론 · 담당자 확인/)).toBeTruthy();
    expect(screen.queryByText(/사용자 확인/)).toBeNull();
  });
});
