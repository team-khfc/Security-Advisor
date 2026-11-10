import { expect, test, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { answerValueError } from '@/features/request/answerFieldPolicy';
import { adaptAnswers } from '@/features/request/adapters/backend';
import { AnswerEditor } from '@/features/request/AnswerEditor';
import type { Answer } from '@/features/request/types';
import type { Actor } from '@/lib/types';

test('IP·CIDR·포트·프로토콜 경계와 목록 형식을 검증한다', () => {
  const check = (type: Answer['inputType'], value: string) =>
    answerValueError({ label: '합성', inputType: type, required: true }, value);
  for (const value of [
    '192.0.2.1',
    '2001:db8::/32',
    '::/0',
    '::ffff:192.0.2.1',
    '192.0.2.1, 2001:db8::1',
  ])
    expect(check('IP_ADDRESS', value)).toBeNull();
  for (const value of [
    '256.1.1.1',
    '127.1',
    '01.2.3.4',
    'localhost',
    '192.0.2.1/33',
    '2001:db8::/129',
    '1:::2',
    '1:2:3:4:5:6:7:8::',
    '::%eth0',
    '192.0.2.1,',
  ])
    expect(check('IP_ADDRESS', value)).toBeTruthy();
  expect(check('PORT', '1, 443, 8000-8080,65535')).toBeNull();
  for (const value of ['0', '65536', '8000-443', '1.2', '443,', 'all'])
    expect(check('PORT', value)).toBeTruthy();
  expect(check('PROTOCOL', 'TCP, UDP\nICMPV6')).toBeNull();
  expect(check('PROTOCOL', 'HTTP')).toBeTruthy();
  expect(check('PORT', '미해당')).toBeTruthy();
});

const field = {
  key: 'custom.port',
  label: '합성 포트',
  scope: 'CASE' as const,
  docTypes: [],
  type: 'PORT' as const,
  required: false,
  askRole: 'APPLICANT' as const,
};
const publication = { publicationId: 1, version: 1, fieldSchema: { fields: [field] } };
const dto = {
  answerId: 1,
  fieldKey: field.key,
  scope: 'CASE' as const,
  value: '미해당',
  valueSource: 'USER_ANSWER' as const,
  evidence: null,
  confirmed: true,
  confirmedBy: null,
  confirmedAt: null,
  needsReview: false,
  revision: 2,
  notApplicable: true,
};

test('새 방화벽 입력 UI에서도 미해당만 있는 답변을 일괄 확인하고 해제한다', () => {
  const [base] = adaptAnswers([dto], publication, 'CASE');
  const answer: Answer = {
    ...base,
    key: 'firewall.port',
    scope: 'REQUEST',
    value: '',
    notApplicable: true,
    confirmed: true,
  };
  render(
    <AnswerEditor
      answers={[answer]}
      revision={2}
      actor={{ id: 'synthetic', role: 'APPLICANT' } as Actor}
      onSave={vi.fn()}
    />,
  );
  const input = screen.getByLabelText('합성 포트 (선택)') as HTMLInputElement;
  expect(input.disabled).toBe(true);
  const confirmation = screen.getByRole('checkbox', {
    name: '작성한 답변의 내용을 확인했습니다',
  }) as HTMLInputElement;
  expect(confirmation.checked).toBe(true);
  fireEvent.click(confirmation);
  expect(confirmation.checked).toBe(false);
  fireEvent.click(screen.getByRole('checkbox', { name: '미해당 (해당 없음)' }));
  expect(input.disabled).toBe(false);
});

test('서버 미해당 상태를 복원하고 체크 해제 후 정상 값으로 저장한다', async () => {
  const [answer] = adaptAnswers([dto], publication, 'CASE');
  expect(answer.notApplicable).toBe(true);
  const onSave = vi.fn().mockResolvedValue(undefined);
  const actor = { id: 'synthetic', role: 'APPLICANT' } as Actor;
  render(<AnswerEditor answers={[answer]} revision={2} actor={actor} onSave={onSave} />);
  const checkbox = screen.getByRole('checkbox', { name: '미해당 (해당 없음)' });
  expect((checkbox as HTMLInputElement).checked).toBe(true);
  expect((screen.getByLabelText('합성 포트') as HTMLTextAreaElement).disabled).toBe(true);
  fireEvent.click(checkbox);
  fireEvent.change(screen.getByLabelText('합성 포트'), { target: { value: '443' } });
  fireEvent.click(screen.getByRole('button', { name: '답변 저장' }));
  await waitFor(() =>
    expect(onSave).toHaveBeenCalledWith(2, [
      expect.objectContaining({ value: '443', notApplicable: false }),
    ]),
  );
});
