import { createFileRoute } from '@tanstack/react-router';
import { redis } from '~/lib/redis';

export const Route = createFileRoute('/api/chat/stream')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const restorationId = url.searchParams.get('id');

        if (!restorationId) {
          return new Response('Missing restoration ID', { status: 400 });
        }

        // Number of text characters the client already has (from DB on reconnect).
        // Backlog entries are skipped until this many chars have been accounted for.
        const skip = parseInt(url.searchParams.get('skip') || '0') || 0;

        // Dedicated connection for blocking XREAD, won't starve the shared client.
        const reader = redis.duplicate();
        const encoder = new TextEncoder();
        let aborted = false;

        const formatSse = (data: unknown, event?: string) => {
          const prefix = event ? `event: ${event}\n` : '';
          return encoder.encode(`${prefix}data: ${JSON.stringify(data)}\n\n`);
        };

        const parseFields = (fields: string[]): Record<string, string> => {
          const f: Record<string, string> = {};
          for (let i = 0; i < fields.length; i += 2) {
            f[fields[i]] = fields[i + 1];
          }
          return f;
        };

        const stream = new ReadableStream({
          start(controller) {
            let closed = false;

            const close = () => {
              if (closed) return;
              closed = true;
              reader.disconnect();
              try { controller.close(); } catch {}
            };

            const processEntry = (f: Record<string, string>): 'done' | 'error' | void => {
              if (f.type === 'done') {
                controller.enqueue(formatSse({ status: 'done' }, 'done'));
                close();
                return 'done';
              }
              if (f.type === 'error') {
                controller.enqueue(formatSse({ status: 'error', message: f.data || undefined }, 'fatal'));
                close();
                return 'error';
              }
              if (f.type === 'search') {
                try {
                  const parsed = JSON.parse(f.data);
                  controller.enqueue(formatSse(parsed));
                } catch {}
                return;
              }
              // Reasoning events (thinking traces)
              if (f.type === 'reasoning-start') {
                controller.enqueue(formatSse({ _reasoning: 'start' }));
                return;
              }
              if (f.type === 'reasoning') {
                controller.enqueue(formatSse({ _reasoning: 'delta', text: f.data }));
                return;
              }
              if (f.type === 'reasoning-end') {
                controller.enqueue(formatSse({ _reasoning: 'end' }));
                return;
              }
              // Plain text chunk
              controller.enqueue(formatSse({ text: f.data }));
            };

            // Two-phase read: XRANGE (backlog, non-blocking) then XREAD BLOCK (live).
            // Uses Redis Streams so data is persisted, the client can connect at any
            // time and catch up without missing chunks, regardless of model speed.
            (async () => {
              try {
                let lastId = '0';

                // ── Phase 1: Replay backlog ──────────────────────────────────
                // XRANGE is non-blocking: returns instantly with whatever exists.
                const backlog = await redis.xrange(restorationId, '-', '+') as [string, string[]][];
                let charsSkipped = 0;

                for (const [id, fields] of backlog) {
                  if (closed) return;
                  lastId = id;
                  const f = parseFields(fields);

                  // Always check for terminal entries, even when skipping
                  if (f.type === 'done' || f.type === 'error') {
                    processEntry(f);
                    return;
                  }

                  // On reconnect, skip entries the client already has from the DB
                  if (skip > 0 && charsSkipped < skip) {
                    if (f.type === 'text') charsSkipped += f.data.length;
                    continue;
                  }

                  processEntry(f);
                }

                // ── Phase 2: Live tail ───────────────────────────────────────
                // XREAD BLOCK returns as soon as new entries appear after lastId.
                while (!closed && !aborted) {
                  const results = await (reader as any).xread(
                    'BLOCK', 30000, 'COUNT', 100,
                    'STREAMS', restorationId, lastId,
                  ) as [string, [string, string[]][]][] | null;

                  if (!results || closed || aborted) continue;

                  for (const [, entries] of results) {
                    for (const [id, fields] of entries) {
                      if (closed) return;
                      lastId = id;
                      const result = processEntry(parseFields(fields));
                      if (result) return; // 'done' or 'error'
                    }
                  }
                }
              } catch (err) {
                if (!closed && !aborted) {
                  console.error('Stream error:', err);
                }
              } finally {
                close();
              }
            })();

            request.signal.addEventListener('abort', () => {
              aborted = true;
              close();
            });
          },
          cancel() {
            aborted = true;
            reader.disconnect();
          },
        });

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        });
      },
    },
  },
});
