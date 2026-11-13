let cachedSportsData = null;

async function fetchSportsData() {
  if (cachedSportsData) return cachedSportsData;
  const res = await fetch('/.netlify/functions/get-sports');
  cachedSportsData = await res.json();
  return cachedSportsData;
}

async function triggerSportsSync() {
  const btn = document.getElementById('sync-now-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Syncing ESPN...';
  }
  
  try {
    const res = await fetch('/.netlify/functions/sync-sports');
    if (!res.ok) {
      throw new Error(`Server responded with status ${res.status}`);
    }
    const data = await res.json();
    
    if (data.success) {
      cachedSportsData = null;
      await loadHomeDashboard();
      alert('Sports data synced successfully!');
    } else {
      alert('Sync failed: ' + (data.error || 'Unknown error'));
    }
  } catch (err) {
    console.error('Sync error:', err);
    alert('Failed to connect to sync function: ' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Sync Sports Now';
    }
  }
}

async function loadHomeDashboard() {
  const data = await fetchSportsData();

  // Render MSU Summary Cards
  const msuGrid = document.getElementById('home-msu-grid');
  const sportLabels = { football: 'MSU Football', basketball: "MSU Men's Basketball", hockey: "MSU Men's Hockey" };

  if (data.msu && data.msu.length > 0) {
    msuGrid.innerHTML = data.msu.map(team => `
      <div class="card">
        <span class="badge">${team.standing || 'Big Ten'}</span>
        <h3 style="margin-top:0.5rem;">${sportLabels[team.sport] || team.sport}</h3>
        <p style="font-size:1.3rem; font-weight:700; margin:0.4rem 0;">${team.record || '--'}</p>
        <p class="muted">Last: vs. ${team.last_game_opponent} (${team.last_game_result})</p>
      </div>
    `).join('');
  } else {
    msuGrid.innerHTML = `<div class="card"><p class="muted">No MSU data synced yet. Click <strong>Sync Sports Now</strong> above.</p></div>`;
  }

  // Render NASCAR & PGA Cards
  const toursGrid = document.getElementById('home-tours-grid');
  if (data.tours && data.tours.length > 0) {
    toursGrid.innerHTML = data.tours.map(t => {
      const top3 = (t.leaderboard_json || []).slice(0, 3)
        .map(p => `<li><strong>${p.pos}.</strong> ${p.name} <span class="muted">${p.score || p.car || ''}</span></li>`)
        .join('');
      return `
        <div class="card">
          <span class="badge">${t.tour.toUpperCase()}</span>
          <h3 style="margin-top:0.5rem;">${t.event_name}</h3>
          <p class="muted">${t.venue} • ${t.status}</p>
          <ul style="margin-top:0.75rem; padding-left:1.25rem;">${top3 || '<li>Leaderboard pending</li>'}</ul>
        </div>
      `;
    }).join('');
  } else {
    toursGrid.innerHTML = `<div class="card"><p class="muted">No NASCAR/PGA data yet. Click <strong>Sync Sports Now</strong>.</p></div>`;
  }

  // Render Vault Summary Stats
  try {
    const vaultRes = await fetch('/.netlify/functions/catalog-api');
    const items = await vaultRes.json();
    const totalCost = items.reduce((sum, i) => sum + Number(i.purchase_price || 0), 0);
    const totalVal = items.reduce((sum, i) => sum + Number(i.estimated_value || 0), 0);

    document.getElementById('stat-total-items').textContent = items.length;
    document.getElementById('stat-invested').textContent = `$${totalCost.toFixed(2)}`;
    document.getElementById('stat-value').textContent = `$${totalVal.toFixed(2)}`;
  } catch (e) {
    console.error(e);
  }
}

async function initMsuPage() {
  await fetchSportsData();
  renderMsuSport('football');
}

function selectMsuSport(sport, btnEl) {
  document.querySelectorAll('.page-header button').forEach(b => b.classList.remove('active'));
  btnEl.classList.add('active');
  renderMsuSport(sport);
}

function renderMsuSport(sport) {
  const container = document.getElementById('msu-detail-container');
  const team = (cachedSportsData?.msu || []).find(t => t.sport === sport);

  if (!team) {
    container.innerHTML = `<p class="muted">No data found for ${sport}. Return to Dashboard and click "Sync Sports Now".</p>`;
    return;
  }

  const leadersHtml = (team.leaders_json || []).length
    ? team.leaders_json.map(l => `
        <div class="stat-box">
          <div class="muted">${l.category}</div>
          <div style="font-weight:700; font-size:1.1rem; margin:0.2rem 0;">${l.player}</div>
          <div style="color:var(--accent); font-weight:600;">${l.stat_line}</div>
        </div>
      `).join('')
    : '<p class="muted">No individual game leaders reported for this game.</p>';

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2>Michigan State ${sport.charAt(0).toUpperCase() + sport.slice(1)}</h2>
        <p class="muted">Record: <strong>${team.record}</strong> • ${team.standing}</p>
      </div>
      <span class="badge">Last: vs. ${team.last_game_opponent} (${team.last_game_result})</span>
    </div>
    <h3 style="margin-top:1rem; margin-bottom:0.75rem;">Game Leaders</h3>
    <div class="grid-3">${leadersHtml}</div>
  `;
}

async function loadTourPage(tourKey) {
  const data = await fetchSportsData();
  const container = document.getElementById('tour-detail-container');
  const tour = (data.tours || []).find(t => t.tour === tourKey);

  if (!tour) {
    container.innerHTML = `<p class="muted">No ${tourKey.toUpperCase()} data found yet. Click "Sync Sports Now" on the Dashboard.</p>`;
    return;
  }

  const rows = (tour.leaderboard_json || []).map(row => `
    <tr>
      <td><strong>${row.pos}</strong></td>
      <td>${row.name}</td>
      <td>${row.car || row.score || '--'}</td>
      <td class="muted">${row.status || row.thru || ''}</td>
    </tr>
  `).join('');

  container.innerHTML = `
    <span class="badge">${tour.status}</span>
    <h2 style="margin-top:0.5rem;">${tour.event_name}</h2>
    <p class="muted">${tour.venue}</p>
    <table>
      <thead>
        <tr>
          <th>Pos</th>
          <th>${tourKey === 'nascar' ? 'Driver' : 'Golfer'}</th>
          <th>${tourKey === 'nascar' ? 'Car' : 'Score'}</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="4">Leaderboard not available yet.</td></tr>'}</tbody>
    </table>
  `;
}