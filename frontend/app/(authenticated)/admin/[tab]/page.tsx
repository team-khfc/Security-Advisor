import { SettingsPage, ContextsPage } from '@/features/configuration';
/** 경로 (authenticated)/admin/[tab]의 진입과 기능 구현을 분리한다. */
export default async function Page({ params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params;
  return tab === 'context' ? <ContextsPage /> : <SettingsPage tab={tab} />;
}
