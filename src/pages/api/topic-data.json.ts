import type { APIRoute } from 'astro';
import { handleTopicDataApiRequest } from '../../lib/topic-data/runtime-handler.ts';

export const GET: APIRoute = async ({ request }) => {
  return handleTopicDataApiRequest(request);
};
