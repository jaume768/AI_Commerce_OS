import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { LoginSchema } from '@ai-commerce-os/shared';
import { query, queryOne } from '../db';

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/login', async (request, reply) => {
    const parsed = LoginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.issues });
    }

    const { email, password } = parsed.data;

    const user = await queryOne<{ id: string; email: string; password_hash: string; status: string }>(
      'SELECT id, email, password_hash, status FROM users WHERE email = $1',
      [email],
    );

    if (!user || user.status !== 'active') {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

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
