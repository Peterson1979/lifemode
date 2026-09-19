import { handleTopicDataApiRequest } from '../../src/lib/topic-data/runtime-handler.ts';

interface PagesContext {
  request: Request;
  env: Record<string, string | undefined>;
}

export async function onRequest(context: PagesContext): Promise<Response> {
  return handleTopicDataApiRequest(context.request, context.env);
}
