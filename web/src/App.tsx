import { useHashRoute } from './lib/router';

export function App() {
  const route = useHashRoute();
  return (
    <main className="screen">
      <h1 className="logo big">
        cartolina<span>~</span>
      </h1>
      <p className="tagline">{route.name === 'room' ? `sala ${route.code}` : 'em construção'}</p>
    </main>
  );
}
