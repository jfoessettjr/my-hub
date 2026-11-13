import { neon } from '@neondatabase/serverless';

export const handler = async (event) => {
  const sql = neon(process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL);

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS public.collectibles (
        id SERIAL PRIMARY KEY,
        category VARCHAR(30) NOT NULL,
        title VARCHAR(200) NOT NULL,
        creator_or_subject VARCHAR(150),
        release_year INT,
        condition_grade VARCHAR(50),
        purchase_price DECIMAL(10, 2) DEFAULT 0,
        estimated_value DECIMAL(10, 2) DEFAULT 0,
        attributes_json JSONB DEFAULT '{}'::jsonb,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // GET: Fetch all items (optionally filtered by ?category=...)
    if (event.httpMethod === 'GET') {
      const category = event.queryStringParameters?.category;
      const items = category && category !== 'all'
        ? await sql`SELECT * FROM public.collectibles WHERE category = ${category} ORDER BY created_at DESC`
        : await sql`SELECT * FROM public.collectibles ORDER BY created_at DESC`;

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(items)
      };
    }

    // POST: Add a new collectible item
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const {
        category,
        title,
        creator_or_subject,
        release_year,
        condition_grade,
        purchase_price,
        estimated_value,
        attributes_json,
        notes
      } = body;

      if (!category || !title) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Category and Title are required' }) };
      }

      const inserted = await sql`
        INSERT INTO public.collectibles (
          category, title, creator_or_subject, release_year, condition_grade,
          purchase_price, estimated_value, attributes_json, notes
        )
        VALUES (
          ${category},
          ${title},
          ${creator_or_subject || ''},
          ${release_year ? parseInt(release_year, 10) : null},
          ${condition_grade || ''},
          ${purchase_price ? parseFloat(purchase_price) : 0},
          ${estimated_value ? parseFloat(estimated_value) : 0},
          ${JSON.stringify(attributes_json || {})}::jsonb,
          ${notes || ''}
        )
        RETURNING *;
      `;

      return {
        statusCode: 201,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inserted[0])
      };
    }

    // DELETE: Remove an item by ?id=123
    if (event.httpMethod === 'DELETE') {
      const id = event.queryStringParameters?.id;
      if (!id) return { statusCode: 400, body: JSON.stringify({ error: 'Missing id' }) };

      await sql`DELETE FROM public.collectibles WHERE id = ${parseInt(id, 10)}`;
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deleted: true })
      };
    }

    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};