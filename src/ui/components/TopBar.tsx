import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { mode } from '../../platform/store';

export function BrandSeal() {
  return (
    <span class="brand-seal" aria-hidden="true">
      回正
    </span>
  );
}

export function TopBar({ title, children }: { title?: string; children?: ComponentChildren }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 4);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  return (
    <div class={`topbar${scrolled ? ' scrolled' : ''}`}>
      {title ? (
        <h1 class="page-title">{title}</h1>
      ) : (
        <span class="brand">
          <BrandSeal />
          回正
        </span>
      )}
      <div class="row">
        {mode.value === 'local' ? (
          <span class="mode-badge" title="不在 claude.ai 里打开时，数据只存在这个浏览器">
            本机模式
          </span>
        ) : null}
        {children}
      </div>
    </div>
  );
}
