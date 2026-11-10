import { CaseInterview } from '@/features/request';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CaseInterview id={id} />;
}
