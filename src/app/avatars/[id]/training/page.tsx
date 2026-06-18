import TrainingClient from './TrainingClient';

export const dynamic = 'force-dynamic';

export default function TrainingPage({ params }: { params: { id: string } }) {
  return <TrainingClient avatarId={params.id} />;
}
