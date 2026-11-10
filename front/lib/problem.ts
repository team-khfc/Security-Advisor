/** 모의 API도 실제 API와 동일하게 실패를 HTTP 의미로 구분한다. */
export class DomainError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  detail: string;
  code: string;
  requestId?: string;
  currentRevision?: number;
}
