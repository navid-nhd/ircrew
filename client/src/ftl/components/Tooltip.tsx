import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

interface Props {
  /** Persian explanation displayed on hover. */
  text: ReactNode;
  /** Optional title shown above the explanation. */
  title?: string;
}

// Floating tooltip — uses position:fixed and clamps inside the viewport so
// the bubble is NEVER cropped by a parent's overflow:hidden or by the screen
// edge. Picks above/below based on which side has more room.
export default function Tooltip({ text, title }: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; place: 'above' | 'below' } | null>(null);

  // Compute position whenever the tooltip opens — re-measure the trigger,
  // clamp horizontally to viewport, pick the side with more room.
  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    const trigger = triggerRef.current;
    const bubble = bubbleRef.current;
    if (!trigger || !bubble) return;
    const t = trigger.getBoundingClientRect();
    const b = bubble.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 8;
    const spaceAbove = t.top;
    const spaceBelow = vh - t.bottom;
    const place: 'above' | 'below' = spaceBelow >= b.height + margin || spaceBelow >= spaceAbove ? 'below' : 'above';
    const top = place === 'below' ? t.bottom + margin : t.top - b.height - margin;
    // Horizontal — anchor to trigger center, clamp to viewport.
    let left = t.left + t.width / 2 - b.width / 2;
    left = Math.max(margin, Math.min(left, vw - b.width - margin));
    setPos({ top, left, place });
  }, [open]);

  // Reposition on scroll / resize while open so the bubble follows.
  useEffect(() => {
    if (!open) return;
    const reflow = () => {
      const trigger = triggerRef.current;
      const bubble = bubbleRef.current;
      if (!trigger || !bubble) return;
      const t = trigger.getBoundingClientRect();
      const b = bubble.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const margin = 8;
      const spaceAbove = t.top;
      const spaceBelow = vh - t.bottom;
      const place: 'above' | 'below' = spaceBelow >= b.height + margin || spaceBelow >= spaceAbove ? 'below' : 'above';
      const top = place === 'below' ? t.bottom + margin : t.top - b.height - margin;
      let left = t.left + t.width / 2 - b.width / 2;
      left = Math.max(margin, Math.min(left, vw - b.width - margin));
      setPos({ top, left, place });
    };
    window.addEventListener('scroll', reflow, true);
    window.addEventListener('resize', reflow);
    return () => {
      window.removeEventListener('scroll', reflow, true);
      window.removeEventListener('resize', reflow);
    };
  }, [open]);

  return (
    <span
      className="tt-wrap"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
    >
      <button ref={triggerRef} type="button" className="tt-trigger" aria-label="توضیحات">?</button>
      {open && (
        <div
          ref={bubbleRef}
          className="tt-bubble tt-floating"
          role="tooltip"
          style={pos
            ? { position: 'fixed', top: pos.top, left: pos.left, right: 'auto', bottom: 'auto', opacity: 1 }
            : { position: 'fixed', top: -9999, left: -9999, right: 'auto', bottom: 'auto', opacity: 0 }
          }
        >
          {title && <span className="tt-title">{title}</span>}
          <span className="tt-body">{text}</span>
        </div>
      )}
    </span>
  );
}
