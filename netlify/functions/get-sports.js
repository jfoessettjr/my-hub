import { neon } from '@neondatabase/serverless';

export const handler = async () => {
  const sql = neon(process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL);

  try {
    const msu = await sql`SELECT * FROM public.msu_sports ORDER BY sport ASC`.catch(() => []);
    const tours = await sql`SELECT * FROM public.tour_events ORDER BY tour ASC`.catch(() => []);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msu, tours })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};