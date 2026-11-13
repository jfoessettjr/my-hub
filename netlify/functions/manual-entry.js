import { neon } from '@neondatabase/serverless';

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await req.json();
    const { sport, season, record, opponent, result, category, player_name, stat_line } = body;

    const sql = neon(process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL);
    const gameDate = body.game_date || new Date().toISOString().split('T')[0];

    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_msu_team_stats_sport_season 
      ON public.msu_team_stats (sport, season);
    `;
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_msu_game_leaders_unique 
      ON public.msu_game_leaders (sport, game_date, category, player_name);
    `;

    // Store both capitalized and lowercase keys so any front-end template finds them
    const statsPayload = {
      "Last Updated": new Date().toLocaleString(),
      "Recent Result": result || 'N/A',
      "Opponent": opponent || 'N/A',
      opponent: opponent || 'N/A',
      result: result || 'N/A',
      recent_result: result || 'N/A'
    };

    // 1. Upsert Team Stats record
    await sql`
      INSERT INTO public.msu_team_stats (sport, season, record, conference_standing, stats_json, updated_at)
      VALUES (
        ${sport}, 
        ${season},
        ${record}, 
        ${'Big Ten'}, 
        ${JSON.stringify(statsPayload)}::jsonb,
        NOW()
      )
      ON CONFLICT (sport, season) 
      DO UPDATE SET record = EXCLUDED.record, stats_json = EXCLUDED.stats_json, updated_at = NOW();
    `;

    // 2. Insert/update game leaders
    if (category && player_name) {
      await sql`
        INSERT INTO public.msu_game_leaders (sport, game_date, opponent, result, category, player_name, stat_line)
        VALUES (${sport}, ${gameDate}, ${opponent || 'Manual Opponent'}, ${result || 'N/A'}, ${category}, ${player_name}, ${stat_line || ''})
        ON CONFLICT (sport, game_date, category, player_name) 
        DO UPDATE SET stat_line = EXCLUDED.stat_line, result = EXCLUDED.result, opponent = EXCLUDED.opponent;
      `;
    }

    return new Response(JSON.stringify({ success: true, message: 'Saved successfully' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Manual Entry Error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};