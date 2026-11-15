import { browserDeps } from '../../shell/deps';
import { runImportSheet } from './cli';

process.exitCode = await runImportSheet(
  process.argv.slice(2),
  {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  },
  browserDeps(),
);
