import { RequestPage } from '@/features/request';
/** 경로 (authenticated)/requests/[id]/[step]의 진입과 기능 구현을 분리한다. */
export default async function Page({ params }: { params: Promise<{ id: string; step: string }> }) {
  const { id, step } = await params;
  return <RequestPage id={id} step={step} />;
}
