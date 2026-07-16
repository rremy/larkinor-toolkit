import { h } from 'preact';
import type { DataLoader } from '@/shared/data';

export interface DatabaseAppProps {
  loader: DataLoader;
}

export function DatabaseApp(_props: DatabaseAppProps) {
  return <div id="lc-root" class="lc-db"><h1>Larkinor adatbázis</h1></div>;
}
