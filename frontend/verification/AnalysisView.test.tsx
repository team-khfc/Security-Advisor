// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AnalysisView, EvidenceList } from '@/features/request';
import { previewRequest, previewAnalyses } from '@/features/preview';

afterEach(cleanup);

test('AI 후보에는 미확정 상태와 원문 근거를 함께 표시한다', () => {
  const answer = previewRequest.answers.find((entry) => entry.key === 'dataTypes');
  expect(answer).toBeDefined();
  render(<EvidenceList answers={answer ? [answer] : []} />);
  expect(screen.getByText('AI 제안 · 미확정')).toBeTruthy();
  expect(screen.getByText(/원문 근거: 합성 사업개요서/)).toBeTruthy();
  expect(screen.queryByText('확인 완료')).toBeNull();
});

test.each([
  { withFile: false, button: '사업 설명 AI 분석 시작' },
  { withFile: true, button: '파일 전송 및 AI 분석 시작' },
])(
  '읽기전용 시안의 $button 및 적용은 업무 요청을 실행하지 않는다',
  async ({ withFile, button }) => {
    const onAnalyze = vi.fn(async () => undefined);
    const onApply = vi.fn(async () => undefined);
    const user = userEvent.setup();
    render(
      <AnalysisView
        procedure={previewRequest}
        analyses={previewAnalyses}
        initialInput={
          withFile
            ? {
                text: '',
                file: new File(['합성 공개 자료'], 'synthetic-plan.txt', { type: 'text/plain' }),
              }
            : undefined
        }
        preview
        onAnalyze={onAnalyze}
        onApply={onApply}
      />,
    );
    const analyze = screen.getByRole<HTMLButtonElement>('button', {
      name: button,
    });
    const apply = screen.getByRole<HTMLButtonElement>('button', {
      name: '정보 후보를 답변 초안에 적용',
    });
    expect(analyze.disabled).toBe(true);
    expect(apply.disabled).toBe(true);
    await user.click(analyze);
    await user.click(apply);
    expect(onAnalyze).not.toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getAllByText('AI 제안 · 미확정')).toHaveLength(3);
  },
);

test('성공했던 파일을 재분석하다 실패하면 이전 성공 표시를 남기지 않는다', async () => {
  const user = userEvent.setup();
  const onAnalyze = vi
    .fn()
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error('합성 연결 실패'));
  render(
    <AnalysisView
      procedure={{ ...previewRequest, allowedActions: ['ANALYZE'] }}
      analyses={[]}
      initialInput={{
        text: '',
        file: new File(['합성 공개 자료'], 'synthetic-plan.txt', { type: 'text/plain' }),
      }}
      onAnalyze={onAnalyze}
    />,
  );
  await user.click(screen.getByRole('button', { name: '파일 전송 및 AI 분석 시작' }));
  expect(screen.getByText('분석 완료')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: '파일 전송 및 AI 분석 시작' }));
  expect(onAnalyze).toHaveBeenCalledTimes(2);
  expect(screen.queryByText('분석 완료')).toBeNull();
});

test('파일 선택만으로 전송하지 않고 명시적 분석 클릭에서만 파일을 전달한다', async () => {
  const user = userEvent.setup();
  const onAnalyze = vi.fn(async () => undefined);
  render(
    <AnalysisView
      procedure={{ ...previewRequest, allowedActions: ['ANALYZE'] }}
      analyses={[]}
      onAnalyze={onAnalyze}
    />,
  );
  const file = new File(['공개 자료와 합성 질문을 활용합니다.'], 'synthetic-plan.txt', {
    type: 'text/plain',
  });
  await user.upload(screen.getByLabelText('사업 자료 파일 선택'), file);
  expect(onAnalyze).not.toHaveBeenCalled();
  expect(screen.getByText(/선택됨 · 아직 전송하지 않음/)).toBeTruthy();
  await user.click(screen.getByRole('button', { name: '파일 전송 및 AI 분석 시작' }));
  expect(onAnalyze).toHaveBeenCalledWith('', file);
});
