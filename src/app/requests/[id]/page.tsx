import RequestDetailClient from './RequestDetailClient';

export const dynamic = 'force-dynamic';

export default async function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const routeParams = await params;
  return <RequestDetailClient id={routeParams.id} />;
}
