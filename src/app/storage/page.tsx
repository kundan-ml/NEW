import { FolderOpen, Upload, HardDrive, Trash2, Database } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';

const DATASETS = [
  { name: 'batch_A-2409', count: 120, size: '2.4 GB', updated: '2 min ago' },
  { name: 'batch_A-2408', count: 240, size: '4.1 GB', updated: '18 min ago' },
  { name: 'batch_A-2407', count: 180, size: '3.2 GB', updated: '44 min ago' },
  { name: 'calibration_set_v3', count: 64, size: '820 MB', updated: '2 hours ago' },
];

export default function StoragePage() {
  return (
    <>
      <PageHeader
        eyebrow="Data"
        title="Storage & Datasets"
        subtitle="Manage captured datasets and calibration sets"
        actions={
          <>
            <button className="btn ghost sm" type="button"><Upload size={14} /> Upload</button>
            <button className="btn primary sm" type="button"><FolderOpen size={14} /> Load from path</button>
          </>
        }
      />

      <section className="stats-row">
        <div className="mini-stat">
          <HardDrive size={16} />
          <div><span className="mini-k">Used</span><span className="mini-v mono">248 GB</span></div>
        </div>
        <div className="mini-stat">
          <Database size={16} />
          <div><span className="mini-k">Datasets</span><span className="mini-v mono">34</span></div>
        </div>
        <div className="mini-stat">
          <FolderOpen size={16} />
          <div><span className="mini-k">Free</span><span className="mini-v mono">776 GB</span></div>
        </div>
      </section>

      <Card title="Datasets" subtitle="4 of 34 shown" pad={false}>
        {DATASETS.length === 0 ? (
          <EmptyState icon={FolderOpen} title="No datasets yet" description="Upload or load a dataset to get started." />
        ) : (
          <div className="dataset-grid">
            {DATASETS.map((d) => (
              <div key={d.name} className="dataset">
                <div className="dataset-icon"><FolderOpen size={18} /></div>
                <div className="dataset-body">
                  <h4>{d.name}</h4>
                  <div className="dataset-meta">
                    <span className="mono">{d.count} files</span>
                    <span className="dot-sep" />
                    <span className="mono">{d.size}</span>
                  </div>
                  <span className="dataset-time">{d.updated}</span>
                </div>
                <button className="icon-btn danger" type="button" aria-label="Delete">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}