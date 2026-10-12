// Every visible Russian string of the museum, the keeper's growth and the museum buttons. Address: «ты», gender-neutral, calm (skill coach-texts).
import { BALANCE } from '../../lib/balance.js';

// «из N шагов»: genitive, 1 -> «шага» (1, 21 ...), the rest -> «шагов»
const steps = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'шага' : 'шагов');

const stageHint = (stage, name) => `Доведи силу привычки до ${BALANCE.evolution[stage]}%: хранитель станет «${name}».`;

export const TEXTS = {
  title: 'Музей',
  enter: 'Музей',
  back: 'Назад',
  housesTitle: 'Дома',
  noHouses: 'Здесь появится дом за каждый договор, доведённый до конца.',
  houseMeta: (date, stage) => `до ${date} · ${TEXTS.stages[stage]}`,
  trophiesTitle: 'Трофеи',
  earned: 'получен',
  stages: { egg: 'яйцо', baby: 'малыш', teen: 'подросток', adult: 'взрослый', legend: 'легенда' },
  hatched: 'Из яйца вылупился хранитель.',
  grew: (stage) => `У хранителя новая стадия: «${TEXTS.stages[stage]}».`,
  trophies: {
    first_step: { name: 'Первый шаг', hint: 'Сделай первый шаг привычки.' },
    week_full: { name: 'Полная неделя', hint: 'Сделай все шаги одной недели, с понедельника по воскресенье.' },
    comeback: { name: 'Возвращение', hint: 'Вернись к привычке после пропущенного шага.' },
    campfire: { name: 'Воскресный костёр', hint: 'Подведи итоги недели у воскресного костра.' },
    stage_teen: { name: 'Подросток', hint: stageHint('teen', 'подросток') },
    stage_adult: { name: 'Взрослый', hint: stageHint('adult', 'взрослый') },
    stage_legend: { name: 'Легенда', hint: stageHint('legend', 'легенда') },
    finished: { name: 'Дом в музее', hint: 'Доведи договор до конца: в музее появится дом.' },
    ...Object.fromEntries(BALANCE.streaks.map((n) => [`streak_${n}`, {
      name: `Серия из ${n} ${steps(n)}`,
      hint: `Делай шаг или мини-шаг ${n} раз подряд в одном договоре, без пропусков между ними.`,
    }])),
  },
};
