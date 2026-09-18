import { ScanLine, Upload, CheckCircle2, Crosshair } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';

export default function RegistrationPage() {
  return (
    <>
      <PageHeader
        eyebrow="Calibration"
        title="Image Registration"
        subtitle="Align reference template with live capture"
        actions={<button className="btn primary sm" type="button"><CheckCircle2 size={14} /> Confirm Alignment</button>}
      />

      <div className="grid">
        <Card title="Registration Overlay" subtitle="Offset: 0.14 px · Rotation: 0.02°" pad={false}>
          <div className="viewer-stage tall">
            <span className="corner tl" /><span className="corner tr" />
            <span className="corner bl" /><span className="corner br" />
            <div className="reg-frame" />
            <div className="reg-frame reg-live" />
            <div className="crosshair-h" /><div className="crosshair-v" />
          </div>
          <div className="viewer-foot">
            <div className="vf-item"><span className="vf-k">Alignment</span><span className="vf-v ok">Locked</span></div>
            <div className="vf-item"><span className="vf-k">RMSE</span><span className="vf-v">0.18 px</span></div>
            <div className="vf-item"><span className="vf-k">Rotation</span><span className="vf-v">0.02°</span></div>
            <div className="vf-item"><span className="vf-k">Scale</span><span className="vf-v">1.0000</span></div>
          </div>
        </Card>

        <div className="side-col">
          <Card title="Reference">
            <div className="stack">
              <button className="btn ghost full" type="button"><Upload size={16} /> Upload Reference</button>
              <button className="btn ghost full" type="button"><ScanLine size={16} /> Capture Reference</button>
              <button className="btn ghost full" type="button"><Crosshair size={16} /> Manual Points</button>
            </div>
          </Card>

          <Card title="Status">
            <div className="kv">
              <div className="kv-row"><span>Template</span><span className="mono">ref_v3.png</span></div>
              <div className="kv-row"><span>Features</span><span className="mono">128</span></div>
              <div className="kv-row"><span>Matches</span><span className="mono">124 / 128</span></div>
              <div className="kv-row"><span>Confidence</span><span className="mono">99.8%</span></div>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}