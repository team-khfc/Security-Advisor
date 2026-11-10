import type { Answer, SecurityRequest, Submission } from './types';
import type { InfrastructurePlan } from './infrastructurePlan';

/** 표시는 답변 원본을 참조한다. 주소·시스템명·망 구간을 다른 값에서 추론하지 않는다. */
export interface DetailRule {
  id: string;
  number: number;
  purpose: Answer | undefined;
  sourceSystem: Answer | undefined;
  sourceAddress: Answer | undefined;
  destinationSystem: Answer | undefined;
  destinationAddress: Answer | undefined;
  port: Answer | undefined;
  protocol: Answer | undefined;
  direction: Answer | undefined;
}

export interface RequestDetailData {
  businessAnswers: Answer[];
  additionalAnswers: Answer[];
  rules: DetailRule[];
  selectedSubmission: Submission | null;
  snapshotUnavailable: boolean;
  documentAnswers: Answer[];
  unconfirmedCount: number;
}

const RULE_KEYS = {
  purpose: ['firewall.purpose', 'connectionPurpose'],
  sourceSystem: ['network.source_system', 'sourceSystem'],
  sourceAddress: ['network.source', 'sourceIp'],
  destinationSystem: ['network.destination_system', 'destinationSystem'],
  destinationAddress: ['network.destination', 'destinationIp'],
  port: ['firewall.port', 'port'],
  protocol: ['firewall.protocol', 'protocol'],
  direction: ['firewall.direction', 'direction'],
} as const;

const BUSINESS_ORDER = [
  'project.summary',
  'purpose',
  'data.personal_info',
  'project.period',
  'period',
];

function findAnswer(answers: Answer[], keys: readonly string[]) {
  // 실제 게시본의 키가 있으면 값이 비어 있어도 구형 별칭으로 덮어쓰지 않는다.
  for (const key of keys) {
    const answer = answers.find((item) => item.key === key);
    if (answer) return answer;
  }
  return undefined;
}

function requiresConfirmation(answer: Answer) {
  return (
    (answer.required || Boolean(answer.value) || answer.notApplicable) &&
    !(
      answer.source &&
      answer.confirmed &&
      !answer.needsReview &&
      (answer.source === 'USER_ANSWER' || answer.confirmation) &&
      (answer.notApplicable || answer.value.trim())
    )
  );
}

/** Back의 게시본 키와 기존 합성 모드 키를 동일한 상세 레이아웃에 연결한다. */
export function getRequestDetailData(
  request: SecurityRequest,
  infrastructurePlan?: InfrastructurePlan,
): RequestDetailData {
  const selectedSubmission =
    request.submissions.find((item) => item.id === request.currentSubmissionId) ?? null;
  const needsSnapshot = request.stage === 4 || request.status === 'FINALIZED';
  const snapshotUnavailable = needsSnapshot && selectedSubmission === null;
  const commonAnswers = needsSnapshot
    ? (selectedSubmission?.commonAnswers ?? [])
    : request.commonAnswers;
  const requestAnswers = needsSnapshot ? (selectedSubmission?.answers ?? []) : request.answers;
  const answers = [...commonAnswers, ...requestAnswers];
  const rule: DetailRule = {
    id: `${request.id}-connection`,
    number: 1,
    purpose: findAnswer(answers, RULE_KEYS.purpose),
    sourceSystem: findAnswer(answers, RULE_KEYS.sourceSystem),
    sourceAddress: findAnswer(answers, RULE_KEYS.sourceAddress),
    destinationSystem: findAnswer(answers, RULE_KEYS.destinationSystem),
    destinationAddress: findAnswer(answers, RULE_KEYS.destinationAddress),
    port: findAnswer(answers, RULE_KEYS.port),
    protocol: findAnswer(answers, RULE_KEYS.protocol),
    direction: findAnswer(answers, RULE_KEYS.direction),
  };
  const ruleAnswers = Object.keys(RULE_KEYS)
    .map((key) => rule[key as keyof typeof RULE_KEYS])
    .filter((answer): answer is Answer => Boolean(answer));
  const hasRule = ruleAnswers.some((answer) => answer.value.trim() || answer.notApplicable);
  // 표를 그릴 값이 없어도 미입력 질문과 반환 대상의 이동 위치는 정보란에 남긴다.
  const representedKeys = new Set(hasRule ? ruleAnswers.map((answer) => answer.key) : []);
  const businessAnswers = commonAnswers
    .filter((answer) => !representedKeys.has(answer.key))
    .sort((left, right) => {
      const leftOrder = BUSINESS_ORDER.indexOf(left.key);
      const rightOrder = BUSINESS_ORDER.indexOf(right.key);
      return (
        (leftOrder < 0 ? BUSINESS_ORDER.length : leftOrder) -
        (rightOrder < 0 ? BUSINESS_ORDER.length : rightOrder)
      );
    });

  return {
    businessAnswers,
    additionalAnswers: requestAnswers.filter((answer) => !representedKeys.has(answer.key)),
    rules: infrastructurePlan?.connections.length
      ? infrastructurePlan.connections.map((row, index) => {
          const value = (key: string, text: string): Answer => ({
            key: 'infrastructure.' + row.id + '.' + key,
            label: key,
            scope: 'REQUEST',
            ownerRole: 'INFRA',
            required: true,
            value: text,
            source: infrastructurePlan.aiPending ? 'AI_INFERRED' : 'STAFF_INPUT',
            evidence: null,
            confirmed: !infrastructurePlan.draft && !infrastructurePlan.aiPending,
            notApplicable: false,
            confirmation: infrastructurePlan.updatedBy
              ? {
                  actorId: infrastructurePlan.updatedBy,
                  actorName: infrastructurePlan.updatedBy,
                  role: 'INFRA',
                  at: infrastructurePlan.updatedAt || '',
                }
              : null,
          });
          return {
            id: row.id,
            number: index + 1,
            purpose: value('purpose', row.purpose),
            sourceSystem: value('sourceSystem', row.sourceSystem + ' · ' + row.sourceZone),
            sourceAddress: value('sourceAddress', row.sourceAddress),
            destinationSystem: value(
              'destinationSystem',
              row.destinationSystem + ' · ' + row.destinationZone,
            ),
            destinationAddress: value('destinationAddress', row.destinationAddress),
            port: value('port', row.port),
            protocol: value('protocol', row.protocol),
            direction: value('direction', row.direction),
          };
        })
      : hasRule
        ? [rule]
        : [],
    selectedSubmission,
    snapshotUnavailable,
    documentAnswers: selectedSubmission
      ? [...selectedSubmission.commonAnswers, ...selectedSubmission.answers]
      : request.currentSubmissionId || needsSnapshot
        ? []
        : answers,
    unconfirmedCount: answers.filter(requiresConfirmation).length,
  };
}
