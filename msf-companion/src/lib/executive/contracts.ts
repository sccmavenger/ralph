export type { BootstrapEnvelope, BootstrapPrepared } from './bootstrap';

export interface BootstrapInput {
  inputVersion: 1;
  owner: { displayName: string; contactEmail: string | null };
}

export interface BootstrapTarget {
  targetVersion: 1;
  environment: 'disposable';
  host: '127.0.0.1';
  port: 55432;
  database: string;
  role: 'exec_test_app';
  tls: 'disabled';
  runId: string;
}

export type BootstrapArguments = { help: true } | {
  help: false;
  mode: 'check' | 'apply';
  inputPath: string;
  sourcePath: string;
  targetPath: string;
  confirmTarget?: string;
};
