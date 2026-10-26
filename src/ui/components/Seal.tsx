import { useEffect, useRef, useState } from 'preact/hooks';
import type { SealState } from '../../domain/metrics';
import { play } from '../audio';

/**
 * A seal stamp per area of the day. It fills with ink as the day's target
 * gets closer (朱文, colored glyph) and turns solid with a white glyph when
 * the target is met (白文). It stamps when that happens on screen, or on the
 * first look after it happened elsewhere (`stamp`).
 */
export function Seal({ state, mini, animate = true, stamp = false }: { state: SealState; mini?: boolean; animate?: boolean; stamp?: boolean }) {
  const prev = useRef(state.done);
  const [stamping, setStamping] = useState(false);
  const fire = () => {
    setStamping(true);
    play('stamp');
    return setTimeout(() => setStamping(false), 600);
  };
  useEffect(() => {
    if (!stamp || !state.done) return;
    const id = setTimeout(fire, 250);
    return () => clearTimeout(id);
  }, []);
  useEffect(() => {
    if (animate && state.done && !prev.current) {
      prev.current = state.done;
      const id = fire();
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
