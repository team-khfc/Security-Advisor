import { DomainError } from '@/lib/problem';
import type { Actor } from '@/lib/types';
import type { MockState, Answer } from '@/features/request';
import {
  validateSettings,
  type Configuration,
  type Settings,
  type Question,
  type Publication,
  type Comparison,
} from '@/features/configuration/types';

/** 모의 모드에서도 초안·게시본·사업에 고정한 버전을 서로 분리한다. */
export class MockConfigurations {
  private draft: Configuration;
  private publications: Publication[];
  private records: {
    publicationId: number;
    version: number;
    publishedAt: string;
    publishedBy: string | null;
    note: string | null;
    previousVersion: number | null;
  }[];
  constructor(state: MockState) {
    const fields = new Map<string, Question>();
    const remember = (answer: Answer, docType?: string) => {
      const previous = fields.get(answer.key);
      fields.set(answer.key, {
        key: answer.key,
        label: answer.label,
        scope: answer.scope,
        type: answer.inputType ?? 'LONG_TEXT',
        required: answer.required,
        askRole: answer.ownerRole === 'ADMIN' ? 'APPLICANT' : answer.ownerRole,
        hint: answer.hint ?? null,
        docTypes: docType ? [...new Set([...(previous?.docTypes ?? []), docType])] : [],
      });
    };
    state.cases.forEach((c) => c.answers.forEach((a) => remember(a)));
    state.requests.forEach((r) => r.answers.forEach((a) => remember(a, r.docType)));
    const schema: Settings = {
      deadlinePolicy: {
        reviewBusinessDays: 5,
        supplementBusinessDays: 5,
        finalConfirmationBusinessDays: 5,
        imminentBusinessDays: 1,
        holidays: ['2026-12-25', '2027-01-01'],
      },
      docTypes: ['FIREWALL', 'SECURITY_REVIEW'].map((code, index) => ({
        code,
        name: index ? '정보화사업 보안성검토 신청서' : '방화벽 정책 허용 신청서',
        description: null,
        active: true,
        templateKey: index ? 'security-review-v1' : 'firewall-v1',
        generatesFirewallRules: !index,
        reviewFields: ['INFRA', 'SECURITY'],
        sortOrder: index + 1,
        exportFormats: ['MARKDOWN', 'PDF'],
      })),
      fields: [...fields.values()],
    };
    this.draft = {
      configurationId: 1,
      draft: schema,
      basedOnVersion: 1,
      currentPublishedVersion: 1,
      note: null,
      updatedBy: 'system',
      updatedAt: '2026-11-07T00:00:00Z',
      revision: 0,
      builtInFields: structuredClone(schema.fields),
    };
    this.publications = [
      {
        publicationId: 1,
        version: 1,
        publishedAt: this.draft.updatedAt,
        fieldSchema: structuredClone(schema),
      },
    ];
    this.records = [
      {
        publicationId: 1,
        version: 1,
        publishedAt: this.draft.updatedAt,
        publishedBy: null,
        note: null,
        previousVersion: null,
      },
    ];
  }
  private admin(actor: Actor) {
    if (actor.role !== 'ADMIN')
      throw new DomainError(403, 'FORBIDDEN', '기관 관리자만 설정을 변경할 수 있습니다.');
  }
  current(actor: Actor) {
    this.admin(actor);
    return structuredClone(this.draft);
  }
  publication(id: number | 'current') {
    const value =
      id === 'current'
        ? this.publications.at(-1)
        : this.publications.find((item) => item.publicationId === id);
    if (!value) throw new DomainError(404, 'NOT_FOUND', '게시본을 찾을 수 없습니다.');
    return structuredClone(value);
  }
  save(actor: Actor, draft: Settings, note: string, revision: number, at: string) {
    this.admin(actor);
    this.requireRevision(revision);
    const errors = validateSettings(
      draft,
      note,
      this.draft.builtInFields.map((field) => field.key),
    );
    if (errors.length) throw new DomainError(422, 'INVALID_CONFIGURATION', errors.join(' '));
    for (const builtin of this.draft.builtInFields) {
      const field = draft.fields.find((item) => item.key === builtin.key);
      if (
        !field ||
        field.type !== builtin.type ||
        field.scope !== builtin.scope ||
        field.askRole !== builtin.askRole ||
        JSON.stringify([...field.docTypes].sort()) !==
          JSON.stringify([...builtin.docTypes].sort()) ||
        (builtin.required && !field.required)
      )
        throw new DomainError(
          422,
          'INVALID_CONFIGURATION',
          '기본 질문의 답변 계약을 유지해야 합니다.',
        );
    }
    this.draft = {
      ...this.draft,
      draft: structuredClone(draft),
      note,
      updatedBy: actor.username,
      updatedAt: at,
      revision: revision + 1,
    };
    return this.current(actor);
  }
  comparison(actor: Actor): Comparison {
    this.admin(actor);
    return {
      fromVersion: this.draft.currentPublishedVersion,
      toVersion: null,
      revision: this.draft.revision,
      changes: compareSchemas(this.publication('current').fieldSchema, this.draft.draft),
    };
  }
  publish(actor: Actor, revision: number, at: string) {
    this.admin(actor);
    this.requireRevision(revision);
    if (!this.comparison(actor).changes.length)
      throw new DomainError(422, 'UNCHANGED', '게시본과 다른 내용이 없어 게시할 수 없습니다.');
    const version = this.draft.currentPublishedVersion + 1;
    const publication = {
      publicationId: version,
      version,
      publishedAt: at,
      fieldSchema: structuredClone(this.draft.draft),
    };
    this.publications.push(publication);
    this.records.push({
      publicationId: version,
      version,
      publishedAt: at,
      publishedBy: actor.username,
      note: this.draft.note,
      previousVersion: version - 1,
    });
    this.draft = {
      ...this.draft,
      basedOnVersion: version,
      currentPublishedVersion: version,
      revision: revision + 1,
      updatedBy: actor.username,
      updatedAt: at,
    };
    return structuredClone(publication);
  }
  history(actor: Actor, page: number, size: number) {
    this.admin(actor);
    if (!Number.isInteger(page) || page < 0 || !Number.isInteger(size) || size < 1 || size > 100)
      throw new DomainError(400, 'INVALID_PAGE', '페이지 범위를 확인해 주세요.');
    return {
      content: structuredClone(this.records.toReversed().slice(page * size, (page + 1) * size)),
      page,
      size,
      totalElements: this.records.length,
    };
  }
  publishedComparison(actor: Actor, id: number): Comparison {
    this.admin(actor);
    const value = this.publication(id);
    return {
      fromVersion: id === 1 ? 1 : id - 1,
      toVersion: value.version,
      revision: null,
      changes:
        id === 1 ? [] : compareSchemas(this.publication(id - 1).fieldSchema, value.fieldSchema),
    };
  }
  private requireRevision(revision: number) {
    if (revision !== this.draft.revision)
      throw new DomainError(
        409,
        'REVISION_CONFLICT',
        '다른 관리자가 설정 초안을 수정했습니다. 입력한 내용을 보존한 채 최신 초안을 확인해 주세요.',
      );
  }

