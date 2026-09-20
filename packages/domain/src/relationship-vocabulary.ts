/**
 * Relationship vocabulary — ADR-0026 point 5.
 *
 * `KNOWLEDGE_GRAPH.md` §11 requires the relationship taxonomy to be
 * extensible without a code change: additive by default, namespaced
 * deployment extensions, no removal without a deprecation cycle. A hardcoded
 * TypeScript union cannot express "an operator added a type at runtime", so
 * the vocabulary is data (`RelationshipTypeDefinition` rows in Postgres, a
 * real foreign key from `KnowledgeRelationship.relationshipType`), not an
 * enum here.
 *
 * What *is* here is the seed content — the seven categories and the
 * ontology's own types (`KNOWLEDGE_GRAPH.md` §4) plus the additional codes
 * the originating feature request asked for by name, unioned once so the
 * two vocabularies never fork. `services/api-gateway/prisma` seeds these
 * rows at migration time; this module is the single source that seed reads
 * from, so the seed and this list cannot drift.
 */

export type RelationshipCategory =
  | 'participation'
  | 'affiliation'
  | 'causation'
  | 'evidential'
  | 'accountability'
  | 'impact'
  | 'thematic'
  | 'spatial'
  | 'lifecycle'
  | 'perspective';

export interface RelationshipTypeSeed {
  readonly code: string;
  readonly category: RelationshipCategory;
  readonly description: string;
  /** Core types come from the ratified ontology; non-core from the request. */
  readonly isCore: boolean;
  readonly inverseCode?: string;
}

const ONTOLOGY_VERSION = '0.1.0';

/**
 * `KNOWLEDGE_GRAPH.md` §4 — the ratified categorised taxonomy. These are
 * `isCore: true`: removing one requires the ontology-governance process in
 * §11 (Knowledge Graph Lead + Principal Architect sign-off, an ADR).
 */
const ONTOLOGY_CORE_TYPES: readonly RelationshipTypeSeed[] = [
  { code: 'ATTENDED', category: 'participation', description: 'Attended a meeting.', isCore: true },
  { code: 'SPOKE_AT', category: 'participation', description: 'Spoke at a meeting.', isCore: true },
  { code: 'CONVENED', category: 'participation', description: 'Convened a meeting.', isCore: true },
  {
    code: 'CONSULTED_IN',
    category: 'participation',
    description: 'A community was consulted in a meeting.',
    isCore: true,
  },
  {
    code: 'REPRESENTED',
    category: 'participation',
    description: 'Represented another party.',
    isCore: true,
  },
  { code: 'CHAIRED', category: 'participation', description: 'Chaired a meeting.', isCore: true },
  {
    code: 'APOLOGISED_FOR',
    category: 'participation',
    description: 'Sent apologies for a meeting.',
    isCore: true,
  },
  { code: 'MEMBER_OF', category: 'affiliation', description: 'Is a member of.', isCore: true },
  {
    code: 'BELONGS_TO',
    category: 'affiliation',
    description: 'Belongs to a community.',
    isCore: true,
  },
  { code: 'EMPLOYED_BY', category: 'affiliation', description: 'Is employed by.', isCore: true },
  { code: 'PART_OF', category: 'affiliation', description: 'Is part of.', isCore: true },
  {
    code: 'CUSTODIAN_OF',
    category: 'affiliation',
    description: 'Is the custodian of a place or body of knowledge.',
    isCore: true,
  },
  { code: 'PRODUCED', category: 'causation', description: 'Produced a decision.', isCore: true },
  { code: 'GENERATED', category: 'causation', description: 'Generated an action.', isCore: true },
  { code: 'CREATED', category: 'causation', description: 'Created a commitment.', isCore: true },
  { code: 'RAISED', category: 'causation', description: 'Raised a risk.', isCore: true },
  {
    code: 'TRIGGERED',
    category: 'causation',
    description: 'Triggered a subsequent event.',
    isCore: true,
  },
  {
    code: 'SUPERSEDES',
    category: 'causation',
    description: 'Supersedes an earlier assertion or entity.',
    isCore: true,
  },
  {
    code: 'SUPPORTED_BY',
    category: 'evidential',
    description: 'Is supported by a piece of evidence.',
    isCore: true,
    inverseCode: 'SUPPORTS',
  },
  {
    code: 'CONTRADICTED_BY',
    category: 'evidential',
    description: 'Is contradicted by another assertion.',
    isCore: true,
    inverseCode: 'CONTRADICTS',
  },
  { code: 'CITES', category: 'evidential', description: 'Cites a source.', isCore: true },
  {
    code: 'DERIVED_FROM',
    category: 'evidential',
    description: 'Was derived from a source.',
    isCore: true,
  },
  { code: 'OWNS', category: 'accountability', description: 'Owns an action.', isCore: true },
  {
    code: 'ACCOUNTABLE_FOR',
    category: 'accountability',
    description: 'Is accountable for a project.',
    isCore: true,
  },
  { code: 'PROMISED', category: 'accountability', description: 'Made a commitment.', isCore: true },
  {
    code: 'OWED_TO',
    category: 'accountability',
    description: 'A commitment is owed to a community.',
    isCore: true,
  },
  { code: 'DELEGATED_TO', category: 'accountability', description: 'Delegated to.', isCore: true },
  {
    code: 'AFFECTED_BY',
    category: 'impact',
    description: 'Is affected by a policy.',
    isCore: true,
  },
  {
    code: 'THREATENS',
    category: 'impact',
    description: 'A risk threatens a project.',
    isCore: true,
  },
  {
    code: 'MITIGATED_BY',
    category: 'impact',
    description: 'Is mitigated by an action.',
    isCore: true,
  },
  { code: 'BENEFITS', category: 'impact', description: 'Benefits a party.', isCore: true },
  {
    code: 'DISCUSSED',
    category: 'thematic',
    description: 'A meeting discussed a topic.',
    isCore: true,
  },
  { code: 'ABOUT', category: 'thematic', description: 'Is about a topic.', isCore: true },
  { code: 'RELATED_TO', category: 'thematic', description: 'Is related to.', isCore: true },
  {
    code: 'BROADER_THAN',
    category: 'thematic',
    description: 'Is a broader topic than.',
    isCore: true,
    inverseCode: 'NARROWER_THAN',
  },
  {
    code: 'NARROWER_THAN',
    category: 'thematic',
    description: 'Is a narrower topic than.',
    isCore: true,
  },
  {
    code: 'LOCATED_IN',
    category: 'spatial',
    description: 'Is located within a place.',
    isCore: true,
  },
  { code: 'ADJACENT_TO', category: 'spatial', description: 'Is adjacent to.', isCore: true },
  { code: 'WITHIN', category: 'spatial', description: 'Is within.', isCore: true },
  {
    code: 'FULFILLED_BY',
    category: 'lifecycle',
    description: 'A commitment is fulfilled by an action.',
    isCore: true,
  },
  {
    code: 'IMPLEMENTS',
    category: 'lifecycle',
    description: 'A decision implements a policy.',
    isCore: true,
  },
  {
    code: 'DELIVERS',
    category: 'lifecycle',
    description: 'A project delivers a policy.',
    isCore: true,
  },
  {
    code: 'BLOCKS',
    category: 'lifecycle',
    description: 'Blocks progress on something.',
    isCore: true,
  },
  {
    code: 'CONTRADICTS',
    category: 'evidential',
    description:
      'Institutions contradict themselves; surfaced to a human, never silently resolved.',
    isCore: true,
    inverseCode: 'CONTRADICTED_BY',
  },
];

