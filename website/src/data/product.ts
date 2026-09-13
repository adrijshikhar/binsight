export interface NavLink {
  label: string;
  href: string;
}

export interface Feature {
  title: string;
  tagline: string;
  description: string;
  icon: string;
}

export interface InstallOption {
  id: string;
  label: string;
  command: string;
  description: string;
}

export interface CompatMatrixItem {
  name: string;
  versions: string[];
  status: 'tested' | 'supported';
}

export const SITE_CONFIG = {
  name: 'Binsight',
  title: "Binsight — See what's really happening inside your binlogs",
  description: 'A local, read-only visual explorer for MySQL and MariaDB binary logs. Inspect transactions, understand row changes, catch anomalies, and trace schema changes without digging through raw mysqlbinlog output.',
  url: 'https://binsight.adrijshikhar.dev',
  repoUrl: 'https://github.com/adrijshikhar/binsight',
  author: 'Adrij Shikhar',
  authorUrl: 'https://adrijshikhar.dev',
  version: '0.2.1',
  license: 'MIT',
  defaultPort: 8080,
  defaultBind: '127.0.0.1',
  startCommand: 'binsight serve /path/to/binlogs',
  heroCommand: 'brew install adrijshikhar/tap/binsight',
  starsCount: 1,
  forksCount: 1,
};

export const NAV_LINKS: NavLink[] = [
  { label: 'Features', href: '#features' },
  { label: 'Diff Spotlight', href: '#diff' },
  { label: 'Benchmarks', href: '#benchmarks' },
  { label: 'Architecture', href: '#architecture' },
  { label: 'Install', href: '#install' },
  { label: 'Docs', href: '#install' },
];

export const INSTALL_OPTIONS: InstallOption[] = [
  {
    id: 'brew',
    label: 'Homebrew',
    command: 'brew install adrijshikhar/tap/binsight',
    description: 'Official Homebrew tap for macOS and Linux.',
  },
  {
    id: 'script',
    label: 'Install Script',
    command: 'curl -fsSL https://raw.githubusercontent.com/adrijshikhar/binsight/main/install.sh | sh',
    description: 'Automatic architecture detection, checksum verification, zero sudo.',
  },
  {
    id: 'docker',
    label: 'Docker',
    command: 'docker run --rm -p 8080:8080 -v /path/to/binlogs:/data ghcr.io/adrijshikhar/binsight:0.2.1 serve /data',
    description: 'Multi-arch Docker image from GitHub Container Registry.',
  },
  {
    id: 'go',
    label: 'go install',
    command: 'go install github.com/adrijshikhar/binsight/cmd/binsight@v0.2.1',
    description: 'Compile directly with zero CGO dependencies.',
  },
];

export const FEATURES: Feature[] = [
  {
    title: 'Filterable Event Stream',
    tagline: 'Virtualised event table',
    description: 'Filter events by database, table, or event type. Group events logically by transaction boundary and jump directly to any byte position.',
    icon: 'stream',
  },
  {
    title: 'Row-Level Image Diffs',
    tagline: 'Before → after values',
    description: 'Inspect exact before and after row states on UPDATE statements and full row payloads on INSERT and DELETE operations directly in the drawer.',
    icon: 'rows',
  },
  {
    title: 'Six Anomaly Detectors',
    tagline: 'Catch runaway writes',
    description: 'Inline warnings for huge transaction byte size, runaway row counts, long durations, rollbacks, bulk row writes, and DDL schema churn.',
    icon: 'alert',
  },
  {
    title: 'Schema & DDL Timeline',
    tagline: 'Trace table mutations',
    description: 'All DDL statements organized chronologically with cascade-risk indicators to uncover what broke queries or replication.',
    icon: 'schema',
  },
  {
    title: 'Hex Forensics',
    tagline: 'Down to the bytes',
    description: 'Inspect raw byte buffers with event-header overlays and field offsets for deep low-level forensics and corruption triage.',
    icon: 'hex',
  },
  {
    title: 'Live Tail & Remote Mirroring',
    tagline: 'Real-time SSE push',
    description: 'Watch local binlogs append in real-time via fsnotify + SSE, or connect as a live replica to mirror remote server logs into a local spool.',
    icon: 'tail',
  },
];

export const COMPATIBILITY: CompatMatrixItem[] = [
  {
    name: 'MySQL',
    versions: ['5.5', '5.6', '5.7', '8.0', '8.4 LTS'],
    status: 'tested',
  },
  {
    name: 'MariaDB',
    versions: ['10.6', '11.4'],
    status: 'tested',
  },
  {
    name: 'Architectures',
    versions: ['macOS (arm64, amd64)', 'Linux (amd64, arm64)'],
    status: 'supported',
  },
  {
    name: '> 4 GiB Files',
    versions: ['Monotonic 64-bit position accumulator immune to 32-bit wrap'],
    status: 'supported',
  },
];
