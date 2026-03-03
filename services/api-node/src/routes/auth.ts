import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { LoginSchema } from '@ai-commerce-os/shared';
import { query, queryOne } from '../db';

// --- Brute-force protection ---
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 60_000; // 1 minute
const LOGIN_LOCKOUT_MS = 5 * 60_000; // 5 minutes after exceeding max

interface AttemptRecord {
  count: number;
  firstAttempt: number;
  lockedUntil?: number;
}

const loginAttempts = new Map<string, AttemptRecord>();

// Cleanup stale entries every 10 min
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of loginAttempts) {
    if (now - record.firstAttempt > LOGIN_LOCKOUT_MS + LOGIN_WINDOW_MS) {
      loginAttempts.delete(key);
    }
  }
}, 10 * 60_000).unref();

function checkLoginRate(key: string): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  const record = loginAttempts.get(key);

  if (!record) return { allowed: true };

  // Currently locked out
  if (record.lockedUntil && now < record.lockedUntil) {
    return { allowed: false, retryAfterMs: record.lockedUntil - now };
  }

  // Window expired — reset
  if (now - record.firstAttempt > LOGIN_WINDOW_MS) {
    loginAttempts.delete(key);
    return { allowed: true };
  }

  // Within window but under limit
  if (record.count < LOGIN_MAX_ATTEMPTS) return { allowed: true };

  // Exceeded — lock
  record.lockedUntil = now + LOGIN_LOCKOUT_MS;
  return { allowed: false, retryAfterMs: LOGIN_LOCKOUT_MS };
}

function recordLoginFailure(key: string): void {
  const now = Date.now();
  const record = loginAttempts.get(key);
  if (!record || now - record.firstAttempt > LOGIN_WINDOW_MS) {
    loginAttempts.set(key, { count: 1, firstAttempt: now });
  } else {
    record.count++;
  }
}

function clearLoginAttempts(key: string): void {
  loginAttempts.delete(key);
}

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/login', async (request, reply) => {
    const parsed = LoginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.issues });
    }

    const { email, password } = parsed.data;

    // Brute-force check by IP and by email
    const ip = request.ip;
    const ipCheck = checkLoginRate(`ip:${ip}`);
    const emailCheck = checkLoginRate(`email:${email.toLowerCase()}`);

    if (!ipCheck.allowed || !emailCheck.allowed) {
      const retryAfter = Math.max(ipCheck.retryAfterMs || 0, emailCheck.retryAfterMs || 0);
      reply.header('Retry-After', String(Math.ceil(retryAfter / 1000)));
      return reply.status(429).send({ error: 'Too many login attempts. Please try again later.' });
    }

    const user = await queryOne<{ id: string; email: string; password_hash: string; status: string }>(
      'SELECT id, email, password_hash, status FROM users WHERE email = $1',
      [email],
    );

    if (!user || user.status !== 'active') {
      recordLoginFailure(`ip:${ip}`);
      recordLoginFailure(`email:${email.toLowerCase()}`);
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      recordLoginFailure(`ip:${ip}`);
      recordLoginFailure(`email:${email.toLowerCase()}`);
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    // Successful login — clear attempts
    clearLoginAttempts(`ip:${ip}`);
    clearLoginAttempts(`email:${email.toLowerCase()}`);

    const memberships = await query<{ store_id: string; role: string; store_name: string; store_slug: string }>(
      `SELECT m.store_id, m.role, s.name as store_name, s.slug as store_slug
       FROM memberships m JOIN stores s ON s.id = m.store_id
       WHERE m.user_id = $1 AND s.status = 'active'`,
      [user.id],
    );

    const token = app.jwt.sign({ sub: user.id, email: user.email });

    return {
      token,
      user: { id: user.id, email: user.email },
      memberships,
    };
  });

  app.get('/auth/me', {
    preHandler: [app.authenticate],
  }, async (request) => {
    const { sub } = request.user;

    const user = await queryOne<{ id: string; email: string; name: string; avatar_url: string }>(
      'SELECT id, email, name, avatar_url FROM users WHERE id = $1',
      [sub],
    );

    if (!user) {
      return { error: 'User not found' };
    }

    const memberships = await query(
      `SELECT m.store_id, m.role, s.name as store_name, s.slug as store_slug
       FROM memberships m JOIN stores s ON s.id = m.store_id
       WHERE m.user_id = $1 AND s.status = 'active'`,
      [sub],
    );

    return { user, memberships };
  });
}
