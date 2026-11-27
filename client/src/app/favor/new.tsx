import { useLocalSearchParams } from 'expo-router';

import { FavorForm } from '@/components/FavorForm';
import { Screen } from '@/components/ui';

export default function NewFavorScreen() {
  const { friend } = useLocalSearchParams<{ friend?: string }>();
  return (
    <Screen>
      <FavorForm friend={friend} />
    </Screen>
  );
}
