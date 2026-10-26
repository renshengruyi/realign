import { useEffect, useRef, useState } from 'preact/hooks';
import type { SealState } from '../../domain/metrics';
import { play } from '../audio';

/**
 * A seal stamp per area of the day. It fills with ink as the day's target
 * gets closer (朱文, colored glyph) and turns solid with a white glyph when
 * the target is met (白文), with a small stamp when that happens.
 */
export function Seal({ state, mini, animate = true }: { state: SealState; mini?: boolean; animate?: boolean }) {
  const prev = useRef(state.done);
  const [stamping, setStamping] = useState(false);
  useEffect(() => {
    if (animate && state.done && !prev.current) {
      setStamping(true);
      play('stamp');
      const id = setTimeout(() => setStamping(false), 600);
      prev.current = state.done;
      return () => clearTimeout(id);
    }
    prev.current = state.done;
  }, [state.done]);
  return (
    <span
      class={`seal${mini ? ' mini' : ''}${state.done ? ' done' : ''}${stamping ? ' stamp' : ''}`}
      data-k={state.key}
      aria-hidden="true"
    >
      <span class="ink" style={{ height: `${Math.round(state.progress * 100)}%` }} />
      <span class="glyph">{state.char}</span>
    </span>
  );
}
