import type { DixitMatch } from '@cartolina/shared';
import { useId, useState } from 'react';
import { Critter } from '../../../screens/Critter';
import { clueText, formatDate, joinNames, matchMeta, matchOutcome } from './format';
import { matchGroupKey, matchItems } from './groups';
import { HistoryCard } from './HistoryCard';

type OnOpen = (group: string, index: number) => void;

function MatchItem({ match, open, onToggle, onOpen }: { match: DixitMatch; open: boolean; onToggle: () => void; onOpen: OnOpen }) {
  const bodyId = useId();
  const items = matchItems(match);
  // o leitor de tela ouve as partes separadas e os nomes de quem jogou (na tela, só os personagens)
  const headLabel = [formatDate(match.startedAt), matchMeta(match), matchOutcome(match), joinNames(match.scores.map((s) => s.name))].join(' · ');
  return (
    <li className="dxh-match">
      <button type="button" className="dxh-match-head" aria-label={headLabel} aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
        <span className="dxh-date">{formatDate(match.startedAt)}</span>
        <span className="dxh-meta">{matchMeta(match)}</span>
        <span className={match.finished ? 'dxh-outcome' : 'dxh-outcome unfinished'}>{matchOutcome(match)}</span>
        <span className="dxh-faces">
          {/* nomes podem repetir numa sala; personagens não */}
          {match.scores.map((s) => (
            <Critter key={s.color} color={s.color} />
          ))}
        </span>
      </button>
      {/* sempre no DOM (o aria-controls aponta pra ele); o conteúdo só monta quando abre */}
      <div className="dxh-match-body" id={bodyId} hidden={!open}>
        {open && (
          <>
            <h3>{match.finished ? 'placar final' : 'placar de onde parou'}</h3>
            <ol className="dxh-final">
              {match.scores.map((s) => (
                <li key={s.color}>
                  <Critter color={s.color} />
                  {s.name} <b>{s.score}</b>
                </li>
              ))}
            </ol>
            <h3>rodadas</h3>
            <ol className="dxh-rounds">
              {match.rounds.map((r, i) => (
                <li key={r.id} className="dxh-round">
                  <span className="n">{i + 1}</span>
                  <HistoryCard card={r.storyCard} group={matchGroupKey(match.id)} index={i} label={items[i]!.label} onOpen={onOpen} />
                  <span className="dxh-round-text">
                    <span className="dxh-who">
                      <Critter color={r.storyteller.color} />
                      {`${r.storyteller.name} narrou`}
                    </span>
                    <span className={r.clue.trim() ? 'dxh-cap' : 'dxh-cap muted'}>{clueText(r.clue)}</span>
                  </span>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </li>
  );
}

/** Partidas, a mais recente primeiro; uma aberta por vez. */
export function MatchList({ matches, onOpen }: { matches: DixitMatch[]; onOpen: OnOpen }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <ul className="dxh-matches">
      {matches.map((m) => (
        <MatchItem key={m.id} match={m} open={open === m.id} onToggle={() => setOpen((cur) => (cur === m.id ? null : m.id))} onOpen={onOpen} />
      ))}
    </ul>
  );
}
