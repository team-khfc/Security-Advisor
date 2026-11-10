import { DomainError } from '@/lib/problem';
import { forwardApiRequest, problemResponse } from '@/lib/serverProxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(request: Request): Promise<Response> {
  try {
    const mode = process.env.API_MODE ?? (process.env.NODE_ENV === 'production' ? 'api' : 'mock');
    if (mode === 'mock') {
      const { handleMockRequest } = await import('@/mocks/server');
      return await handleMockRequest(request);
    }
    if (mode !== 'api') {
      throw new DomainError(503, 'API_MODE_INVALID', '실행 모드 설정을 확인해 주세요.');
    }
    if (new URL(request.url).pathname.startsWith('/api/demo-sessions')) {
      throw new DomainError(404, 'RESOURCE_NOT_FOUND', '요청한 자원을 찾을 수 없습니다.');
    }
    return await forwardApiRequest(request, process.env.API_BASE_URL);
  } catch (error) {
    return problemResponse(error);
  }
}

/** 표시용 조회와 실제 Back 조회는 같은 출처를 유지한다. */
export async function GET(request: Request) {
  return handle(request);
}

/** 상태 변경의 판단은 Back 또는 모의 API 도메인 경계에 둔다. */
export async function POST(request: Request) {
  return handle(request);
}

/** 멱등 하위 자원의 설정 요청을 전달한다. */
export async function PUT(request: Request) {
  return handle(request);
}

/** revision을 포함하는 부분 수정 요청을 전달한다. */
export async function PATCH(request: Request) {
  return handle(request);
}

/** 실제 Back이 제공하는 삭제 요청만 전달하며 모의 업무 기록은 삭제하지 않는다. */
export async function DELETE(request: Request) {
  return handle(request);
}
