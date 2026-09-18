import { Check, ChevronRight } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import Field from '@/components/ui/Field';

const STEPS = [
  { n: 1, title: 'Camera', desc: 'Select and configure your capture device', done: true },
  { n: 2, title: 'Lighting', desc: 'Calibrate illumination profile', done: true },
  { n: 3, title: 'Backend', desc: 'Connect to inspection API', done: false },
  { n: 4, title: 'Review', desc: 'Confirm configuration', done: false },
];

export default function SetupPage() {
  return (
    <>
      <PageHeader
        eyebrow="Onboarding"
        title="Setup Wizard"
        subtitle="Configure your inspection station"
      />

      <div className="stepper">
        {STEPS.map((s, i) => (
          <div key={s.n} className={`step${s.done ? ' done' : ''}`}>
            <div className="step-num">{s.done ? <Check size={14} /> : s.n}</div>
            <div className="step-body">
              <span className="step-title">{s.title}</span>
              <span className="step-desc">{s.desc}</span>
            </div>
            {i < STEPS.length - 1 ? <ChevronRight size={16} className="step-arrow" /> : null}
          </div>
        ))}
      </div>

      <Card title="Backend Connection" subtitle="Step 3 of 4">
        <div className="form-grid">
          <Field label="API Base URL" hint="Where the inspection service is reachable">
            <input className="input" defaultValue="http://localhost:8000" />
          </Field>
          <Field label="WebSocket URL">
            <input className="input" defaultValue="ws://localhost:8000/ws" />
          </Field>
          <Field label="Camera ID">
            <input className="input" defaultValue="ST-04-CAM-01" />
          </Field>
          <Field label="Timeout (ms)">
            <input className="input" type="number" defaultValue={8000} />
          </Field>
        </div>

        <div className="form-actions">
          <button className="btn ghost" type="button">Back</button>
          <button className="btn primary" type="button">Test Connection</button>
          <button className="btn primary" type="button">Continue <ChevronRight size={16} /></button>
        </div>
      </Card>
    </>
  );
}