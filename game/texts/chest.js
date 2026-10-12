// Every visible Russian string of the chest at the end of a contract, its result, the renewal and the owed reminder.
// Address: «ты», calm, gender-neutral (skill coach-texts). Amounts arrive formatted by money(); the app never moves money.
import { BALANCE } from '../../lib/balance.js';

export const TEXTS = {
  title: 'Итог договора',
  previewTitle: 'Предварительный итог',
  opensAt: (hour = BALANCE.markYesterdayUntilHour) => `Сундук откроется сегодня в ${hour}:00. До этого можно отметить вчерашний шаг.`,
  open: 'Открыть сундук',
  standing: 'Срок договора позади. У пруда стоит сундук.',
  opening: 'Сундук открывается…',
  lines: {
    reward: (amount) => `В награду: ${amount}`,
    antiGoal: (amount) => `На антицель: ${amount}`,
    owed: (amount) => `Перевести на антицель: ${amount}`,
    steps: (n) => `Шагов: ${n}`,
    minis: (n) => `Мини-шагов: ${n}`,
    misses: (n) => `Пропусков: ${n}`,
    strength: (meter, stage) => `Сила привычки: ${meter} · ${stage}`,
  },
  note: 'Приложение само деньги не переводит: перевод делаешь ты.',
  close: 'Закрыть договор',
  closed: 'Договор закрыт. В музее появился дом.',
  renew: 'Продолжить привычку',
  toVillage: 'В деревню',
  transferred: 'Деньги переведены',
  afterTransfer: 'Спасибо за честность. Перевод отмечен.',
  reminder: (action, amount) => `${action}: осталось перевести на антицель ${amount}`,
  notReady: 'Сундук пока закрыт. Загляни позже.',
  saveFailed: 'Не удалось сохранить на этом телефоне. Итог виден сейчас, но может пропасть после закрытия страницы.',
  // the village HUD: a contract whose term is over waits there with its chest
  waiting: 'Сундук ждёт',
};
