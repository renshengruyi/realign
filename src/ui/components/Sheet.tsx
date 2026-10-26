import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { Icon } from './Icon';

let locks = 0;

function lockScroll() {
  locks += 1;
  document.documentElement.style.overflow = 'hidden';
}

function unlockScroll() {
  locks = Math.max(0, locks - 1);
  if (!locks) document.documentElement.style.overflow = '';
}

function useModal(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    lockScroll();
    return () => {
      document.removeEventListener('keydown', onKey);
      unlockScroll();
      prev?.focus?.({ preventScroll: true });
    };
  }, []);
  return ref;
}

export function Sheet({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
  footer?: ComponentChildren;
}) {
  const ref = useModal(onClose);
  return (
    <>
      <div class="scrim" onClick={onClose} />
      <div class="sheet" role="dialog" aria-modal="true" aria-label={title} ref={ref} tabIndex={-1}>
        <div class="sheet-head">
          <h2>{title}</h2>
          <button type="button" class="icon-btn" aria-label="关闭" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div class="sheet-body">{children}</div>
        {footer ? <div class="sheet-foot">{footer}</div> : null}
      </div>
    </>
  );
}

export function ToolFrame({
  title,
  onClose,
  children,
  night,
  actions,
}: {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
  night?: boolean;
  actions?: ComponentChildren;
}) {
  const ref = useModal(onClose);
  return (
    <div class={`tool${night ? ' night' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref} tabIndex={-1}>
      <div class="tool-head">
        <button type="button" class="icon-btn" aria-label="关闭" onClick={onClose}>
          <Icon name="x" />
        </button>
        <h2>{title}</h2>
        {actions}
      </div>
      <div class="tool-body">{children}</div>
    </div>
  );
}
