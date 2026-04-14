import type { APIRoute } from 'astro';
import { db } from '../lib/db';
import { models, bentoPages } from '../lib/schema';
import { eq } from 'drizzle-orm';

export const GET: APIRoute = async () => {
  const siteUrl = import.meta.env.PUBLIC_SITE_URL ?? 'https://modelbento.com';

  const results = await db
    .select({
      provider: models.provider,
      name: models.name,
    })
    .from(models)
    .innerJoin(bentoPages, eq(bentoPages.modelId, models.id));

  const urls = results.map(
    (r) => `  <url><loc>${siteUrl}/m/${r.provider}/${r.name}</loc></url>`,
  );

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${siteUrl}/</loc></url>
  <url><loc>${siteUrl}/explore</loc></url>
${urls.join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml' },
  });
};
