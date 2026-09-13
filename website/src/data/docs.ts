export interface DocItem {
  title: string;
  slug: string;
  href: string;
  description: string;
}

export interface DocSection {
  title: string;
  items: DocItem[];
}

export const DOCS_NAVIGATION: DocSection[] = [
  {
    title: 'Getting Started',
    items: [
      {
        title: 'Overview & Introduction',
        slug: 'index',
        href: '/docs',
        description: 'What is Binsight and how it works under the hood.',
      },
      {
        title: 'Installation',
        slug: 'installation',
        href: '/docs/installation',
        description: 'Install Binsight via Homebrew, Docker, pre-built tarballs, or Go.',
      },
      {
        title: 'Quickstart Guide',
        slug: 'quickstart',
        href: '/docs/quickstart',
        description: 'Run your first binlog inspection in under two minutes.',
      },
    ],
  },
  {
    title: 'Operating Modes',
    items: [
      {
        title: 'Offline File Inspection',
        slug: 'offline-mode',
        href: '/docs/offline-mode',
        description: 'Analyze local binlogs on disk with zero active database connection.',
      },
      {
        title: 'Live Replication Streaming',
        slug: 'streaming-mode',
        href: '/docs/streaming-mode',
        description: 'Stream binlog events in real-time as a read-only replication client.',
      },
    ],
  },
  {
    title: 'Forensics & Analysis',
    items: [
      {
        title: 'Transaction Grouping',
        slug: 'transactions',
        href: '/docs/transactions',
        description: 'Understand XID commit boundaries and atomic transaction timelines.',
      },
      {
        title: 'Row-Image Diffs',
        slug: 'diffs',
        href: '/docs/diffs',
        description: 'Visual side-by-side and unified diffs for UPDATE, INSERT, and DELETE rows.',
      },
      {
        title: 'Hex Forensic Inspector',
        slug: 'hex-inspector',
        href: '/docs/hex-inspector',
        description: 'Fixed-pitch byte dump inspection with ASCII decode representation.',
      },
      {
        title: 'Anomaly Engine & 4 GiB Wraps',
        slug: 'anomalies',
        href: '/docs/anomalies',
        description: 'Catch huge transactions, long lags, rolled-back txns, and position wraps.',
      },
    ],
  },
  {
    title: 'Reference & Operations',
    items: [
      {
        title: 'CLI & Environment Variables',
        slug: 'configuration',
        href: '/docs/configuration',
        description: 'Complete flag and BINSIGHT_* environment variable reference.',
      },
      {
        title: 'Docker & Air-Gapped Setup',
        slug: 'docker',
        href: '/docs/docker',
        description: 'Secure, isolated production deployment guidelines.',
      },
      {
        title: 'Dual-Engine Architecture',
        slug: 'architecture',
        href: '/docs/architecture',
        description: 'Deep dive into go-mysql workhorse and mysqlbinlog oracle verification.',
      },
    ],
  },
];
