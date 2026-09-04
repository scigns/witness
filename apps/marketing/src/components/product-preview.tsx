import { Badge, Card, Stat } from './marketing-primitives';
import { LinearProvenanceChain } from './provenance';

const metrics = [
  ['Evidence', 186],
  ['Contributors', 54],
  ['Recommendations', 18],
  ['Decisions', 8],
  ['Actions', 21],
] as const;

const supportingRecords = [
  'Community consultation #14',
  'Staff workshop #08',
  'Service review #03',
  'Policy analysis #07',
];

export function ProductPreview() {
  return (
    <div className="product-preview" aria-label="Illustrative Witness product view">
      <Card className="product-preview-header">
        <div>
          <Badge>Illustrative example</Badge>
          <h3>Institutional Transformation Programme</h3>
        </div>
        <p className="product-preview-context">
          A synthetic record showing how relationships stay visible.
        </p>
      </Card>
      <dl className="product-metrics" aria-label="Illustrative programme metrics">
        {metrics.map(([label, value]) => (
          <Stat key={label} label={label} value={value} />
        ))}
      </dl>
      <div className="product-preview-detail">
        <Card>
          <div className="preview-record-heading">
            <p className="eyebrow">Decision #08</p>
            <Badge>Approved</Badge>
          </div>
          <h3>Adopt revised complaints process</h3>
          <p className="preview-muted">Supporting evidence</p>
          <ul className="supporting-records">
            {supportingRecords.map((record) => (
              <li key={record}>{record}</li>
            ))}
          </ul>
        </Card>
        <Card>
          <p className="eyebrow">Action #21</p>
          <h3>Implement revised service process</h3>
          <p className="preview-muted">Linked to Decision #08</p>
        </Card>
      </div>
      <LinearProvenanceChain
        label="Illustrative evidence to action relationship"
        steps={[
          { kind: 'evidence', label: 'Evidence' },
          { kind: 'finding', label: 'Finding' },
          { kind: 'recommendation', label: 'Recommendation' },
          { kind: 'decision', label: 'Decision' },
          { kind: 'action', label: 'Action' },
        ]}
      />
    </div>
  );
}
