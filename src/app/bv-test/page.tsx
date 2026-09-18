import { FlaskConical, Play, CheckCircle2, XCircle } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';

const TESTS = [
  { name: 'Brightness Uniformity', result: 'pass', value: '98.2%' },
  { name: 'Color Accuracy', result: 'pass', value: 'ΔE 0.42' },
  { name: 'Edge Sharpness', result: 'pass', value: '0.91' },
  { name: 'Distortion', result: 'warn', value: '0.8%' },
  { name: 'Chromatic Aberration', result: 'pass', value: '0.02 px' },
  { name: 'Noise Floor', result: 'pass', value: '1.2 dB' },
  { name: 'Optical Centering', result: 'fail', value: '1.4 px' },
] as const;

export default function BVTestPage() {
  const passed = TESTS.filter((t) => t.result === 'pass').length;
  const failed = TESTS.filter((t) => t.result === 'fail').length;

  return (
    <>
      <PageHeader
        eyebrow="Diagnostics"
        title="Brightness & Vignetting Test"
        subtitle="Optical quality verification suite"
        actions={<button className="btn primary sm" type="button"><Play size={14} /> Run All</button>}
      />

      <section className="stats-row">
        <div className="mini-stat"><CheckCircle2 size={16} style={{ color: 'var(--green)' }} />
          <div><span className="mini-k">Passed</span><span className="mini-v mono">{passed}</span></div></div>
        <div className="mini-stat"><XCircle size={16} style={{ color: 'var(--red)' }} />
          <div><span className="mini-k">Failed</span><span className="mini-v mono">{failed}</span></div></div>
        <div className="mini-stat"><FlaskConical size={16} />
          <div><span className="mini-k">Total</span><span className="mini-v mono">{TESTS.length}</span></div></div>
      </section>

      <Card title="Test Results" subtitle="Last run: 3 minutes ago" pad={false}>
        <div className="test-list">
          {TESTS.map((t) => (
            <div key={t.name} className="test-row">
              <span className={`test-dot ${t.result}`} />
              <span className="test-name">{t.name}</span>
              <span className="test-value mono">{t.value}</span>
              <span className={`status ${t.result === 'pass' ? 'pass' : t.result === 'fail' ? 'fail' : 'warn'}`}>
                {t.result === 'pass' ? 'Pass' : t.result === 'fail' ? 'Failed' : 'Warning'}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
