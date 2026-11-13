let allVaultItems = [];
let activeCategory = 'all';

const CATEGORY_CONFIG = {
  vinyl: {
    creatorLabel: 'Artist / Band',
    fields: [
      { key: 'format', label: 'Format / RPM', placeholder: 'e.g., 12" LP, 33 RPM' },
      { key: 'pressing', label: 'Color / Pressing', placeholder: 'e.g., 180g Black, Translucent Blue' }
    ]
  },
  book: {
    creatorLabel: 'Author',
    fields: [
      { key: 'isbn', label: 'ISBN', placeholder: '978-...' },
      { key: 'binding', label: 'Format / Edition', placeholder: 'Hardcover, 1st Edition' }
    ]
  },
  video_game: {
    creatorLabel: 'Developer / Publisher',
    fields: [
      { key: 'platform', label: 'Platform / Console', placeholder: 'e.g., PS5, Nintendo Switch, SNES' },
      { key: 'completeness', label: 'Completeness', placeholder: 'CIB (Complete in Box), Loose, Sealed' }
    ]
  },
  sports_card: {
    creatorLabel: 'Player / Subject',
    fields: [
      { key: 'sport_league', label: 'Sport / League', placeholder: 'e.g., NFL, NHL, PGA, NASCAR' },
      { key: 'set_info', label: 'Set & Card #', placeholder: 'e.g., Upper Deck Young Guns #201' },
      { key: 'parallel', label: 'Parallel / Serial #', placeholder: 'e.g., Silver Prizm /99' }
    ]
  }
};

function toggleAddForm() {
  const card = document.getElementById('add-item-card');
  card.style.display = card.style.display === 'none' ? 'block' : 'none';
  if (card.style.display === 'block') renderCategoryFields();
}

function renderCategoryFields() {
  const cat = document.getElementById('item-category').value;
  const cfg = CATEGORY_CONFIG[cat];
  document.getElementById('creator-label').textContent = cfg.creatorLabel;

  const container = document.getElementById('dynamic-fields');
  container.innerHTML = cfg.fields.map(f => `
    <div>
      <label>${f.label}</label>
      <input type="text" data-attr-key="${f.key}" placeholder="${f.placeholder}" />
    </div>
  `).join('');
}

async function initVault() {
  const res = await fetch('/.netlify/functions/catalog-api');
  allVaultItems = await res.json();
  renderVaultList();
}

function filterVault(category, btnEl) {
  activeCategory = category;
  document.querySelectorAll('#filter-tabs button').forEach(b => b.classList.remove('active'));
  btnEl.classList.add('active');
  renderVaultList();
}

function renderVaultList() {
  const query = (document.getElementById('vault-search')?.value || '').toLowerCase();
  const filtered = allVaultItems.filter(item => {
    const matchesCat = activeCategory === 'all' || item.category === activeCategory;
    const matchesText = !query ||
      item.title.toLowerCase().includes(query) ||
      (item.creator_or_subject || '').toLowerCase().includes(query) ||
      JSON.stringify(item.attributes_json || {}).toLowerCase().includes(query);
    return matchesCat && matchesText;
  });

  // Update summary bar
  const totalCost = filtered.reduce((sum, i) => sum + Number(i.purchase_price || 0), 0);
  const totalVal = filtered.reduce((sum, i) => sum + Number(i.estimated_value || 0), 0);
  document.getElementById('vault-count').textContent = filtered.length;
  document.getElementById('vault-cost').textContent = `$${totalCost.toFixed(2)}`;
  document.getElementById('vault-val').textContent = `$${totalVal.toFixed(2)}`;

  const grid = document.getElementById('vault-grid');
  if (filtered.length === 0) {
    grid.innerHTML = `<div class="card"><p class="muted">No items match this filter yet. Click "+ Add New Item" to start your catalog.</p></div>`;
    return;
  }

  const badges = { vinyl: 'Vinyl', book: 'Book', video_game: 'Video Game', sports_card: 'Sports Card' };

  grid.innerHTML = filtered.map(item => {
    const attrs = Object.entries(item.attributes_json || {})
      .filter(([, v]) => v)
      .map(([k, v]) => `<span class="muted" style="display:block; font-size:0.82rem;"><strong>${k.replace('_', ' ')}:</strong> ${v}</span>`)
      .join('');

    return `
      <div class="card" style="display:flex; flex-direction:column; justify-content:space-between;">
        <div>
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span class="badge">${badges[item.category] || item.category}</span>
            <button class="danger" onclick="deleteVaultItem(${item.id})">Delete</button>
          </div>
          <h3 style="margin-top:0.6rem;">${item.title}</h3>
          <p class="muted">${item.creator_or_subject || ''} ${item.release_year ? `(${item.release_year})` : ''}</p>
          ${item.condition_grade ? `<p style="margin-top:0.4rem; font-size:0.85rem;">Condition: <strong>${item.condition_grade}</strong></p>` : ''}
          <div style="margin-top:0.5rem;">${attrs}</div>
          ${item.notes ? `<p class="muted" style="margin-top:0.5rem; font-style:italic;">"${item.notes}"</p>` : ''}
        </div>
        <div style="margin-top:1rem; padding-top:0.75rem; border-top:1px solid var(--border); display:flex; justify-content:space-between; font-size:0.85rem;">
          <span>Paid: <strong>$${Number(item.purchase_price || 0).toFixed(2)}</strong></span>
          <span style="color:var(--accent);">Value: <strong>$${Number(item.estimated_value || 0).toFixed(2)}</strong></span>
        </div>
      </div>
    `;
  }).join('');
}

async function submitCatalogItem(e) {
  e.preventDefault();

  const attributes_json = {};
  document.querySelectorAll('#dynamic-fields input').forEach(inp => {
    if (inp.value.trim()) attributes_json[inp.dataset.attrKey] = inp.value.trim();
  });

  const payload = {
    category: document.getElementById('item-category').value,
    title: document.getElementById('item-title').value,
    creator_or_subject: document.getElementById('item-creator').value,
    release_year: document.getElementById('item-year').value,
    condition_grade: document.getElementById('item-condition').value,
    purchase_price: document.getElementById('item-cost').value,
    estimated_value: document.getElementById('item-value').value,
    notes: document.getElementById('item-notes').value,
    attributes_json
  };

  const res = await fetch('/.netlify/functions/catalog-api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (res.ok) {
    document.getElementById('catalog-form').reset();
    toggleAddForm();
    await initVault();
  } else {
    alert('Failed to save item. Check your database connection.');
  }
}

async function deleteVaultItem(id) {
  if (!confirm('Remove this item from your vault?')) return;
  const res = await fetch(`/.netlify/functions/catalog-api?id=${id}`, { method: 'DELETE' });
  if (res.ok) await initVault();
}