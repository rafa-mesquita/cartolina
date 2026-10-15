import { useHashRoute } from './lib/router';
import { GroupPage } from './screens/GroupPage';
import { Home } from './screens/Home';
import { RoomScreen } from './screens/RoomScreen';

export function App() {
  const route = useHashRoute();
  if (route.name === 'room') return <RoomScreen key={route.code} code={route.code} />;
  if (route.name === 'group') return <GroupPage key={route.slug} slug={route.slug} />;
  return <Home />;
}
