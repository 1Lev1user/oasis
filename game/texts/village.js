// Every visible Russian string of the village and its button in the oasis. Address: «ты». Calm, never shaming (skill coach-texts).
import { formatMeter } from '../session.js';

// «из N шагов»: genitive, 1 -> «шага» (1, 21 ...), the rest -> «шагов»
const steps = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'шага' : 'шагов');

export const TEXTS = {
  title: 'Деревня',
  toVillage: 'Деревня',
  newHabit: 'Новая привычка',
  summary: (done, total) => (total ? `Сегодня: ${done} из ${total} ${steps(total)}` : 'Сегодня шагов нет'),
  strength: (meter) => `Сила ${formatMeter(meter)}`,
  state: { done: 'шаг сделан', todo: 'ждёт шага', rest: 'сегодня отдых', paused: 'пауза', later: 'ещё не началась', session: 'идёт шаг' },
  sessionRuns: 'Сначала закончи начатый шаг: он идёт в другом районе.',
};
