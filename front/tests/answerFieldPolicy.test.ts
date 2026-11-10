import { describe, expect, it } from 'vitest';
import { answerValueError, canConfirmAnswer } from '../features/request/answerFieldPolicy';

describe('게시본 항목 권한·형식', () => {
  it('다른 담당 분야 확인은 거부하고 신청자 답변의 담당자 확인은 허용한다', () => {
    expect(canConfirmAnswer({ ownerRole: 'INFRA' }, 'SECURITY')).toBe(false);
    expect(canConfirmAnswer({ ownerRole: 'SECURITY' }, 'INFRA')).toBe(false);
    expect(canConfirmAnswer({ ownerRole: 'APPLICANT' }, 'SECURITY')).toBe(true);
    expect(canConfirmAnswer({ ownerRole: 'APPLICANT' }, 'ADMIN')).toBe(false);
  });
  it('잘못된 예·아니요, 숫자, 달력 날짜와 기간 역전을 거부한다', () => {
    const field = { label: '합성', required: true };
    for (const value of ['true', 'false', '예', '아니요'])
      expect(answerValueError({ ...field, inputType: 'BOOLEAN' }, value)).toBeNull();
    expect(answerValueError({ ...field, inputType: 'BOOLEAN' }, '모름')).toBeTruthy();
    expect(answerValueError({ ...field, inputType: 'NUMBER' }, 'NaN')).toBeTruthy();
    expect(answerValueError({ ...field, inputType: 'NUMBER' }, '-1.25')).toBeNull();
    for (const value of ['2027-02-29~', '2028-03-01~2028-02-01', '2028-01-01~x'])
      expect(answerValueError({ ...field, inputType: 'DATE_RANGE' }, value)).toBeTruthy();
    expect(answerValueError({ ...field, inputType: 'DATE_RANGE' }, '2028-02-29~')).toBeNull();
  });
});
