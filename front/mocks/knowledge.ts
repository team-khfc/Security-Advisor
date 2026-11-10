import { DomainError } from '@/lib/problem';
import type { Actor } from '@/lib/types';
import type { MockState } from '@/features/request';
import {
  blankContext,
  blankSnippet,
  snippetSchema,
  contextSchema,
  validateSnippet,
  validateContext,
  type KnowledgeDraft,
  type Snippet,
  type PrivateContext,
  type KnowledgeComparison,
} from '@/features/knowledge/types';

type Snapshot = { snippets: Snippet[]; privateContexts: PrivateContext[] };
const clone = <T>(value: T): T => structuredClone(value);
function fail(status: number, message: string): never {
  throw new DomainError(
    status,
    status === 409 ? 'REVISION_CONFLICT' : `KNOWLEDGE_${status}`,
    message,
  );
}

/** Back 없이도 저장과 게시, 과거 사본, 현재 열람 권한을 별도로 검증하는 합성 저장소. */
export class MockKnowledge {
  private draft: KnowledgeDraft;
  private content: Snapshot;
  private snapshots = new Map<number, Snapshot>();
  private records: {
    knowledgePublicationId: number;
    version: number;
    publishedAt: string;
    publishedBy: string | null;
    note: string | null;
    previousVersion: number | null;
  }[];
  constructor(
    private state: MockState,
    private fieldKeys: () => string[],
  ) {
    this.content = {
      snippets: [
        {
          ...blankSnippet(),
          knowledgeSnippetId: 1,
          sourceTitle: '보안 검토 안내 · 합성',
          sourceVersion: '합성 v1',
          sourceLocator: '1장 1절',
          fieldKeys: [fieldKeys()[0]],
          body: '업무 목적과 대상 사용자를 구체적으로 작성합니다. 합성 공개 지식입니다.',
          citation: '보안 검토 안내 · 합성 v1 1장 1절',
        },
      ],
      privateContexts: [
        {
          ...blankContext(),
          privateContextId: 1,
          name: '합성 업무 서버',
          aliases: ['합성 서버'],
          attributes: { ip: '192.0.2.10', 담당부서: '합성 정보화부' },
        },
      ],
    };
    this.records = [
      {
        knowledgePublicationId: 1,
        version: 1,
        publishedAt: new Date().toISOString(),
        publishedBy: 'system',
        note: null,
        previousVersion: null,
      },
    ];
    this.snapshots.set(1, clone(this.content));
    this.draft = {
      knowledgeDraftId: 1,
      basedOnVersion: 1,
      currentPublishedVersion: 1,
      revision: 0,
      note: null,
      updatedBy: 'system',
      updatedAt: new Date().toISOString(),
      snippetCount: 1,
      privateContextCount: 1,
    };
    state.cases.forEach((c) => {
      c.knowledgePublicationId = 1;
    });
  }
  private admin(actor: Actor) {
    if (actor.role !== 'ADMIN') fail(403, '기관 관리자만 지식 정보를 관리할 수 있습니다.');
  }
  private audit(actor: Actor, action: string, targetId: string, now: string) {
    this.state.auditEvents.push({
      id: crypto.randomUUID(),
      actorId: actor.id,
      actorName: actor.displayName,
      actorRole: actor.role,
      targetType: 'KnowledgePublication',
      targetId,
      targetRevision: this.draft.revision,
      action,
      reason: null,
      fieldKeys: [],
      requestId: crypto.randomUUID(),
      createdAt: now,
    });
  }
  private changed(actor: Actor, now: string) {
    this.draft.revision++;
    this.draft.updatedBy = actor.username;
    this.draft.updatedAt = now;
    this.draft.snippetCount = this.content.snippets.length;
    this.draft.privateContextCount = this.content.privateContexts.length;
    this.audit(actor, 'KNOWLEDGE_DRAFT_SAVED', '1', now);
  }
  current(actor: Actor) {
    this.admin(actor);
    return clone(this.draft);
  }
  currentId() {
    return this.draft.currentPublishedVersion;
  }
  bindState(state: MockState) {
    this.state = state;
  }
  pinCase(state: MockState, caseId: string) {
    this.bindState(state);
    const c = this.state.cases.find((c) => c.id === caseId);
    if (c) c.knowledgePublicationId = this.currentId();
  }
  list(actor: Actor, kind: 'public' | 'private', q: string, page: number, size: number) {
    this.admin(actor);
    if (kind === 'private')
      this.audit(actor, 'PRIVATE_CONTEXT_VIEWED', 'draft', new Date().toISOString());
    const query = q.trim().toLowerCase();
    const rows =
      kind === 'public'
        ? this.content.snippets.filter((s) =>
            `${s.sourceTitle} ${s.body}`.toLowerCase().includes(query),
          )
        : this.content.privateContexts.filter((c) => c.name.toLowerCase().includes(query));
    return this.page<Snippet | PrivateContext>(rows, page, size);
  }
  item(actor: Actor, kind: 'public' | 'private', id: number) {
    this.admin(actor);
    const row =
      kind === 'public'
        ? this.content.snippets.find((s) => s.knowledgeSnippetId === id)
        : this.content.privateContexts.find((c) => c.privateContextId === id);
    if (!row) fail(404, '지식 초안을 찾을 수 없습니다.');
    if (kind === 'private')
      this.audit(actor, 'PRIVATE_CONTEXT_VIEWED', `draft:${id}`, new Date().toISOString());
    return clone(row);
  }
  save(
    actor: Actor,
    kind: 'public' | 'private',
    id: number | null,
    input: Record<string, unknown>,
    now: string,
  ) {
    this.admin(actor);
    const old = id == null ? null : this.item(actor, kind, id);
    if (old && input.expectedRevision !== old.revision)
      fail(409, '다른 관리자가 이 초안을 변경했습니다. 최신 초안을 확인해 주세요.');
    if (kind === 'public') {
      const value = snippetSchema.parse({
        ...blankSnippet(),
        ...input,
        knowledgeSnippetId:
          id ?? Math.max(0, ...this.content.snippets.map((s) => s.knowledgeSnippetId)) + 1,
        revision: old ? old.revision + 1 : 0,
      });
      const errors = validateSnippet(value);
      if (value.fieldKeys.some((key) => !this.fieldKeys().includes(key)))
        errors.push('현재 게시본에 없는 질문입니다.');
      if (value.docTypes.some((code) => !['FIREWALL', 'SECURITY_REVIEW'].includes(code)))
        errors.push('서류 유형을 확인해 주세요.');
      if (errors.length) fail(422, errors.join(' '));
      value.citation = `${value.sourceTitle} ${value.sourceVersion} ${value.sourceLocator}`;
      if (id)
        this.content.snippets = this.content.snippets.map((s) =>
          s.knowledgeSnippetId === id ? value : s,
        );
      else this.content.snippets.push(value);
      this.changed(actor, now);
      return clone(value);
    }
    const value = contextSchema.parse({
      ...blankContext(),
      ...input,
      privateContextId:
        id ?? Math.max(0, ...this.content.privateContexts.map((c) => c.privateContextId)) + 1,
      revision: old ? old.revision + 1 : 0,
    });
    const errors = validateContext(value);
    if (errors.length) fail(422, errors.join(' '));
    if (id)
      this.content.privateContexts = this.content.privateContexts.map((c) =>
        c.privateContextId === id ? value : c,
      );
    else this.content.privateContexts.push(value);
    this.changed(actor, now);
    return clone(value);
  }
  saveNote(actor: Actor, note: string | null, expected: number, now: string) {
    this.admin(actor);
    if (expected !== this.draft.revision) fail(409, '다른 관리자가 지식 초안을 변경했습니다.');
    if ((note?.length ?? 0) > 500) fail(422, '게시 메모는 500자 이하입니다.');
    this.draft.note = note;
    this.changed(actor, now);
    return clone(this.draft);
  }
  compare(actor: Actor): KnowledgeComparison {
    this.admin(actor);
    this.audit(actor, 'PRIVATE_CONTEXT_VIEWED', 'draft', new Date().toISOString());
    return {
      fromVersion: this.currentId(),
      toVersion: null,
      revision: this.draft.revision,
      changes: compareSnapshots(this.snapshot(this.currentId()), this.content),
    };
  }
  publish(actor: Actor, expected: number, now: string) {
    this.admin(actor);
    if (expected !== this.draft.revision)
      fail(409, '다른 관리자가 초안을 수정했습니다. 변경 내용을 다시 비교하세요.');
    if (!this.compare(actor).changes.length)
      fail(422, '게시본과 다른 내용이 없어 게시할 수 없습니다.');
    const previous = this.currentId(),
      version = previous + 1;
    const record = {
      knowledgePublicationId: version,
      version,
      publishedAt: now,
      publishedBy: actor.username,
      note: this.draft.note,
      previousVersion: previous,
    };
    this.snapshots.set(version, clone(this.content));
    this.records.unshift(record);
    this.draft.currentPublishedVersion = version;
    this.draft.basedOnVersion = version;
    this.changed(actor, now);
    this.audit(actor, 'KNOWLEDGE_PUBLISHED', String(version), now);
    return clone(record);
  }
  history(actor: Actor, page: number, size: number) {
    this.admin(actor);
    return this.page(this.records, page, size);
  }
  published(actor: Actor, id: number) {
    this.admin(actor);
    this.audit(actor, 'PRIVATE_CONTEXT_VIEWED', `publication:${id}`, new Date().toISOString());
    return this.snapshot(id);
  }
  comparison(actor: Actor, id: number): KnowledgeComparison {
    this.admin(actor);
    const target = this.records.find((r) => r.knowledgePublicationId === id);
    if (!target) fail(404, '게시본을 찾을 수 없습니다.');
    return {
      fromVersion: target.previousVersion ?? id,
      toVersion: id,
      revision: null,
      changes:
        target.previousVersion == null
          ? []
          : compareSnapshots(this.snapshot(target.previousVersion), this.snapshot(id)),
    };
  }
  publicSearch(q: string, publicationId = this.currentId(), fieldKey?: string) {
    return this.snapshot(publicationId)
      .snippets.filter(
        (s) =>
          s.active &&
          (!fieldKey || s.fieldKeys.includes(fieldKey)) &&
          (!q || `${s.sourceTitle} ${s.body}`.includes(q)),
      )
      .slice(0, 20)
      .map((s) => ({
        knowledgeSnippetId: s.knowledgeSnippetId,
        citation: s.citation,
        body: s.body,
        fieldKeys: s.fieldKeys,
      }));
  }
  suggestions(actor: Actor, q: string, publicationId = this.currentId()) {
    const role = actor.role;
    if (role === 'APPLICANT') return [];
    const latest = this.snapshot(this.currentId()).privateContexts;
    return this.snapshot(publicationId)
      .privateContexts.filter((c) => {
        const current = latest.find((row) => row.privateContextId === c.privateContextId);
        return (
          c.active &&
          current?.active &&
          (role === 'ADMIN' ||
            (c.visibleRoles.includes(role) && current.visibleRoles.includes(role))) &&
          (!q || [c.name, ...c.aliases].some((name) => name.includes(q)))
        );
      })
      .map((c) => ({
        privateContextId: c.privateContextId,
        kind: c.kind,
        name: c.name,
        attributes: c.attributes,
      }));
  }
  private snapshot(id: number) {
    const content = this.snapshots.get(id);
    if (!content) fail(404, '지식 게시본을 찾을 수 없습니다.');
    return clone(content);
  }
  private page<T>(rows: T[], page: number, size: number) {
    if (!Number.isInteger(page) || page < 0 || !Number.isInteger(size) || size < 1 || size > 100)
      fail(400, '페이지는 0 이상, 크기는 1~100이어야 합니다.');
    return {
      content: clone(rows.slice(page * size, (page + 1) * size)),
      page,
      size,
      totalElements: rows.length,
    };
  }
}
function compareSnapshots(before: Snapshot, after: Snapshot): KnowledgeComparison['changes'] {
  const changes: KnowledgeComparison['changes'] = [];
  for (const kind of ['PUBLIC', 'PRIVATE'] as const) {
    const old = kind === 'PUBLIC' ? before.snippets : before.privateContexts;
    const next = kind === 'PUBLIC' ? after.snippets : after.privateContexts;
    for (const item of next) {
      const id = 'knowledgeSnippetId' in item ? item.knowledgeSnippetId : item.privateContextId;
      const prior = old.find(
        (row) =>
          ('knowledgeSnippetId' in row ? row.knowledgeSnippetId : row.privateContextId) === id,
      );
      const describe = (row: Snippet | PrivateContext | undefined) =>
        row
          ? 'sourceTitle' in row
            ? `${row.sourceTitle}\n판본: ${row.sourceVersion}\n위치: ${row.sourceLocator}\n질문: ${row.fieldKeys.join(', ')}\n서류: ${row.docTypes.join(', ')}\n사용: ${row.active ? '예' : '아니요'}\n${row.body}`
            : `${row.name}\n${row.kind}\n별칭: ${row.aliases.join(', ')}\n열람: ${row.visibleRoles.join(', ')}\n사용: ${row.active ? '예' : '아니요'}\n${Object.entries(
                row.attributes,
              )
                .map(([k, v]) => `${k}: ${v}`)
                .join('\n')}\n${row.note ?? ''}`
          : '없음';
      const a = describe(prior),
        b = describe(item);
      if (a !== b)
        changes.push({
          kind,
          itemId: id,
          label: 'sourceTitle' in item ? item.sourceTitle : item.name,
          before: a,
          after: b,
        });
    }
  }
  return changes;
}
