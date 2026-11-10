import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { Modal } from '@/components/ui';

const showModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
afterEach(() => {
  vi.restoreAllMocks();
  if (showModal) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', showModal);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
});

test('대화상자 양끝에서 Tab·Shift+Tab이 순환하고 숨김·비활성 버튼은 제외한다', async () => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.open = true;
    },
  });
  // jsdom은 레이아웃이 없으므로 표시 여부만 보완한다. 실제 화면은 Docker에서 검증한다.
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (
    this: HTMLElement,
  ) {
    return { length: this.hidden ? 0 : 1 } as DOMRectList;
  });
  const close = vi.fn();
  render(
    <Modal open title="최종 제출" onClose={close}>
      <button disabled>사용 불가</button>
      <button hidden>숨김</button>
      <details>
        <summary>게시본 질문 보기</summary>
        <p>합성 질문</p>
      </details>
      <button>되돌아가기</button>
      <button>최종 제출</button>
    </Modal>,
  );
  const first = screen.getByText('게시본 질문 보기');
  const last = screen.getByRole('button', { name: '최종 제출 닫기' });
  const user = userEvent.setup();
  first.focus();
  await user.tab({ shift: true });
  expect(document.activeElement).toBe(last);
  await user.tab();
  expect(document.activeElement).toBe(first);
  await user.tab();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: '되돌아가기' }));
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
  expect(close).toHaveBeenCalledOnce();
});
