import type { ReactNode } from 'react';

type Props = {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  pad?: boolean;
  className?: string;
};

export default function Card({
  title,
  subtitle,
  actions,
  children,
  pad = true,
  className = '',
}: Props) {
  return (
    <section className={`card ${className}`}>
      {title ? (
        <div className="card-head">
          <div>
            <h3>{title}</h3>
            {subtitle ? <p className="muted">{subtitle}</p> : null}
          </div>
          {actions ? <div className="card-actions">{actions}</div> : null}
        </div>
      ) : null}
      <div className={pad ? 'card-body' : ''}>{children}</div>
    </section>
  );
}