  /** 새 사업만 현재 게시본을 사용하며 이전 사업의 답변·버전은 건드리지 않는다. */
  pinNewCase(state: MockState, id: string) {
    const c = state.cases.find((item) => item.id === id)!;
    const publication = this.publication('current');
    c.publicationVersion = publication.version;
    const answers = (scope: 'CASE' | 'REQUEST', existing: Answer[], docType?: string) =>
      publication.fieldSchema.fields
        .filter(
          (field) =>
            field.scope === scope &&
            (!docType || !field.docTypes.length || field.docTypes.includes(docType)),
        )
        .map((field) => ({
          ...(existing.find((answer) => answer.key === field.key) ?? {
            value: '',
            source: null,
            evidence: null,
            confirmed: false,
            notApplicable: false,
            confirmation: null,
          }),
          key: field.key,
          label: field.label,
          inputType: field.type,
          hint: field.hint,
          scope,
          ownerRole: field.askRole,
          required: field.required,
        }));
    c.answers = answers('CASE', c.answers);
    state.requests
      .filter((r) => r.caseId === id)
      .forEach((r) => {
        r.publicationVersion = publication.version;
        r.commonAnswers = structuredClone(c.answers);
        r.answers = answers('REQUEST', r.answers, r.docType);
      });
  }
}

function compareSchemas(before: Settings, after: Settings): Comparison['changes'] {
  const result: Comparison['changes'] = [];
  const add = (path: string, label: string, a: unknown, b: unknown, contract = false) => {
    if (JSON.stringify(a) !== JSON.stringify(b))
      result.push({
        path,
        label,
        before: a == null ? '없음' : typeof a === 'object' ? JSON.stringify(a) : String(a),
        after: b == null ? '없음' : typeof b === 'object' ? JSON.stringify(b) : String(b),
        dataContractChange: contract,
      });
  };
  const labels = {
    reviewBusinessDays: '분야별 협의 기한(영업일)',
    supplementBusinessDays: '보완 응답 기한(영업일)',
    finalConfirmationBusinessDays: '최종 확정 기한(영업일)',
    imminentBusinessDays: '기한 임박 알림(영업일 전)',
    holidays: '기관 공휴일',
  };
  for (const key of Object.keys(labels) as (keyof typeof labels)[])
    add(
      `deadlinePolicy.${key}`,
      labels[key],
      before.deadlinePolicy[key],
      after.deadlinePolicy[key],
    );
  for (const field of before.fields)
    if (!after.fields.some((value) => value.key === field.key))
      add(`fields.${field.key}`, '질문 삭제', field.label, null, true);
  for (const field of after.fields) {
    const previous = before.fields.find((value) => value.key === field.key);
    if (!previous) {
      add(`fields.${field.key}`, '질문 추가', null, field.label, true);
      continue;
    }
    const names = {
      label: '질문 문구',
      hint: '도움말',
      type: '응답 형식',
      scope: '답변 범위',
      docTypes: '적용 서류',
      required: '필수 여부',
      askRole: '작성 역할',
    };
    for (const key of Object.keys(names) as (keyof typeof names)[])
      add(
        `fields.${field.key}.${key}`,
        `${field.key} · ${names[key]}`,
        previous[key],
        field[key],
        ['type', 'scope', 'docTypes', 'askRole'].includes(key),
      );
  }
  add('docTypes', '서류 유형 설정', before.docTypes, after.docTypes, true);
  return result;
}
