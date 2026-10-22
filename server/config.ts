// Hub paths and modes. Everything comes from environment variables so that tests and the demo can substitute folders.
import { join, resolve } from 'node:path';

export const ROOT = resolve(import.meta.dirname, '..');

export type MentorMode = 'live' | 'record' | 'replay';
export type Config = {
  root: string;
  dataDir: string;        // progress, logs, temporary files
  fixturesDir: string;    // recorded agent answers for replay
  promptsDir: string;
  webDir: string;
  port: number;
  mentorMode: MentorMode; // live: call the CLI; record: call and write a recording; replay: recordings only
  demo: boolean;          // demo = replay + a separate data folder, real progress is not touched
  lang: 'ru' | 'en';
};

export function makeConfig(over: Partial<Config> = {}): Config {
  const env = process.env;
  const demo = over.demo ?? env.STUDY_HUB_DEMO === '1';
  const dataDir = over.dataDir ?? (env.STUDY_HUB_DATA ? resolve(env.STUDY_HUB_DATA) : join(ROOT, demo ? 'data-demo' : 'data'));
  const mode = (env.MENTOR_MODE as MentorMode) || 'live';
  return {
    root: ROOT,
    dataDir,
    fixturesDir: over.fixturesDir ?? join(ROOT, 'fixtures'),
    promptsDir: join(ROOT, 'prompts'),
    webDir: join(ROOT, 'dist', 'web'),
    port: over.port ?? Number(env.STUDY_HUB_PORT ?? 4317),
    mentorMode: over.mentorMode ?? (demo ? 'replay' : mode),
    demo,
    lang: over.lang ?? (env.STUDY_HUB_LANG === 'ru' ? 'ru' : 'en'),
  };
}
