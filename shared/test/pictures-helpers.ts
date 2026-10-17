import type { KitId, Work } from '../src/games/pictures/works';

/** Uma obra válida e completa de cada kit (pode ficar "pronta"). */
export function sampleWork(kit: KitId): Work {
  switch (kit) {
    case 'cubes':
      return { kit, cells: [0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5] };
    case 'laces':
      return { kit, long: [[0.1, 0.5], [0.5, 0.4], [0.9, 0.5]], short: [[0.2, 0.2], [0.4, 0.2]] };
    case 'sticks':
      return {
        kit,
        sticks: [0, 1, 2, 3].map((i) => ({ x: 0.2 + i * 0.1, y: 0.5, rot: i * 45 })),
        stones: [0, 1, 2, 3].map((i) => ({ x: 0.2 + i * 0.1, y: 0.7, rot: 0 })),
      };
    case 'blocks':
      return {
        kit,
        pieces: [0, 1, 2, 3, 4, 5].map((i) => ({ x: i - 3, y: 0, z: 0, rot: 0, lay: false })),
        camera: { theta: 0.5, phi: 0.95 },
      };
    case 'icons':
      return { kit, ids: [0, 1, 2] };
    case 'dots':
      return { kit, points: [[0.1, 0.1], [0.5, 0.9], [0.9, 0.1]], lines: [[0, 1], [1, 2]] };
  }
}
