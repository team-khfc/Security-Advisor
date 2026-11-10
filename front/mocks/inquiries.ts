import { z } from 'zod';
import type { Inquiry, InquiryMessage } from '@/features/llm/types';
import type { MockState } from '@/features/request/types';
import type { Actor } from '@/lib/types';
import { DomainError } from '@/lib/problem';
import type { ContractMapper } from './contractMapper';

function fail(status: number, detail: string): never {
  throw new DomainError(status, 'INQUIRY_' + status, detail);
}
/** 모의 모드도 배정·소유권을 확인하고 업무 데이터와 별도로 대화만 저장한다. */
export class MockInquiries {
  private inquiries: Inquiry[] = [];
  private messages: InquiryMessage[] = [];
  handle(
    state: MockState,
    wire: ContractMapper,
    actor: Actor,
    url: URL,
    method: string,
    body: unknown,
    now: number,
  ) {
    const [, , resource, id, sub] = url.pathname.split('/');
    const inquiry =
      resource === 'inquiries' ? this.inquiries.find((i) => String(i.inquiryId) === id) : undefined;
    if (resource === 'inquiries' && (!inquiry || inquiry.staffUsername !== actor.username))
      fail(404, '질의 대화를 찾을 수 없습니다.');
    if (actor.role !== 'INFRA' && actor.role !== 'SECURITY')
      fail(403, '배정된 담당자만 AI에게 질문할 수 있습니다.');
    const request = state.requests.find(
      (r) => r.id === wire.original(String(inquiry?.securityRequestId ?? id)),
    );
    if (!request) fail(404, '신청을 찾을 수 없습니다.');
    if (
      (inquiry && inquiry.field !== actor.role) ||
      !request.assignments.some(
        (a) => a.active && a.field === actor.role && a.assigneeId === actor.id,
      )
    )
      fail(403, '배정된 담당자만 AI에게 질문할 수 있습니다.');
    const createdAt = new Date(now).toISOString();
    if (resource === 'security-requests' && sub === 'inquiries') {
      if (method === 'GET')
        return Response.json(
          this.inquiries
            .filter((i) => i.securityRequestId === Number(id) && i.staffUsername === actor.username)
            .toReversed(),
        );
      if (method === 'POST') {
        const input = z.object({ title: z.string().max(200).optional() }).parse(body ?? {});
        const opened: Inquiry = {
          inquiryId: this.inquiries.length + 1,
          securityRequestId: Number(id),
          staffUsername: actor.username,
          field: actor.role as 'INFRA' | 'SECURITY',
          title: input.title?.trim() || '새 검토 대화',
          createdAt,
        };
        this.inquiries.push(opened);
        return Response.json(opened, { status: 201 });
      }
    }
    if (inquiry && sub === 'messages') {
      if (method === 'GET')
        return Response.json(this.messages.filter((m) => m.inquiryId === inquiry.inquiryId));
      if (method === 'POST') {
        const { text } = z.object({ text: z.string().trim().min(1).max(4000) }).parse(body);
        const common = {
          inquiryId: inquiry.inquiryId,
          createdAt,
          flagged: false,
          modelReference: null,
        };
        const question: InquiryMessage = {
          ...common,
          inquiryMessageId: this.messages.length + 1,
          role: 'USER',
          text,
          evidence: [],
        };
        const answer: InquiryMessage = {
          ...common,
          inquiryMessageId: this.messages.length + 2,
          role: 'ASSISTANT',
          modelReference: 'fake/offline',
          text: '모의 AI 답변입니다. 실제 모델을 호출하지 않았습니다. 신청 자료를 확인하여 누락된 항목과 미확정 값을 검토하세요. 검토 의견과 확정값은 담당자가 직접 작성합니다.',
          evidence: [
            { tag: 'B', label: '합성 신청 ' + request.caseTitle + ' · 수정본 ' + request.revision },
          ],
        };
        this.messages.push(question, answer);
        return Response.json({ question, answer }, { status: 201 });
      }
    }
    return fail(405, '지원하지 않는 질의 작업입니다.');
  }
}