/**
 * Additional codes the originating feature request named explicitly that
 * are not already covered above by an equivalent ontology type. Marked
 * `isCore: false` (evolvable without the full ontology-governance process,
 * per §11's relationship-type extensibility) but seeded by default rather
 * than left to a deployment namespace, since the request treats them as
 * baseline vocabulary, not a per-deployment extension.
 */
const REQUEST_VOCABULARY_ADDITIONS: readonly RelationshipTypeSeed[] = [
  {
    code: 'MENTIONS',
    category: 'evidential',
    description: 'Evidence mentions an entity.',
    isCore: false,
  },
  {
    code: 'QUALIFIES',
    category: 'thematic',
    description: 'Qualifies or adds a condition to.',
    isCore: false,
  },
  {
    code: 'REQUIRES',
    category: 'accountability',
    description: 'Requires another thing to hold.',
    isCore: false,
  },
  { code: 'DEPENDS_ON', category: 'lifecycle', description: 'Depends on.', isCore: false },
  {
    code: 'PROPOSES',
    category: 'causation',
    description: 'Proposes a decision or action.',
    isCore: false,
  },
  {
    code: 'RESPONDS_TO',
    category: 'thematic',
    description: 'Responds to a prior statement.',
    isCore: false,
  },
  {
    code: 'DECIDED_BY',
    category: 'accountability',
    description: 'Was decided by an authorised party.',
    isCore: false,
  },
  {
    code: 'RESULTED_IN',
    category: 'causation',
    description: 'Resulted in an outcome.',
    isCore: false,
  },
  {
    code: 'EVIDENCED_BY',
    category: 'evidential',
    description:
      'Is evidenced by (a plain-language alias of SUPPORTED_BY, kept because facilitator UX asked for it by this name).',
    isCore: false,
  },
  {
    code: 'RAISED_BY',
    category: 'accountability',
    description: 'Was raised by a person or group.',
    isCore: false,
  },
  {
    code: 'AGREED_BY',
    category: 'accountability',
    description: 'Was agreed by a person or group.',
    isCore: false,
  },
  {
    code: 'DISPUTED_BY',
    category: 'perspective',
    description: 'Is disputed by a person or group.',
    isCore: false,
  },
  {
    code: 'CONTESTED_IN',
    category: 'perspective',
    description:
      'A proposal or assertion is contested in a specific session — the disagreement-preservation edge (ADR-0026 point 6).',
    isCore: false,
  },
];

export const RELATIONSHIP_TYPE_SEEDS: readonly RelationshipTypeSeed[] = [
  ...ONTOLOGY_CORE_TYPES,
  ...REQUEST_VOCABULARY_ADDITIONS,
];

export const RELATIONSHIP_ONTOLOGY_VERSION = ONTOLOGY_VERSION;

/**
 * Deployment-local extension namespace, per `KNOWLEDGE_GRAPH.md` §11:
 * operators may add relationship types in this range without a core-schema
 * upgrade conflict. Not enforced here (the domain layer does not know which
 * codes a given deployment has registered) — enforced by the
 * `RelationshipTypeDefinition` foreign key plus a service-layer check that a
 * newly-registered code matching this pattern is not also claiming `isCore`.
 */
export const DEPLOYMENT_EXTENSION_PATTERN = /^x_[a-z0-9]+_[A-Z0-9_]+$/;
