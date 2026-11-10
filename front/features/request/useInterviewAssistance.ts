'use client';

import { useState } from 'react';
import { useInputDraft } from '@/lib/inputDrafts';
import type { Answer, BusinessCase } from './types';
import {
  useInterviewApply,
  useInterviewAsk,
  useInterviewHelp,
  type InterviewTurn,
} from './useInterview';

/** 대화창과 작은 입력창이 같은 요청 상태를 공유하되 질문·정식 답변 초안은 분리한다. */
export function useInterviewAssistance({
  businessCase,
  question,
  actorId,
  answerText,
  turns,
  disabled,
  onApplied,
}: {
  businessCase: BusinessCase;
  question?: Answer;
  actorId: string;
  answerText: string;
  turns: InterviewTurn[];
  disabled: boolean;
  onApplied: () => void;
}) {
  const ask = useInterviewAsk(businessCase.id);
  const apply = useInterviewApply(businessCase.id);
  const [helpKey, setHelpKey] = useState<string>();
  const showHelp = Boolean(question && helpKey === question.key);
  const help = useInterviewHelp(
    question?.key ?? '',
    businessCase.publicationId,
    showHelp,
    businessCase.knowledgePublicationId,
  );
  const { draft, saveDraft, clearDraft } = useInputDraft<string>(
    actorId,
    `case:${businessCase.id}:question:${question?.key ?? ''}`,
  );
  const [inputAtRequest, setInputAtRequest] = useState<Record<number, string>>({});
  const history = [...turns];
  if (ask.data && !history.some((t) => t.interviewTurnId === ask.data.interviewTurnId))
    history.push(ask.data);
  const busy = disabled || ask.isPending || apply.isPending;
  const send = async (requestMode: 'ASK' | 'SUGGEST') => {
    if (!question || busy || (requestMode === 'ASK' && !draft?.trim())) return;
    const textAtRequest = answerText;
    try {
      const result = await ask.mutateAsync({
        fieldKey: question.key,
        // 설명 전용 ASK 대신 기존 후보 생성 계약으로 질문과 적용 가능한 답변을 함께 받는다.
        mode: 'SUGGEST',
        text:
          requestMode === 'ASK'
            ? draft!.trim()
            : '이 항목의 답변 초안을 추천해 주세요. 모르는 사실은 추가로 질문해 주세요.',
        draft: textAtRequest,
        expectedRevision: businessCase.revision,
      });
      setInputAtRequest((old) => ({ ...old, [result.interviewTurnId]: textAtRequest }));
      if (requestMode === 'ASK') clearDraft();
    } catch {
      /* 실패한 질문과 직접 입력을 보존한다. */
    }
  };
  const isStale = (turn: InterviewTurn) => {
    const field = businessCase.answers.find((a) => a.key === turn.fieldKey);
    return (
      turn.basedRevision !== businessCase.revision ||
      turn.answerRevision !== (field?.revision ?? null) ||
      (turn.fieldKey === question?.key &&
        inputAtRequest[turn.interviewTurnId] !== undefined &&
        inputAtRequest[turn.interviewTurnId] !== answerText)
    );
  };
  const applyTurn = async (turn: InterviewTurn) => {
    if (busy || turn.fieldKey !== question?.key || question.confirmed || isStale(turn)) return;
    try {
      await apply.mutateAsync({
        turnId: turn.interviewTurnId,
        expectedRevision: businessCase.revision,
      });
      onApplied();
    } catch {
      /* 오류를 대화에 표시하고 입력을 유지한다. */
    }
  };
  return {
    history,
    ask,
    apply,
    busy,
    prompt: draft ?? '',
    setPrompt: saveDraft,
    showHelp,
    help,
    toggleHelp: () => setHelpKey(showHelp ? undefined : question?.key),
    send,
    isStale,
    applyTurn,
  };
}

export type InterviewAssistanceState = ReturnType<typeof useInterviewAssistance>;
