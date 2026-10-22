import TrainingClient from './TrainingClient';

export const dynamic = 'force-dynamic';

export default async function TrainingPage({ params }: { params: Promise<{ id: string }> }) {
  const routeParams = await params;
  return <TrainingClient avatarId={routeParams.id} />;
}
