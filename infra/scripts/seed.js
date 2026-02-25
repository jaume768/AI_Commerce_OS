#!/usr/bin/env node

/**
 * Seed script — creates a demo store, admin user, and membership.
 * Usage: node infra/scripts/seed.js
 * Requires DATABASE_URL env var.
 */

const { Pool } = require('pg');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/aicommerce';

const pool = new Pool({ connectionString: DATABASE_URL });

async function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check if already seeded
    const existing = await client.query("SELECT id FROM stores WHERE slug = 'demo-store'");
    if (existing.rows.length > 0) {
      console.log('Seed data already exists. Skipping.');
      await client.query('COMMIT');
      return;
    }

    const storeId = crypto.randomUUID();
    const adminId = crypto.randomUUID();
    const viewerId = crypto.randomUUID();

    // Create demo store
    await client.query(
      `INSERT INTO stores (id, name, slug, domain, platform, settings, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [storeId, 'Demo Store', 'demo-store', 'demo.myshopify.com', 'shopify', '{}', 'active'],
    );
    console.log(`Store created: ${storeId} (demo-store)`);

    // Create admin user
    const adminHash = await hashPassword('password123');
    await client.query(
      `INSERT INTO users (id, email, name, password_hash, status)
       VALUES ($1, $2, $3, $4, $5)`,
      [adminId, 'admin@example.com', 'Admin User', adminHash, 'active'],
    );
    console.log(`Admin user created: ${adminId} (admin@example.com / password123)`);

    // Create viewer user
    await client.query(
      `INSERT INTO users (id, email, name, password_hash, status)
       VALUES ($1, $2, $3, $4, $5)`,
      [viewerId, 'viewer@example.com', 'Viewer User', adminHash, 'active'],
    );
    console.log(`Viewer user created: ${viewerId} (viewer@example.com / password123)`);

    // Create memberships
    await client.query(
      `INSERT INTO memberships (store_id, user_id, role) VALUES ($1, $2, $3)`,
      [storeId, adminId, 'admin'],
    );
    await client.query(
      `INSERT INTO memberships (store_id, user_id, role) VALUES ($1, $2, $3)`,
      [storeId, viewerId, 'viewer'],
    );
    console.log('Memberships created (admin + viewer)');

    // Create a sample goal
    const goalId = crypto.randomUUID();
    await client.query(
      `INSERT INTO goals (id, store_id, title, description, goal_type, target_value, current_value, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [goalId, storeId, 'Increase ROAS', 'Achieve 5x ROAS on Meta campaigns', 'roas', 5.0, 0, 'active'],
    );
    console.log(`Goal created: ${goalId}`);

    await client.query('COMMIT');
    console.log('\nSeed completed successfully!');
    console.log('\n--- Quick Start ---');
    console.log('Login:  POST http://localhost:4000/auth/login');
    console.log('Body:   { "email": "admin@example.com", "password": "password123" }');
    console.log(`Store:  x-store-id: ${storeId}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
