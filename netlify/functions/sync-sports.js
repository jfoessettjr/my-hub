import { neon } from '@neondatabase/serverless';

const MSU_TEAM_ID = '127';
const CURRENT_SEASON = '2026';

const SPORT_CONFIGS = {
  football: { sportPath: 'football/college-football' },
  basketball: { sportPath: 'basketball/mens-college-basketball' },
  hockey: { sportPath: 'hockey/mens-college-hockey' }
};

export async function runSync() {
  const databaseUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('Database URL not configured.');

  const sql = neon(databaseUrl);
  const results = [];

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

      for (const group of competition.leaders || []) {
        for (const leaderObj of group.leaders || []) {
          if (leaderObj.team?.id === MSU_TEAM_ID) {
            await sql`
              INSERT INTO public.msu_game_leaders (sport, game_date, opponent, result, category, player_name, stat_line)
              VALUES (${key}, ${gameDate}, ${opponentName}, ${resultStr}, ${group.displayName || group.name}, ${leaderObj.athlete?.displayName || 'Unknown'}, ${leaderObj.displayValue || ''})
              ON CONFLICT (sport, game_date, category, player_name) 
              DO UPDATE SET stat_line = EXCLUDED.stat_line;
            `;
          }
        }
      }
      results.push({ sport: key, status: 'Synced', lastGame: opponentName });
    }
  }
  return results;
}

export default async () => {
  try {
    const results = await runSync();
    return new Response(JSON.stringify({ success: true, results }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500 });
  }
};

export const config = {
  schedule: "0 */6 * * *"
};