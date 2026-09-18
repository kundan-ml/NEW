import { Cpu, MemoryStick, Network, Thermometer, Activity, Zap } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';

const METRICS = [
  { label: 'CPU', value: 42, unit: '%', icon: Cpu },
  { label: 'Memory', value: 61, unit: '%', icon: MemoryStick },
  { label: 'Network', value: 12, unit: 'MB/s', icon: Network },
  { label: 'Temperature', value: 58, unit: '°C', icon: Thermometer },
];

export default function SystemPage() {
  return (
    <>
      <PageHeader
        eyebrow="Diagnostics"
        title="System"
        subtitle="Runtime metrics and service health"
        actions={<span className="pill live"><span className="dot" /> Healthy</span>}
      />

      <section className="kpis">
        {METRICS.map(({ label, value, unit, icon: Icon }) => (
          <div className="kpi" key={label} style={{ '--accent': 'var(--cyan)', '--accent-soft': 'var(--cyan-soft)' } as React.CSSProperties}>
            <div className="kpi-top">
              <span className="kpi-label">{label}</span>
              <span className="kpi-icon"><Icon size={16} /></span>
            </div>
            <div className="kpi-value">{value}<small>{unit}</small></div>
            <div className="bar" style={{ marginTop: 8 }}>
              <i style={{ width: `${Math.min(Number(value), 100)}%` }} />
            </div>
          </div>
        ))}
      </section>

      <div className="grid">
        <Card title="Services" pad={false}>
          <div className="test-list">
            {[
              { name: 'oaklin-api', status: 'running', uptime: '4d 12h' },
              { name: 'halcon-bridge', status: 'running', uptime: '4d 12h' },
              { name: 'camera-daemon', status: 'running', uptime: '4d 12h' },
              { name: 'ws-stream', status: 'running', uptime: '2d 03h' },
              { name: 'log-collector', status: 'warning', uptime: '1h 22m' },
            ].map((s) => (
              <div key={s.name} className="test-row">
                <span className={`test-dot ${s.status === 'running' ? 'pass' : 'warn'}`} />
                <span className="test-name mono">{s.name}</span>
                <span className="test-value mono">{s.uptime}</span>
                <span className={`status ${s.status === 'running' ? 'pass' : 'warn'}`}>
                  {s.status === 'running' ? 'Running' : 'Warning'}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <div className="side-col">
          <Card title="Build Info">
            <div className="kv">
              <div className="kv-row"><span>Version</span><span className="mono">v1.4.2</span></div>
              <div className="kv-row"><span>Commit</span><span className="mono">a8f3d21</span></div>
              <div className="kv-row"><span>Node</span><span className="mono">20.11</span></div>
              <div className="kv-row"><span>Next.js</span><span className="mono">15.0</span></div>
            </div>
          </Card>

          <Card title="Quick Actions">
            <div className="stack">
              <button className="btn ghost full" type="button"><Activity size={16} /> View Logs</button>
              <button className="btn ghost full" type="button"><Zap size={16} /> Restart Services</button>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}