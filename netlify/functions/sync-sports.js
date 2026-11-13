import { neon } from '@neondatabase/serverless';

const MSU_TEAM_ID = '127';
const MSU_SPORTS = {
  football: 'football/college-football',
  basketball: 'basketball/mens-college-basketball',
  hockey: 'hockey/mens-college-hockey'
};

export default async () => {
  const sql = neon(process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL);
  const log = [];

  try {
    // 1. Ensure tables exist
    await sql`
      CREATE TABLE IF NOT EXISTS public.msu_sports (
        id SERIAL PRIMARY KEY,
        sport VARCHAR(20) UNIQUE NOT NULL,
        record VARCHAR(30),
        standing VARCHAR(60),
        last_game_opponent VARCHAR(100),
        last_game_result VARCHAR(40),
        last_game_date DATE,
        leaders_json JSONB,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS public.tour_events (
        id SERIAL PRIMARY KEY,
        tour VARCHAR(20) UNIQUE NOT NULL,
        event_name VARCHAR(150),
        venue VARCHAR(150),
        status VARCHAR(50),
        leaderboard_json JSONB,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // 2. Sync Michigan State Sports (Football, Basketball, Hockey)
    for (const [sportKey, sportPath] of Object.entries(MSU_SPORTS)) {
      const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${sportPath}/teams/${MSU_TEAM_ID}/schedule`);
      if (!res.ok) continue;

      const data = await res.json();
      const events = data.events || [];
      const completed = events
        .filter(e => e.competitions?.[0]?.status?.type?.completed)
        .sort((a, b) => new Date(b.date) - new Date(a.date));

      if (completed.length > 0) {
        const lastGame = completed[0];
        const comp = lastGame.competitions[0];
        const msu = comp.competitors.find(c => c.id === MSU_TEAM_ID);
        const opp = comp.competitors.find(c => c.id !== MSU_TEAM_ID);

        const msuScore = parseInt(msu?.score?.value || '0', 10);
        const oppScore = parseInt(opp?.score?.value || '0', 10);
        const resultStr = `${msuScore > oppScore ? 'W' : 'L'} ${msuScore}-${oppScore}`;
        const recordStr = msu?.records?.[0]?.summary || data.team?.recordSummary || '--';
        const standingStr = data.team?.standingSummary || 'Big Ten';

        // Extract MSU-specific game leaders
        const leaders = [];
        for (const group of comp.leaders || []) {
          for (const item of group.leaders || []) {
            if (item.team?.id === MSU_TEAM_ID || !item.team) {
              leaders.push({
                category: group.displayName || group.name,
                player: item.athlete?.displayName || 'Unknown',
                stat_line: item.displayValue || ''
              });
            }
          }
        }

        await sql`
          INSERT INTO public.msu_sports (sport, record, standing, last_game_opponent, last_game_result, last_game_date, leaders_json, updated_at)
          VALUES (${sportKey}, ${recordStr}, ${standingStr}, ${opp?.team?.displayName || 'Opponent'}, ${resultStr}, ${lastGame.date.split('T')[0]}, ${JSON.stringify(leaders)}::jsonb, NOW())
          ON CONFLICT (sport) DO UPDATE SET
            record = EXCLUDED.record,
            standing = EXCLUDED.standing,
            last_game_opponent = EXCLUDED.last_game_opponent,
            last_game_result = EXCLUDED.last_game_result,
            last_game_date = EXCLUDED.last_game_date,
            leaders_json = EXCLUDED.leaders_json,
            updated_at = NOW();
        `;
        log.push(`MSU ${sportKey} synced`);
      }
    }

    // 3. Sync NASCAR Cup Series
    const nascarRes = await fetch('https://site.api.espn.com/apis/site/v2/sports/racing/nascar-cup/scoreboard');
    if (nascarRes.ok) {
      const nascarData = await nascarRes.json();
      const event = nascarData.events?.[0];
      if (event) {
        const comp = event.competitions?.[0];
        const competitors = (comp?.competitors || []).slice(0, 15).map((c, idx) => ({
          pos: c.order || idx + 1,
          name: c.athlete?.displayName || 'Driver',
          car: c.vehicle?.number ? `#${c.vehicle.number} ${c.vehicle.manufacturer || ''}` : '',
          status: c.status?.type?.shortDetail || ''
        }));

        await sql`
          INSERT INTO public.tour_events (tour, event_name, venue, status, leaderboard_json, updated_at)
          VALUES ('nascar', ${event.name}, ${comp?.venue?.fullName || 'Track TBD'}, ${event.status?.type?.description || 'Scheduled'}, ${JSON.stringify(competitors)}::jsonb, NOW())
          ON CONFLICT (tour) DO UPDATE SET
            event_name = EXCLUDED.event_name,
            venue = EXCLUDED.venue,
            status = EXCLUDED.status,
            leaderboard_json = EXCLUDED.leaderboard_json,
            updated_at = NOW();
        `;
        log.push('NASCAR synced');
      }
    }

    // 4. Sync PGA Tour
    const pgaRes = await fetch('https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard');
    if (pgaRes.ok) {
      const pgaData = await pgaRes.json();
      const event = pgaData.events?.[0];
      if (event) {
        const comp = event.competitions?.[0];
        const golfers = (comp?.competitors || []).slice(0, 15).map((c, idx) => ({
          pos: c.status?.position?.displayName || `${idx + 1}`,
          name: c.athlete?.displayName || 'Golfer',
          score: c.score?.displayValue || 'E',
          thru: c.status?.thru ? `Thru ${c.status.thru}` : ''
        }));

        await sql`
          INSERT INTO public.tour_events (tour, event_name, venue, status, leaderboard_json, updated_at)
          VALUES ('pga', ${event.name}, ${comp?.venue?.fullName || 'Course TBD'}, ${event.status?.type?.description || 'Scheduled'}, ${JSON.stringify(golfers)}::jsonb, NOW())
          ON CONFLICT (tour) DO UPDATE SET
            event_name = EXCLUDED.event_name,
            venue = EXCLUDED.venue,
            status = EXCLUDED.status,
            leaderboard_json = EXCLUDED.leaderboard_json,
            updated_at = NOW();
        `;
        log.push('PGA synced');
      }
    }

    return new Response(JSON.stringify({ ok: true, synced: log }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const config = {
  schedule: '0 */6 * * *'
};