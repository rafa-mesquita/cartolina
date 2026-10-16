import { useIsPhone } from './lib/device';
import { useHashRoute } from './lib/router';
import { GamePage } from './screens/GamePage';
import { Home } from './screens/Home';
import { PhoneNotice } from './screens/PhoneNotice';
import { RoomScreen } from './screens/RoomScreen';

export function App() {
  const route = useHashRoute();
  const phone = useIsPhone();
  if (route.name === 'room') return phone ? <PhoneNotice /> : <RoomScreen key={route.code} code={route.code} />;
  if (route.name === 'game') return <GamePage key={`${route.game}/${route.tab}`} game={route.game} tab={route.tab} legacy={route.legacy} />;
  return <Home />;
}
