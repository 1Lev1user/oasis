// Every visible Russian string of the Sunday campfire: the fire in the oasis, the week in numbers, the four automaticity questions,
// «Что помешало на этой неделе?» and the end. Address: «ты», calm, gender-neutral (skill coach-texts). The four questions themselves
// are SRBAI in app/lib/campfire.js (a translation, not a validated Russian version).
export const TEXTS = {
  title: 'Воскресный костёр',
  enter: 'Костёр',
  weekTitle: 'Неделя в цифрах',
  lines: {
    sessions: (n) => `Занятий в плане: ${n}`,
    steps: (n) => `Шагов: ${n}`,
    minis: (n) => `Мини-шагов: ${n}`,
    misses: (n) => `Пропусков: ${n}`,
    up: (from, to) => `Сила привычки выросла: ${from} → ${to}`,
    down: (from, to) => `Сила привычки снизилась: ${from} → ${to}`,
    same: (to) => `Сила привычки не изменилась: ${to}`,
  },
  scaleTitle: 'Как это сейчас',
  scaleHint: 'Про твой шаг. Оцени от 1 до 7, насколько это про тебя.',
  scaleLow: '1 — совсем не про меня',
  scaleHigh: '7 — точно про меня',
  rate: (n) => `${n} из 7`,
  obstacleTitle: 'Что помешало на этой неделе?',
  obstacleHint: 'Можно пропустить: тогда нового пункта в плане не будет.',
  obstacles: { tired: 'Нет сил', no_time: 'Нет времени', forgot: 'Вылетело из головы', guests: 'Гости или кафе', weather: 'Погода', mood: 'Плохое настроение', other: 'Другое' },
  otherLabel: 'Что именно?',
  planLabel: (obstacle) => `Если ${obstacle}, то`,
  planHint: 'Подсказку можно оставить или написать своё.',
  done: 'Готово',
  back: 'В оазис',
  // after the review
  finished: (gems) => (gems > 0 ? `Итоги подведены: +${gems} ◆` : 'Итоги подведены. Самоцветы за это воскресенье уже получены.'),
  score: (score) => `Автоматичность: ${score} из 7`,
  newPoint: 'Новый пункт в плане:',
  // when the review cannot be done
  already: 'Уже посидели у костра',
  notSunday: 'Костёр зажигают по воскресеньям.',
  saveFailed: 'Не удалось сохранить на этом телефоне. Итоги видны сейчас, но могут пропасть после закрытия страницы.',
  // finish() errors: one calm line each
  errors: {
    answers: 'Ответь на все четыре вопроса: это меньше минуты.',
    obstacle_unknown: 'Выбери, что мешало, или очисти поле плана.',
    points_full: 'В плане уже много пунктов. Убери лишний или очисти поле плана.',
    too_long: 'Пункт получился слишком длинным. Сократи его.',
    not_open: 'Костёр зажигают по воскресеньям.',
    already: 'Уже посидели у костра',
    other: 'Сейчас не получилось. Попробуй ещё раз.',
  },
};
