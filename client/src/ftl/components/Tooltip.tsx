import { useState, type ReactNode } from 'react';

interface Props {
  /** Persian explanation displayed on hover. */
  text: ReactNode;
  /** Optional title shown above the explanation. */
  title?: string;
}

/**
 * Renders a small "?" badge that, when hovered (or focused), shows
 * a Persian explanation tooltip. Click toggles for touch users.
 */
export default function Tooltip({ text, title }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <span
      className="tt-wrap"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
    >
      <button type="button" className="tt-trigger" aria-label="توضیحات">?</button>
      {open && (
        <span className="tt-bubble" role="tooltip">
          {title && <span className="tt-title">{title}</span>}
          <span className="tt-body">{text}</span>
        </span>
      )}
    </span>
  );
}
