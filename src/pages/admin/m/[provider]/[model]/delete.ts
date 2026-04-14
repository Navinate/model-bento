import type { APIRoute } from 'astro';
import { deleteModel } from '../../../../../lib/services/admin';

export const POST: APIRoute = async ({ params, redirect }) => {
  const { provider, model } = params;
  if (!provider || !model) {
    return new Response(null, { status: 404 });
  }

  await deleteModel(provider, model);
  return redirect('/admin');
};
