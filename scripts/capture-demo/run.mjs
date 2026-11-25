// Runs the demo capture by hand: `npm run capture-demo`.
// Options:
//   --dry-run    Show the plan and send no request.
//   --overwrite  Replace an existing snapshot (refused otherwise).
//
// Without a token GitHub allows 60 lookups an hour, so a capture takes two runs. The first run
// saves its progress in scripts/capture-demo/capture-progress.json and pauses when the lookups run
// out. Run the same command again after the reset time it prints. The progress file is deleted
// once the snapshot is written.
//
// Set a GitHub token in your own shell first, for example in PowerShell:
//   $env:GITHUB_TOKEN = "<your token>"
// The token is read from the environment only. It is never printed or written to a file.
//
// The capture code is TypeScript that imports the app's schemas and adapters, so it is
// loaded through Vite (already a dev dependency). No extra package is needed.
import { readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../../', import.meta.url));
const snapshotPath = new URL('../../src/data/demo/graveyard.snapshot.json', import.meta.url);
const curatedPath = new URL('../../src/data/demo/curated-list.json', import.meta.url);
// Progress of an unfinished capture (stripped responses only). Ignored by Git.
const progressPath = new URL('./capture-progress.json', import.meta.url);

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const overwrite = args.has('--overwrite');

const rawToken = process.env.GITHUB_TOKEN;
const token = rawToken !== undefined && rawToken.trim() !== '' ? rawToken.trim() : null;

async function exists(url) {
  try {
    await stat(url);
    return true;
  } catch {
    return false;
  }
}

const server = await createServer({
  root,
  configFile: false,
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
});

let exitCode = 0;
try {
  const capture = await server.ssrLoadModule('/scripts/capture-demo/capture.ts');
  const limits = await server.ssrLoadModule('/src/data/demo/snapshot-schema.ts');
  const curated = JSON.parse(readFileSync(curatedPath, 'utf8'));

  const estimate = capture.estimateMaxRequests(curated);
  console.log(`Curated repositories: ${curated.repositories.length}`);
  console.log(`Planned maximum requests: ${estimate}`);
  console.log(`Token: ${token === null ? 'not set (60 lookups an hour)' : 'set (value not shown)'}`);

  if (dryRun) {
    console.log('Dry run: no request was sent and nothing was written.');
  } else {
    if ((await exists(snapshotPath)) && !overwrite) {
      throw new capture.CaptureError(
        'A snapshot already exists. Run again with --overwrite only if you mean to replace it.',
      );
    }
    const savedText = (await exists(progressPath)) ? await readFile(progressPath, 'utf8') : null;
    const checkpoint = {
      data: savedText === null ? null : capture.parseCheckpoint(savedText),
      async save(progress) {
        const temporaryProgress = new URL('./capture-progress.json.tmp', import.meta.url);
        await writeFile(temporaryProgress, `${JSON.stringify(progress)}\n`, 'utf8');
        await rename(temporaryProgress, progressPath);
      },
    };
    const result = await capture.captureDemoSnapshot({
      fetchImpl: fetch,
      checkpoint,
      token,
      curated,
      now: () => new Date(),
      log: (message) => console.log(message),
    });

    const text = `${JSON.stringify(result.snapshot, null, 1)}\n`;
    capture.assertSafeToStore(text, token);
    const temporary = new URL('../../src/data/demo/graveyard.snapshot.json.tmp', import.meta.url);
    await writeFile(temporary, text, 'utf8');
    await rename(temporary, snapshotPath);
    if (await exists(progressPath)) await unlink(progressPath);

    const bytes = Buffer.byteLength(text, 'utf8');
    console.log(`Snapshot written: ${bytes} bytes (${(bytes / 1000).toFixed(1)} KB).`);
    console.log(
      bytes <= limits.SNAPSHOT_BUNDLE_LIMIT_BYTES
        ? 'Delivery (D24): 300 KB or smaller, so the snapshot can be bundled.'
        : 'Delivery (D24): larger than 300 KB, so move it to public/demo/.',
    );
    console.log(`Requests used: ${result.requestsUsed}. Lookups left: ${result.remainingAfter ?? 'unknown'}.`);
  }
} catch (error) {
  exitCode = 1;
  if (error instanceof Error && error.name === 'CaptureError') {
    console.error(`Capture stopped: ${error.message}`);
  } else {
    // Other errors are not printed in full, in case they carry request details.
    console.error('Capture stopped because of an unexpected error. Run the tests to check the script.');
  }
} finally {
  await server.close();
}
process.exit(exitCode);
