#!/usr/bin/env node

/**
 * Simple SQL migration runner.
 * Reads .sql files from the migrations directory in order,
 * tracks applied migrations in a _migrations table.
 *
 * Usage: node infra/migrations/run.js
 * Requires DATABASE_URL env var.
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname);

async function run() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  console.log('Connected to database');

  // Create migrations tracking table
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Get already applied migrations
  const { rows: applied } = await client.query(
    'SELECT name FROM _migrations ORDER BY name'
  );
  const appliedSet = new Set(applied.map((r) => r.name));

  // Read migration files
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let count = 0;
  for (const file of files) {
    if (appliedSet.has(file)) {
      console.log(`  SKIP: ${file} (already applied)`);
      continue;
    }

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
    console.log(`  APPLY: ${file}`);

    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      count++;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`  FAILED: ${file}`, err.message);
      process.exit(1);
    }
  }

  console.log(`Done. ${count} migration(s) applied.`);
  await client.end();
}

run().catch((err) => {
  console.error('Migration runner failed:', err);
  process.exit(1);
});
