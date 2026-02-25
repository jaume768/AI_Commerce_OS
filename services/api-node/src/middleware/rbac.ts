import { FastifyRequest, FastifyReply } from 'fastify';
import type { MemberRole } from '@ai-commerce-os/shared';

export function requireRole(...allowedRoles: MemberRole[]) {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    const role = (request as any).role as string | undefined;
    if (!role || !allowedRoles.includes(role as MemberRole)) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: `Requires one of: ${allowedRoles.join(', ')}`,
      });
    }
  };
}
