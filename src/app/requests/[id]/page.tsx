import RequestDetailClient from './RequestDetailClient';

export const dynamic = 'force-dynamic';

export default function RequestDetailPage({ params }: { params: { id: string } }) {
  return <RequestDetailClient id={params.id} />;
}
