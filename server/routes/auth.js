import { Hono } from 'hono';
import { requireAuth } from '../lib/auth-middleware.js';

const auth = new Hono();

auth.get('/me', requireAuth, (c) => {
  const ctx = c.get('ctx');
  return c.json({
    id: ctx.id,
    email: ctx.email,
    clientCompanyId: ctx.clientCompanyId,
    businessRole: ctx.businessRole,
    displayName: ctx.profile?.display_name || null,
    department: ctx.profile?.department || null,
  });
});

export default auth;
