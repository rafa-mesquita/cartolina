import { CATALOG } from '../games/catalog';
import { JoinByCode } from './GamePage';
import './shelf.css';

export function Home() {
  return (
    <main className="screen">
      <h1 className="logo big">
        cartolina<span>~</span>
      </h1>
      <p className="tagline">jogos de tabuleiro pra jogar com a galera na call</p>
      <nav className="shelf" aria-label="jogos">
        {CATALOG.map((g) => (
          <a key={g.id} className={`cover cover-${g.id}`} href={`#/${g.id}`}>
            {!g.playable && <span className="cover-badge">em breve</span>}
            <b>{g.name}</b>
            <span>{g.tagline}</span>
          </a>
        ))}
      </nav>
      <div className="join-line">
        <span>tem um código?</span>
        <JoinByCode compact />
      </div>
    </main>
  );
}
