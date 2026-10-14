import { Suspense } from 'react';
import type { Metadata } from 'next';
import KioskClient from './KioskClient';

export const metadata: Metadata = {
  title: 'CompanyBrain AI キオスク',
  // 展示端末専用ページ。検索エンジンには載せない。
  robots: { index: false, follow: false },
};

export default function KioskPage() {
  return (
    <Suspense fallback={null}>
      <KioskClient />
    </Suspense>
  );
}
