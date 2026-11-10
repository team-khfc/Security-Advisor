import type { ReactNode } from 'react';

interface IconProps {
  name: string;
  size?: number;
  className?: string;
}

const paths: Record<string, ReactNode> = {
  search: (
    <>
      <circle cx="10.8" cy="10.8" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  file: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6M8 13h8M8 17h5" />
    </>
  ),
  shield: (
    <>
      <path d="m12 3 8 3v5c0 5-4.5 8.4-8 10-3.5-1.6-8-5-8-10V6Z" />
      <path d="m8.5 12 2.3 2.3 4.7-4.7" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 4v2" />
    </>
  ),
  chevronRight: <path d="m9 5 7 7-7 7" />,
  chevronLeft: <path d="m15 5-7 7 7 7" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  arrowRight: <path d="M4 12h16m-6-6 6 6-6 6" />,
  check: <path d="m5 12 4 4L19 6" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  alert: (
    <>
      <path d="m10.3 4-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3l-8-14a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4m0 4h.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6m0-10h.01" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V3m-5 5 5-5 5 5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
    </>
  ),
  download: <path d="M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4" />,
  settings: (
    <>
      <path d="m9.5 3-.8 2.4-2.4.8L4 5.7 2 9l1.6 1.8v2.4L2 15l2 3.3 2.3-.5 2.4.8.8 2.4h5l.8-2.4 2.4-.8 2.3.5 2-3.3-1.6-1.8v-2.4L22 9l-2-3.3-2.3.5-2.4-.8-.8-2.4Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  logOut: (
    <>
      <path d="M9 21H4V3h5M9 12h12m-5-5 5 5-5 5" />
    </>
  ),
  building: (
    <>
      <path d="M6 21V3h12v18M2 21h20M10 7h4M10 11h4M10 21v-6h4v6" />
    </>
  ),
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  x: <path d="m6 6 12 12M18 6 6 18" />,
  sparkles: (
    <>
      <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM20 2v4m-2-2h4" />
    </>
  ),
  pencil: (
    <>
      <path d="m15 4 5 5M4 20l5-1 12-12a2.1 2.1 0 0 0-5-5L4 15Z" />
    </>
  ),
  bell: (
    <>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4" />
    </>
  ),
  network: (
    <>
      <rect x="8" y="2" width="8" height="6" rx="1" />
      <path d="M12 8v5M4 16v-3h16v3" />
      <rect x="1" y="16" width="6" height="6" rx="1" />
      <rect x="9" y="16" width="6" height="6" rx="1" />
      <rect x="17" y="16" width="6" height="6" rx="1" />
    </>
  ),
  history: (
    <>
      <path d="M3 10a9 9 0 1 1 2 8M3 4v6h6M12 7v5l3 2" />
    </>
  ),
  folder: <path d="M3 5h6l2 2h10v13H3Z" />,
  // 공통 메뉴 아이콘: prototype-soo assets/js/core.js NAVI(563dd7e)의 경로를 그대로 옮겼다.
  inbox: (
    <>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.5 5.1L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.5-6.9A2 2 0 0016.8 4H7.2a2 2 0 00-1.7 1.1z" />
    </>
  ),
  message: <path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z" />,
  document: (
    <>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4M9 12h6M9 16h6" />
    </>
  ),
  timer: (
    <>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2M9 2h6" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 8.5a3 3 0 0 1 6 0c0 2-3 2.5-3 4.5m0 4h.01" />
    </>
  ),
};

/** 장식 아이콘은 숨기고 행동의 이름은 호출한 버튼·링크에서 제공한다. */
export function Icon({ name, size = 20, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-icon={name}
      className={className}
    >
      {paths[name] ?? paths.file}
    </svg>
  );
}
