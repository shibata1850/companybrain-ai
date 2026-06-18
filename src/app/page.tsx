import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import LandingClient from './LandingClient';

export const dynamic = 'force-dynamic';

/**
 * Public marketing landing page. If the visitor already has a valid
 * Supabase session, they're bounced to /dashboard so they land
 * straight in the app instead of seeing the LP again.
 */
export default async function RootPage() {
  const store = cookies();
  const supa = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return store.getAll();
        },
        setAll() {
          // read-only here
        },
      },
    },
  );
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (user) redirect('/dashboard');
  return <LandingClient />;
}
