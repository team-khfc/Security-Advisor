import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { DateRangeAnswer } from '@/features/request/DateRangeAnswer';

function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <form>
      <DateRangeAnswer value={value} disabled={false} onChange={setValue} />
      <output aria-label="저장할 기간">{value}</output>
    </form>
  );
}

test('달력 시작일·종료일을 기존 기간 문자열로 변환하고 역전된 기간을 막는다', () => {
  render(<Harness />);
  const start = screen.getByLabelText('시작일') as HTMLInputElement;
  const end = screen.getByLabelText('종료일') as HTMLInputElement;
  expect(start.type).toBe('date');
  fireEvent.change(start, { target: { value: '2027-01-01' } });
  expect(end.required).toBe(true);
  expect(end.validity.valueMissing).toBe(true);
  fireEvent.change(end, { target: { value: '2026-12-31' } });
  expect(end.checkValidity()).toBe(false);
  fireEvent.change(end, { target: { value: '2027-06-30' } });
  expect(screen.getByLabelText('저장할 기간').textContent).toBe('2027-01-01 ~ 2027-06-30');
  expect(end.checkValidity()).toBe(true);
});

test('상시 운영을 명시적으로 선택하면 9999-12-31로 저장하고 해제 시 종료일을 다시 요구한다', () => {
  render(<Harness initial="2027-01-01 ~ 2027-06-30" />);
  fireEvent.click(screen.getByLabelText('상시 운영 (종료일 없음)'));
  expect(screen.getByLabelText('저장할 기간').textContent).toBe('2027-01-01 ~ 9999-12-31');
  expect((screen.getByLabelText('종료일') as HTMLInputElement).disabled).toBe(true);
  fireEvent.click(screen.getByLabelText('상시 운영 (종료일 없음)'));
  expect((screen.getByLabelText('종료일') as HTMLInputElement).required).toBe(true);
});

test('기존 저장 기간을 달력 입력으로 복원한다', () => {
  render(<Harness initial="2027-01-01 ~ 2027-06-30" />);
  expect((screen.getByLabelText('시작일') as HTMLInputElement).value).toBe('2027-01-01');
  expect((screen.getByLabelText('종료일') as HTMLInputElement).value).toBe('2027-06-30');
});
