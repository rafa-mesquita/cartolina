import { useHashRoute } from './lib/router';
import { GamePage } from './screens/GamePage';
import { Home } from './screens/Home';
import { RoomScreen } from './screens/RoomScreen';

export function App() {
  const route = useHashRoute();
  // O aviso de "abre no computador" é da própria sala: ela só sabe o jogo depois de falar com o servidor.
  if (route.name === 'room') return <RoomScreen key={route.code} code={route.code} />;
  if (route.name === 'game') return <GamePage key={`${route.game}/${route.tab}`} game={route.game} tab={route.tab} legacy={route.legacy} />;
  return <Home />;
}
