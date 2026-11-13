import { neon } from '@neondatabase/serverless';

export default async (req) => {
  const databaseUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
  if (!databaseUrl) {
    return new Response(JSON.stringify({ error: 'Database URL not configured' }), { status: 500 });
  }

  const sql = neon(databaseUrl);

  try {
    // Fetch records from public schema
    const msu = await sql`SELECT * FROM public.msu_team_stats ORDER BY sport ASC`.catch(() => []);
    const tours = await sql`SELECT * FROM public.tour_events ORDER BY tour ASC`.catch(() => []);

    return new Response(JSON.stringify({ msu, tours }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};