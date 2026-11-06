import { RequestsPage } from '@/features/request';
/** 검색 URL을 목록의 초기 조건으로 연결한다. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ query?: string }>;
}) {
  const { query } = await searchParams;
  return <RequestsPage key={query} initialQuery={query} />;
}
