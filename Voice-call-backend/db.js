const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required. Add your Supabase Postgres connection string in Render.');
}

const pool = new Pool({
  connectionString,
  ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
});

function toPostgresSql(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

async function runAsync(sql, params = []) {
  const result = await pool.query(toPostgresSql(sql), params);
  return {
    lastID: result.rows && result.rows[0] ? result.rows[0].id : undefined,
    rowCount: result.rowCount,
    rows: result.rows,
  };
}

async function allAsync(sql, params = []) {
  const result = await pool.query(toPostgresSql(sql), params);
  return result.rows;
}

async function getAsync(sql, params = []) {
  const result = await pool.query(toPostgresSql(sql), params);
  return result.rows[0];
}

async function init() {
  await pool.query('select 1');
  console.log('Supabase Postgres connection OK');
}

module.exports = {
  pool,
  init,
  runAsync,
  allAsync,
  getAsync,
};
