import AvatarDetail from './AvatarDetail';

export const dynamic = 'force-dynamic';

export default async function AvatarPage({ params }: { params: Promise<{ id: string }> }) {
  const routeParams = await params;
  return <AvatarDetail id={routeParams.id} />;
}
