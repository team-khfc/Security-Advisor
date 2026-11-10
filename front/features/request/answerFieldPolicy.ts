import { networkValueValid, networkFormatHelp } from './networkAnswerFormat';
import type { Role } from '@/lib/types';
import type { Answer } from './types';

/** 다른 담당 분야는 확인으로도 대신 승인하지 않는다. */
export function canConfirmAnswer(answer: Pick<Answer, 'ownerRole'>, role: Role): boolean {
  return (
    role !== 'ADMIN' &&
    (answer.ownerRole === role ||
      (answer.ownerRole === 'APPLICANT' && (role === 'INFRA' || role === 'SECURITY')))
  );
}

/** 게시본의 형식으로 검사하며 오류에 사용자의 입력 원문은 넣지 않는다. */
export function answerValueError(
  answer: Pick<Answer, 'label' | 'inputType' | 'required'>,
  value: string,
): string | null {
  const text = value.trim();
  const error = (message: string) => `${answer.label}: ${message}`;
  if (!text || value.length > 4000) return error('1~4000자의 답변을 입력해 주세요.');
  if (text === '미해당')
    return answer.required ? error('필수 항목은 미해당으로 저장할 수 없습니다.') : null;
  if (answer.inputType === 'BOOLEAN' && !['true', 'false', '예', '아니요'].includes(text))
    return error('예(true) 또는 아니요(false)를 선택해 주세요.');
  if (answer.inputType === 'NUMBER' && !/^-?[0-9]+(?:\.[0-9]+)?$/.test(text))
    return error('숫자를 입력해 주세요.');
  if (
    answer.inputType &&
    networkFormatHelp[answer.inputType] &&
    !networkValueValid(answer.inputType, text)
  )
    return error(
      networkFormatHelp[answer.inputType] + ' 목록은 쉼표나 줄바꿈으로 구분하며 최대 100개입니다.',
    );
  if (answer.inputType === 'DATE_RANGE') {
    const period = text.replace(/~\s*(상시|종료일 없음)$/, '~');
    const match = /^([0-9]{4}-[0-9]{2}-[0-9]{2})\s*~\s*([0-9]{4}-[0-9]{2}-[0-9]{2})?$/.exec(period);
    if (!match)
      return error('YYYY-MM-DD~YYYY-MM-DD 형식으로 입력해 주세요. 상시는 종료일을 비웁니다.');
    const valid = (date: string) => {
      const parsed = new Date(`${date}T00:00:00Z`);
      return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
    };
    if (!valid(match[1]) || (match[2] && !valid(match[2])))
      return error('실제 달력에 있는 날짜를 입력해 주세요.');
    if (match[2] && match[2] < match[1]) return error('종료일은 시작일보다 빠를 수 없습니다.');
  }
  return null;
}
