import { mulberry32 } from '@cartolina/shared';
import { useMemo } from 'react';

const GREENS = ['#28443c', '#2a473f', '#26403a', '#2c4a41'];

/** Fundo de pinceladas suaves (verdes perto do fundo + espirais mostarda quase transparentes). */
export function Brushes({ width, height = 900 }: { width: number; height?: number }) {
  const paths = useMemo(() => {
    const r = mulberry32(5);
    const strokes = Array.from({ length: Math.round((70 * width) / 1440) }, (_, i) => {
      const x = r() * width, y = r() * height, l = 90 + r() * 200, a = r() * 50 - 25;
      return <path key={`s${i}`} d={`M${x} ${y} q${l / 2} ${a} ${l} 0`} stroke={GREENS[i % 4]} strokeWidth={4 + r() * 7} fill="none" strokeLinecap="round" />;
    });
    const centers: [number, number, number][] = [[120, 120, 60], [width - 110, 140, 50], [width - 90, height - 140, 66], [90, height - 130, 44], [width / 2, height - 40, 40]];
    const spirals = centers.flatMap(([x, y, R], j) =>
      [0, 1, 2, 3].map((k) => (
        <circle key={`c${j}-${k}`} cx={x} cy={y} r={R - k * 11} stroke={k % 2 ? '#2c4a41' : '#F2A541'} strokeWidth={k % 2 ? 4 : 0.7} fill="none" opacity={k % 2 ? 1 : 0.13} strokeDasharray={`${R * 2} ${R}`} />
      )),
    );
    return [...strokes, ...spirals];
  }, [width, height]);
  return (
    <svg className="dx-bg" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      {paths}
    </svg>
  );
}
