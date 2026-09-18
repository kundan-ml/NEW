'use client';

import { useState } from 'react';
import { Save } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import Field from '@/components/ui/Field';
import Toggle from '@/components/ui/Toggle';

export default function SettingsPage() {
  const [dark, setDark] = useState(true);
  const [autoSave, setAutoSave] = useState(true);
  const [notifications, setNotifications] = useState(false);
  const [sounds, setSounds] = useState(true);

  return (
    <>
      <PageHeader
        eyebrow="Preferences"
        title="Settings"
        subtitle="Customize behavior and appearance"
        actions={<button className="btn primary sm" type="button"><Save size={14} /> Save</button>}
      />

      <div className="grid">
        <Card title="Appearance">
          <div className="form-grid">
            <Field label="Theme">
              <select className="input" defaultValue="midnight">
                <option value="midnight">Midnight</option>
                <option value="graphite">Graphite</option>
                <option value="arctic">Arctic</option>
              </select>
            </Field>
            <Field label="Accent">
              <select className="input" defaultValue="cyan">
                <option value="cyan">Cyan</option>
                <option value="violet">Violet</option>
                <option value="green">Green</option>
                <option value="amber">Amber</option>
              </select>
            </Field>
            <Field label="Density">
              <select className="input" defaultValue="comfortable">
                <option value="compact">Compact</option>
                <option value="comfortable">Comfortable</option>
                <option value="spacious">Spacious</option>
              </select>
            </Field>
            <Field label="UI Scale">
              <input className="input" type="range" min={80} max={120} defaultValue={100} />
            </Field>
          </div>
        </Card>

        <div className="side-col">
          <Card title="Behavior">
            <div className="stack">
              <Toggle checked={dark} onChange={setDark} label="Dark mode" hint="Use dark surface palette" />
              <Toggle checked={autoSave} onChange={setAutoSave} label="Auto-save results" hint="Persist every inspection" />
              <Toggle checked={notifications} onChange={setNotifications} label="Desktop notifications" hint="Alert on defects" />
              <Toggle checked={sounds} onChange={setSounds} label="Sound on pass/fail" />
            </div>
          </Card>

          <Card title="Data Paths">
            <div className="stack">
              <Field label="Dataset root">
                <input className="input" defaultValue="/data/datasets" />
              </Field>
              <Field label="Log directory">
                <input className="input" defaultValue="/var/log/oaklin" />
              </Field>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}