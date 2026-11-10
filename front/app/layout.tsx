import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Providers } from './Providers';
import '@/styles/globals.css';
import '@/styles/application.css';

export const metadata: Metadata = {
  title: { default: '보안길잡이 AI · SecurityAdvisor', template: '%s · 보안길잡이 AI' },
  description: '현업과 전문가를 잇는 보안 업무 지원 서비스',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
