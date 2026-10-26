import type { ComponentChildren } from 'preact';

/** A progress ring with content in the middle. `value` runs 0–1. */
export function Dial({ value, color, children, width = 6 }: { value: number; color: string; children?: ComponentChildren; width?: number }) {
  const r = 50 - width;
  const c = 2 * Math.PI * r;
  const v = Math.min(1, Math.max(0, value));
  return (
    <div class="dial">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle class="track" cx="50" cy="50" r={r} fill="none" stroke-width={width} />
        <circle
          class="bar"
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={color}
          stroke-width={width}
          stroke-linecap="round"
          stroke-dasharray={c}
          stroke-dashoffset={c * (1 - v)}
        />
      </svg>
      <div class="dial-center">{children}</div>
    </div>
  );
}
