// Every visible Russian string of the «Стройка» panel. Address: «ты», gender-neutral, calm (skill coach-texts).
// Gems are never money: no price here is a sum of money. Numbers come from the balance table.
import { BALANCE } from '../../lib/balance.js';

const percent = (chance) => `${Math.round(chance * 100)}%`;
const { lighthouse, observatory } = BALANCE.buildings;

export const TEXTS = {
  title: 'Стройка',
  open: 'Стройка',
  close: 'Закрыть',
  gems: 'Самоцветы',
  mineName: (level, max) => `Шахта, уровень ${level} из ${max}`,
  mineMeta: (gems) => `+${gems} ◆ за каждый шаг`,
  nextPrice: (price) => `следующий уровень ◆ ${price}`,
  top: 'выше некуда',
  storageName: (filled, slots) => `Склад, ${filled} из ${slots}`,
  storageMeta: `Каждый шаг кладёт один слот. Полный склад открывается сундуком: +${BALANCE.storage.chestGems} ◆`,
  storageLabel: (filled, slots) => `Склад: занято ${filled} из ${slots}`,
  upgrade: 'Улучшить',
  build: 'Построить',
  locked: (meter) => `откроется при силе ${meter}%`,
  owned: 'уже построено',
  price: (n) => `◆ ${n}`,
  effects: {
    lighthouse: { name: 'Маяк', effect: `+${lighthouse.gemsPerStep} ◆ за каждый шаг` },
    watchtower: { name: 'Сторожевая башня', effect: 'первый пропуск недели ничего не ломает в оазисе' },
    observatory: { name: 'Обсерватория', effect: `редкая удача чаще: ${percent(observatory.rareChance)} вместо ${percent(BALANCE.rareBonus.chance)} шагов` },
  },
  upgraded: (level) => `Шахта выросла: уровень ${level}.`,
  built: (name) => `Построено: ${name}.`,
  errors: {
    not_enough: 'Пока не хватает самоцветов',
    max_level: 'Шахта уже на высшем уровне.',
    locked: 'Это откроется, когда сила привычки дорастёт.',
    owned: 'Это уже построено.',
    other: 'Не получилось. Попробуй ещё раз.',
  },
};
