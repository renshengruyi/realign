import { notices } from '../../platform/store';
import { Icon } from './Icon';

export function Toasts() {
  const list = notices.value;
  return (
    <div class="toasts" aria-live="polite">
      {list.map((n) => (
        <div key={n.id} class={`toast${n.tone === 'error' ? ' error' : ''}`} role={n.tone === 'error' ? 'alert' : 'status'}>
          <Icon name={n.tone === 'error' ? 'alert' : n.tone === 'success' ? 'check' : 'bell'} />
          <span>{n.text}</span>
        </div>
      ))}
    </div>
  );
}
