import { useIsPhone } from './lib/device';
import { useHashRoute } from './lib/router';
import { GroupPage } from './screens/GroupPage';
import { Home } from './screens/Home';
import { PhoneNotice } from './screens/PhoneNotice';
import { RoomScreen } from './screens/RoomScreen';

export function App() {
  const route = useHashRoute();
  const phone = useIsPhone();
  if (route.name === 'room') return phone ? <PhoneNotice /> : <RoomScreen key={route.code} code={route.code} />;
  if (route.name === 'group') return <GroupPage key={route.slug} slug={route.slug} />;
  return <Home />;
}
