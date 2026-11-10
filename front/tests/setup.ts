import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom이 제공하지 않는 네이티브 닫기만 보완한다. 초점 복귀는 컴포넌트가 직접 검증한다.
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.close) {
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.open = false;
    },
  });
}

afterEach(() => cleanup());
