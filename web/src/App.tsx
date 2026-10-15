import { useHashRoute } from './lib/router';
import { Home } from './screens/Home';
import { RoomScreen } from './screens/RoomScreen';

export function App() {
  const route = useHashRoute();
  return route.name === 'room' ? <RoomScreen key={route.code} code={route.code} /> : <Home />;
}
