import { Download, Filter, Search, Eye } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';

const ROWS = [
  { id: '#A-2409', station: 'ST-04', samples: 120, yield: '98.4%', status: 'run', ts: '10:42:18', defects: 2 },
  { id: '#A-2408', station: 'ST-03', samples: 240, yield: '99.1%', status: 'pass', ts: '10:18:04', defects: 2 },
  { id: '#A-2407', station: 'ST-02', samples: 180, yield: '96.7%', status: 'warn', ts: '09:54:31', defects: 6 },
  { id: '#A-2406', station: 'ST-04', samples: 300, yield: '99.6%', status: 'pass', ts: '09:31:12', defects: 1 },
  { id: '#A-2405', station: 'ST-01', samples: 150, yield: '91.3%', status: 'fail', ts: '09:08:47', defects: 13 },
  { id: '#A-2404', station: 'ST-02', samples: 200, yield: '97.8%', status: 'pass', ts: '08:44:05', defects: 4 },
  { id: '#A-2403', station: 'ST-03', samples: 260, yield: '99.4%', status: 'pass', ts: '08:22:51', defects: 2 },
  { id: '#A-2402', station: 'ST-01', samples: 140, yield: '94.2%', status: 'warn', ts: '07:59:12', defects: 8 },
] as const;

const LABEL: Record<string, string> = { run: 'Running', pass: 'Passed', warn: 'Review', fail: 'Failed' };

export default function HistoryPage() {
  return (
    <>
      <PageHeader
        eyebrow="Archive"
        title="Inspection History"
        subtitle="All batches from the last 30 days"
        actions={
          <>
            <button className="btn ghost sm" type="button"><Filter size={14} /> Filter</button>
            <button className="btn ghost sm" type="button"><Download size={14} /> Export CSV</button>
          </>
        }
      />

      <Card pad={false}>
        <div className="toolbar">
          <div className="toolbar-search">
            <Search size={15} />
            <input placeholder="Search by batch ID, station…" />
          </div>
          <div className="toolbar-chips">
            <button className="chip active" type="button">All</button>
            <button className="chip" type="button">Passed</button>
            <button className="chip" type="button">Review</button>
            <button className="chip" type="button">Failed</button>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Batch</th><th>Station</th><th>Samples</th>
              <th>Defects</th><th>Yield</th><th>Status</th><th>Time</th><th></th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((b) => (
              <tr key={b.id}>
                <td className="id">{b.id}</td>
                <td>{b.station}</td>
                <td className="mono">{b.samples}</td>
                <td className="mono">{b.defects}</td>
                <td className="mono">{b.yield}</td>
                <td><span className={`status ${b.status}`}>{LABEL[b.status]}</span></td>
                <td className="mono">{b.ts}</td>
                <td className="row-action"><Eye size={15} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}