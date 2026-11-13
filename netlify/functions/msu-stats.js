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

    const teamRows = await sql`
      SELECT record, conference_standing, stats_json, updated_at 
      FROM public.msu_team_stats 
      WHERE LOWER(sport) = LOWER(${sport}) 
      ORDER BY updated_at DESC 
      LIMIT 1;
    `;

    const gamesRows = await sql`
      SELECT DISTINCT TO_CHAR(game_date, 'YYYY-MM-DD') AS game_date, opponent, result 
      FROM public.msu_game_leaders 
      WHERE LOWER(sport) = LOWER(${sport}) 
      ORDER BY game_date DESC;
    `;

    const leaderRows = await sql`
      SELECT opponent, result, category, player_name, stat_line, TO_CHAR(game_date, 'YYYY-MM-DD') AS game_date 
      FROM public.msu_game_leaders 
      WHERE LOWER(sport) = LOWER(${sport}) 
      ORDER BY game_date DESC;
    `;

    let team = teamRows[0] || null;
    if (team) {
      const sj = team.stats_json || {};
      team.opponent = sj.opponent || sj.Opponent || leaderRows[0]?.opponent || 'N/A';
      team.result = sj.result || sj['Recent Result'] || leaderRows[0]?.result || 'N/A';
    }

    return new Response(JSON.stringify({
      team,
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