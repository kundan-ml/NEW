'use client';

type Props = {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
};

export default function Toggle({ checked, onChange, label, hint }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`toggle-row${checked ? ' on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-text">
        <span className="toggle-label">{label}</span>
        {hint ? <span className="toggle-hint">{hint}</span> : null}
      </span>
      <span className="toggle">
        <span className="toggle-thumb" />
      </span>
    </button>
  );
}