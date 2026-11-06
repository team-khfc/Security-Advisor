import type { Metadata } from 'next';
import { Providers } from './Providers';
import '@/public/assets/vendor/krds/css/token/krds_tokens.css';
import '@/styles/fonts.css';
import '@/public/assets/design/tokens.css';
import '@/styles/tokens.css';
import '@/public/assets/design/base.css';
import '@/public/assets/design/components.css';
import '@/public/assets/design/screens/requests.css';
import '@/public/assets/design/screens/new-request.css';
import '@/public/assets/design/screens/request-detail.css';
import '@/public/assets/design/screens/settings.css';
import '@/styles/components.css';
import '@/styles/application.css';
import '@/styles/accessibility.css';

export const metadata: Metadata = {
  title: { default: 'SecurityAdvisor | 보안길잡이', template: '%s | SecurityAdvisor' },
  description: '공공기관 현업과 정보보안·ICT인프라 담당자의 지식 중계 플랫폼',
};
/** 지정 원본 CSS와 폰트를 그대로 번들에 포함해 외부 CDN 없이 같은 디자인을 제공한다. */
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
