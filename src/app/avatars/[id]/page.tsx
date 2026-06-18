import AvatarDetail from './AvatarDetail';

export const dynamic = 'force-dynamic';

export default function AvatarPage({ params }: { params: { id: string } }) {
  return <AvatarDetail id={params.id} />;
}
