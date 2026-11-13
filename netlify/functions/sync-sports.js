import { neon } from '@neondatabase/serverless';

const MSU_TEAM_ID = '127';
const CURRENT_SEASON = '2026';

const SPORT_CONFIGS = {
  football: { sportPath: 'football/college-football' },
  basketball: { sportPath: 'basketball/mens-college-basketball' },
  hockey: { sportPath: 'hockey/mens-college-hockey' }
};

export default async (req) => {
  const databaseUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
  if (!databaseUrl) {
    return new Response(JSON.stringify({ 
      success: false, 
      error: 'CRITICAL: No database connection string found in NETLIFY_DATABASE_URL or DATABASE_URL.' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const sql = neon(databaseUrl);
  const results = [];

  try {
    // 1. Auto-create tables in the public schema to prevent relation errors
    await sql`
      CREATE TABLE IF NOT EXISTS public.msu_team_stats (
          id SERIAL PRIMARY KEY,
          sport VARCHAR(20) NOT NULL,
          season VARCHAR(10) DEFAULT '2026-27',
          record VARCHAR(20),
          conference_standing VARCHAR(50),
          stats_json JSONB NOT NULL,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS public.msu_game_leaders (
          id SERIAL PRIMARY KEY,
          sport VARCHAR(20) NOT NULL,
          game_date DATE NOT NULL,
          opponent VARCHAR(100) NOT NULL,
          result VARCHAR(20),
          category VARCHAR(50) NOT NULL,
          player_name VARCHAR(100) NOT NULL,
          stat_line VARCHAR(150) NOT NULL,
          UNIQUE (sport, game_date, category, player_name)
      );
    `;

    // 2. Fetch schedule data from ESPN for each sport
    for (const [key, config] of Object.entries(SPORT_CONFIGS)) {
      const url = `https://site.api.espn.com/apis/site/v2/sports/${config.sportPath}/teams/${MSU_TEAM_ID}/schedule?season=${CURRENT_SEASON}`;
      const response = await fetch(url);
      
      if (!response.ok) continue;

      const data = await response.json();
      const events = data.events || [];
      
      const completedEvents = events.filter(e => e.competitions?.[0]?.status?.type?.completed);
      completedEvents.sort((a, b) => new Date(b.date) - new Date(a.date));
      
      if (completedEvents.length > 0) {
        const lastGame = completedEvents[0];
        const competition = lastGame.competitions[0];
        const gameDate = lastGame.date.split('T')[0];
        
        const msuCompetitor = competition.competitors.find(c => c.id === MSU_TEAM_ID);
        const oppCompetitor = competition.competitors.find(c => c.id !== MSU_TEAM_ID);
        
        const msuScore = parseInt(msuCompetitor?.score?.value || '0', 10);
        const oppScore = parseInt(oppCompetitor?.score?.value || '0', 10);
        const isWin = msuScore > oppScore;
        const resultStr = `${isWin ? 'W' : 'L'} ${msuScore}-${oppScore}`;
        const opponentName = oppCompetitor?.team?.displayName || 'Opponent';
        const recordSummary = msuCompetitor?.records?.[0]?.summary || '--';
        
        await sql`
          INSERT INTO public.msu_team_stats (sport, season, record, conference_standing, stats_json, updated_at)
          VALUES (
            ${key}, 
            ${CURRENT_SEASON}, 
            ${recordSummary}, 
            ${'Big Ten'}, 
            ${JSON.stringify({ "Last Updated": new Date().toLocaleString(), "Recent Result": resultStr, "Opponent": opponentName })}::jsonb,
            NOW()
          )
        `;

        const leaders = competition.leaders || [];
        for (const group of leaders) {
          const categoryName = group.displayName || group.name;
          for (const leaderObj of group.leaders || []) {
            const athleteTeamId = leaderObj.team?.id;
            
            if (athleteTeamId === MSU_TEAM_ID) {
              const playerName = leaderObj.athlete?.displayName || 'Unknown Player';
              const statValue = leaderObj.displayValue || '';
              const statLabel = leaderObj.statDisplayName || categoryName;

              await sql`
                INSERT INTO public.msu_game_leaders (sport, game_date, opponent, result, category, player_name, stat_line)
                VALUES (${key}, ${gameDate}, ${opponentName}, ${resultStr}, ${statLabel}, ${playerName}, ${statValue})
                ON CONFLICT (sport, game_date, category, player_name) 
                DO UPDATE SET stat_line = EXCLUDED.stat_line;
              `;
            }
          }
        }
        results.push({ sport: key, status: 'Synced current season', lastGame: opponentName });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('ESPN Sync Error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const config = {
  schedule: "0 */6 * * *"
};