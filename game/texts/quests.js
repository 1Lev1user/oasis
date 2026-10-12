// Every visible Russian string of the coach: quests, the miss card and the gem counter. Address: «ты». Calm, never shaming,
// gender-neutral, and gems never relate to money (skill coach-texts).
export const TEXTS = {
  title: 'Маленькие дела',
  // neutral preparation quests for the evening before a session day, used when the owner has fewer own eve points
  prep: ['Подготовь всё для следующего шага', 'Убери одну помеху на пути', 'Положи нужную вещь на видное место', 'Реши, во сколько будет следующий шаг'],
  repeat: 'Повтори свой план «если-то»',
  learn: 'Узнай, как сделать шаг проще',
  conditions: 'Найди время и место: запиши запасной слот',
  sunday: 'Подведи итоги недели у костра',
  reward: (gems) => `+${gems} ◆`,
  gems: 'Самоцветы',
  missTitle: 'Твой план на такой случай',
  whyLabel: 'Зачем тебе это',
};
