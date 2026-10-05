// Read-only diagnostic. Run from the project root with a meeting ID you can access.
import { createRequire } from 'node:module';
import { createServer } from 'vite';
const meetingId = process.argv[2];
if (!meetingId || meetingId.includes('/') || meetingId.length > 128) {
  throw new Error('Usage: node scripts/measure-list-performance.mjs <meeting-id>');
}
const require = createRequire(import.meta.url);
require('@next/env').loadEnvConfig(process.cwd(), true);
const root = process.cwd().replaceAll('\\', '/');
const server = await createServer({
  configFile: false, root, logLevel: 'error', server: { middlewareMode: true }, appType: 'custom',
  resolve: { alias: { '@': root + '/src', 'server-only': root + '/node_modules/server-only/empty.js' } },
});
try {
  const repo = await server.ssrLoadModule('/src/lib/data-store/meetings.ts');
  const samples = [];
  for (let round = 1; round <= 3; round++) {
    const start = performance.now();
    const meeting = await repo.getMeetingById(meetingId);
    if (!meeting) throw new Error('Meeting not found.');
    const documentMs = Math.round(performance.now() - start);
    const listStart = performance.now();
    const year = new Date(meeting.dateTime.getTime() + 9 * 3600000).getUTCFullYear();
    const result = await repo.getMeetings({ userId: meeting.creatorId, userFriendGroupIds: [meeting.groupId],
      includeCreated: false, groupId: meeting.groupId, year, limitParam: 9 });
    samples.push({ round, documentMs, listMs: Math.round(performance.now() - listStart), rows: result.meetings.length });
  }
  console.log(JSON.stringify({ samples, documentWrites: 0 }));
} finally { await server.close(); }
