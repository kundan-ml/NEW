import { Focus, Sliders, Save } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import Field from '@/components/ui/Field';

export default function FocusPage() {
  return (
    <>
      <PageHeader
        eyebrow="Optics"
        title="Focus Control"
        subtitle="Manual and auto-focus calibration"
        actions={<button className="btn primary sm" type="button"><Save size={14} /> Save Preset</button>}
      />

      <div className="grid">
        <Card title="Focus Preview" pad={false}>
          <div className="viewer-stage tall">
            <span className="corner tl" /><span className="corner tr" />
            <span className="corner bl" /><span className="corner br" />
            <div className="crosshair-h" /><div className="crosshair-v" />
            <div className="stage-lens" />
            <div className="focus-ring" style={{ top: '50%', left: '50%' }}>
              <span />
            </div>
          </div>
          <div className="viewer-foot">
            <div className="vf-item"><span className="vf-k">Sharpness</span><span className="vf-v ok">0.94</span></div>
            <div className="vf-item"><span className="vf-k">Z-Position</span><span className="vf-v">12.418 mm</span></div>
            <div className="vf-item"><span className="vf-k">Contrast</span><span className="vf-v">82%</span></div>
            <div className="vf-item"><span className="vf-k">Mode</span><span className="vf-v">Auto</span></div>
          </div>
        </Card>

        <div className="side-col">
          <Card title="Adjustments">
            <div className="stack">
              <Field label="Z-Position (mm)" hint="Coarse focus along optical axis">
                <input className="input" type="range" min={0} max={25} step={0.001} defaultValue={12.418} />
              </Field>
              <Field label="Aperture">
                <input className="input" type="range" min={1} max={16} defaultValue={5} />
              </Field>
              <Field label="Exposure (ms)">
                <input className="input" type="range" min={1} max={30} step={0.1} defaultValue={8.2} />
              </Field>
              <button className="btn primary full" type="button"><Focus size={16} /> Auto-Focus Now</button>
            </div>
          </Card>

          <Card title="Quick Actions">
            <div className="stack">
              <button className="btn ghost full" type="button"><Sliders size={16} /> Load Calibration</button>
              <button className="btn ghost full" type="button"><Save size={16} /> Save as Preset</button>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}