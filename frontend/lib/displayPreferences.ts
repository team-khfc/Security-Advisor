'use client';

import { useEffect, useSyncExternalStore } from 'react';

const eventName = 'securityadvisor-display-preference';

function subscribe(listener: () => void) {
  window.addEventListener('storage', listener);
  window.addEventListener(eventName, listener);
  return () => {
    window.removeEventListener('storage', listener);
    window.removeEventListener(eventName, listener);
  };
}

function read(key: string, fallback: string) {
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // 저장소를 사용할 수 없어도 이번 화면에는 설정을 적용한다.
    if (key === 'sf-scale') document.documentElement.dataset.scale = value;
    if (key === 'sf-theme') document.documentElement.dataset.theme = value;
  }
  window.dispatchEvent(new Event(eventName));
}

/** 비민감 표시 설정만 저장하고 기본값은 시스템 테마와 17px 본문으로 유지한다. */
export function useDisplayPreferences() {
  const scale = useSyncExternalStore(
    subscribe,
    () => read('sf-scale', '1'),
    () => '1',
  );
  const theme = useSyncExternalStore(
    subscribe,
    () => read('sf-theme', 'system'),
    () => 'system',
  );
  useEffect(() => {
    document.documentElement.dataset.scale = ['1', '1.125', '1.25'].includes(scale) ? scale : '1';
    if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
  }, [scale, theme]);
  return {
    scale,
    theme,
    setScale: (value: string) => write('sf-scale', value),
    setTheme: (value: string) => write('sf-theme', value),
  };
}
