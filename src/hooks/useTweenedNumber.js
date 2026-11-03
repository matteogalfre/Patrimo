import { useEffect, useRef, useState } from 'react';

/**
 * Fait défiler un nombre vers sa nouvelle valeur (courbe qui ralentit à la
 * fin). Avec `duration` à 0, la valeur suit immédiatement : c'est le cas
 * pendant qu'on glisse le doigt sur un graphique.
 */
export const useTweenedNumber = (target, duration = 450) => {
  const [value, setValue] = useState(target);
  const current = useRef(target);
  const frame = useRef(null);

  useEffect(() => {
    cancelAnimationFrame(frame.current);
    if (!Number.isFinite(target) || !Number.isFinite(current.current) || duration <= 0) {
      current.current = target;
      setValue(target);
      return undefined;
    }
    const from = current.current;
    const start = Date.now();
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      const next = from + (target - from) * (1 - (1 - t) ** 3);
      current.current = next;
      setValue(next);
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [target, duration]);

  return value;
};

export default useTweenedNumber;
