import { PreviewPage } from '@/features/preview';
/** 경로 design-preview/[screen]의 진입과 기능 구현을 분리한다. */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ screen: string }>;
  searchParams: Promise<{ tab?: string; query?: string }>;
}) {
  const { screen } = await params;
  const { tab, query } = await searchParams;
  return <PreviewPage screen={screen} tab={tab} query={query} />;
}
