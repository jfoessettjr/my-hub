import { neon } from '@neondatabase/serverless';

export default async (req) => {
  const url = new URL(req.url);
  const sport = url.searchParams.get('sport') || 'football';
  const validSports = ['football', 'basketball', 'hockey'];

  if (!validSports.includes(sport)) {
    return new Response(JSON.stringify({ error: 'Invalid or missing sport parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    const sql = neon(dbUrl);

    // 1. Fetch latest team stats for the requested sport
    const teamRows = await sql`
      SELECT record, conference_standing, stats_json, updated_at 
      FROM public.msu_team_stats 
      WHERE LOWER(sport) = LOWER(${sport}) 
      ORDER BY updated_at DESC 
      LIMIT 1;
    `;

    // 2. Fetch unique games list for the dropdown
    const gamesRows = await sql`
      SELECT DISTINCT game_date, opponent, result 
      FROM public.msu_game_leaders 
      WHERE LOWER(sport) = LOWER(${sport}) 
      ORDER BY game_date DESC;
    `;

    // 3. Fetch all game leaders for this sport
    const leaderRows = await sql`
      SELECT opponent, result, category, player_name, stat_line, game_date 
      FROM public.msu_game_leaders 
      WHERE LOWER(sport) = LOWER(${sport}) 
      ORDER BY game_date DESC;
    `;

    return new Response(JSON.stringify({
      team: teamRows[0] || null,
      games: gamesRows || [],
      leaders: leaderRows || []
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('MSU Stats API Error:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch MSU stats', details: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};