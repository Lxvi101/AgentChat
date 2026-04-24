import { createFileRoute } from '@tanstack/react-router';
import { redis } from '~/lib/redis';
import { getToken } from '~/lib/auth-server';

export const Route = createFileRoute('/api/chat/stop')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = await getToken();
        if (!token) return new Response("Unauthorized", { status: 401 });

        const { restorationId } = await request.json();

        if (restorationId) {
          // Broadcast a stop signal specific to this generation instance
          await redis.publish(`${restorationId}-stop`, 'STOP');
        }

        return Response.json({ success: true });
      },
    },
  },
});
