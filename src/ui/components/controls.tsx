import type { ComponentChildren } from 'preact';
import { useId } from 'preact/hooks';
import { Icon } from './Icon';

export function Field({ label, hint, children }: { label: string; hint?: string; children: ComponentChildren }) {
  return (
    <div class="field" role="group" aria-label={label}>
      <span class="label">{label}</span>
      {children}
      {hint ? <span class="hint">{hint}</span> : null}
    </div>
  );
}

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 99,
  step = 1,
  label,
  suffix,
}: {
  value: number | undefined;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
  suffix?: string;
}) {
  const v = value ?? min;
  const set = (n: number) => onChange(Math.min(max, Math.max(min, Math.round(n * 100) / 100)));
  return (
    <div class="stepper">
      <button type="button" aria-label={`${label}减少`} onClick={() => set(value === undefined ? min : v - step)} disabled={value !== undefined && v <= min}>
        <Icon name="minus" />
      </button>
      <output aria-live="polite" aria-label={label}>
        {value === undefined ? '—' : v}
        {suffix && value !== undefined ? <span class="small soft"> {suffix}</span> : null}
      </output>
      <button type="button" aria-label={`${label}增加`} onClick={() => set(value === undefined ? min + step : v + step)} disabled={value !== undefined && v >= max}>
        <Icon name="plus" />
      </button>
    </div>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
  quiet,
}: {
  options: { value: T; label: string }[];
  value: T | undefined;
  onChange: (v: T) => void;
  label: string;
  quiet?: boolean;
}) {
  return (
    <div class={`seg${quiet ? ' quiet' : ''}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button type="button" key={String(o.value)} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chips({
  options,
  values,
  onChange,
  label,
}: {
  options: string[];
  values: string[];
  onChange: (v: string[]) => void;
  label: string;
}) {
  return (
    <div class="seg" role="group" aria-label={label}>
      {options.map((o) => {
        const on = values.includes(o);
        return (
          <button
            type="button"
            key={o}
            aria-pressed={on}
            onClick={() => onChange(on ? values.filter((x) => x !== o) : [...values, o])}
          >
            {on ? <Icon name="check" size={14} /> : null}
            {o}
          </button>
        );
      })}
    </div>
  );
}

/** 0–10 rating row (or 1–5 with `five`). */
export function Scale({
  value,
  onChange,
  label,
  five,
  low,
  high,
}: {
  value: number | undefined;
  onChange: (v: number) => void;
  label: string;
  five?: boolean;
  low?: string;
  high?: string;
}) {
  const nums = five ? [1, 2, 3, 4, 5] : Array.from({ length: 11 }, (_, i) => i);
  return (
    <div class="stack tight">
      <div class={`scale${five ? ' five' : ''}`} role="group" aria-label={label}>
        {nums.map((n) => (
          <button type="button" key={n} aria-pressed={value === n} onClick={() => onChange(n)} aria-label={`${label} ${n}`}>
            {n}
          </button>
        ))}
      </div>
      {low || high ? (
        <div class="scale-legend">
          <span>{low}</span>
          <span>{high}</span>
        </div>
      ) : null}
    </div>
  );
}

export function Switch({ checked, onChange, label, sub }: { checked: boolean; onChange: (v: boolean) => void; label: string; sub?: string }) {
  const id = useId();
  return (
    <label class="switch" for={id}>
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange((e.target as HTMLInputElement).checked)} />
      <span class="track" />
      <span class="grow">
        <span>{label}</span>
        {sub ? <span class="xs muted" style="display:block">{sub}</span> : null}
      </span>
    </label>
  );
}

export function TimeInput({ value, onChange, label, id }: { value: string | undefined; onChange: (v: string) => void; label: string; id?: string }) {
  return (
    <input
      id={id}
      class="input time"
      type="time"
      aria-label={label}
      value={value ?? ''}
      onInput={(e) => onChange((e.target as HTMLInputElement).value)}
    />
  );
}

export function TextArea({
  value,
  onInput,
  placeholder,
  rows = 3,
  label,
  id,
}: {
  value: string | undefined;
  onInput: (v: string) => void;
  placeholder?: string;
  rows?: number;
  label: string;
  id?: string;
}) {
  return (
    <textarea
      id={id}
      class="textarea"
      rows={rows}
      aria-label={label}
      placeholder={placeholder}
      value={value ?? ''}
      onInput={(e) => onInput((e.target as HTMLTextAreaElement).value)}
    />
  );
}

export function Empty({ icon, title, children }: { icon: string; title: string; children?: ComponentChildren }) {
  return (
    <div class="empty">
      <Icon name={icon} />
      <p style="font-weight:600;color:var(--ink)">{title}</p>
      {children ? <div class="small">{children}</div> : null}
    </div>
  );
}

export function Callout({ tone, icon, children }: { tone?: 'warn' | 'bad'; icon?: string; children: ComponentChildren }) {
  return (
    <div class={`callout${tone ? ' ' + tone : ''}`}>
      <Icon name={icon ?? (tone ? 'alert' : 'info')} />
      <div class="grow">{children}</div>
    </div>
  );
}

export function Progress({ value, color }: { value: number; color?: string }) {
  return (
    <div class="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
      <i style={{ width: `${Math.min(100, Math.max(0, value * 100))}%`, background: color }} />
    </div>
  );
}

export function Thinking({ label = '正在想' }: { label?: string }) {
  return (
    <span class="row small muted" role="status">
      <span class="thinking" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      {label}
    </span>
  );
}
