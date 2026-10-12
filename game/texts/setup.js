// Every visible Russian string of the habit questionnaire. Address: «ты». Calm, never shaming (skill coach-texts).
// Questions are in the order of QUESTIONS in setup-flow.js.
const times = (n) => `${n} ${n >= 2 && n <= 4 ? 'раза' : 'раз'} в неделю`;

export const TEXTS = {
  createHabit: 'Создать привычку',
  noHabit: 'Здесь пока нет привычки. Давай создадим первую.',
  progress: (n, total) => `${n} из ${total}`,
  next: 'Дальше',
  back: 'Назад',
  toOasis: 'В оазис',
  optional: ' (можно пропустить)',
  caption: 'Ящерица сидит у костра и кивает на каждый ответ.',
  questions: {
    action: { label: 'Что ты будешь делать? Одно конкретное действие.', hint: 'Не «больше спорта», а «тренировка в зале 40 минут»' },
    why: { label: 'Зачем тебе это? Одной фразой.', optional: true },
    anchor: { label: 'После чего ты это делаешь? Что уже есть в твоём дне.', hint: 'Например: «выхожу с работы», «чищу зубы утром»' },
    schedule: {
      label: 'В какие дни?',
      kinds: { daily: 'Каждый день', days: 'По дням недели', count: 'Несколько раз в неделю' },
      daysLabel: 'Дни недели',
      days: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
      countLabel: 'Сколько раз в неделю',
      count: times,
    },
    place: { label: 'Где?', optional: true },
    obstacles: {
      label: 'Что может помешать? Выбери до трёх.',
      options: { tired: 'Нет сил', no_time: 'Нет времени', forgot: 'Вылетело из головы', guests: 'Гости или кафе', weather: 'Погода', mood: 'Плохое настроение' },
    },
    plans: { label: 'Что ты сделаешь, если это случится?', hint: 'Подсказку можно оставить или написать своё.', field: (obstacle) => `Если ${obstacle}, то` },
    prep: { label: 'Что подготовить накануне?', hint: 'Через запятую', optional: true },
    mini: { label: 'Самая маленькая версия на трудный день?', hint: 'Например: «10 минут дома»' },
    sliders: {
      label: 'Оцени честно, от 1 до 5',
      can: 'Насколько ты умеешь это делать',
      opp: 'Есть ли для этого условия',
      want: 'Насколько ты этого хочешь',
    },
  },
  // stepError codes -> one calm line each
  errors: {
    action_required: 'Напиши одно действие, которое можно отметить «сделано».',
    vague: (word) => `Слово «${word}» трудно проверить. Как это будет выглядеть, когда ты это делаешь?`,
    anchor_required: 'Напиши, после чего ты это делаешь.',
    schedule_invalid: 'Выбери хотя бы один день.',
    obstacles_range: 'Выбери от одного до трёх вариантов.',
    plan_required: 'Напиши, что ты сделаешь. Можно оставить подсказку.',
    mini_required: 'Напиши самую маленькую версию, пусть даже совсем крошечную.',
    sliders_invalid: 'Выбери оценку от 1 до 5.',
    empty: 'Напиши пару слов: пустой пункт сохранить нельзя.',
    too_long: 'Слишком длинно, пусть будет не больше 120 знаков.',
    points_full: 'В плане уже двенадцать пунктов, это максимум. Убери один, и можно добавить новый.',
    main_required: 'В дне нужен главный шаг. Сначала отметь главным другой пункт дня или добавь новый.',
    not_day: 'Главным может быть только пункт дня.',
    other: 'Что-то не получилось. Проверь ответы и попробуй ещё раз.',
  },
  draft: {
    title: 'Черновик твоего плана',
    caption: 'Ящерица прочитала. Дальше ты сможешь всё поправить.',
    main: 'Главный шаг',
    groups: { eve: 'Накануне', day: 'В день привычки', miss: 'Если что-то помешало' },
    schedule: {
      daily: 'Каждый день',
      days: (names) => `По дням: ${names}`,
      count: times,
    },
    failed: 'Черновик не собрался: ответы слишком длинные. Вернись и сократи их.',
  },
  // The plan scene: edit the drafted points and the schedule
  plan: {
    title: 'Твой план',
    sub: 'Поправь любой пункт, убери лишнее или добавь своё. Один шаг дня остаётся главным.',
    pointLabel: (n) => `Пункт ${n}`,
    when: 'Когда',
    whens: { eve: 'Накануне', day: 'В день', miss: 'Помеха' },
    mainTag: 'Главный шаг',
    makeMain: 'Сделать главным',
    remove: 'Убрать',
    add: '+ Добавить',
    addLabel: 'Новый пункт',
    addConfirm: 'Добавить',
    addCancel: 'Отмена',
    countLess: 'Меньше раз в неделю',
    countMore: 'Больше раз в неделю',
    next: 'Дальше: договор',
  },
  // The sign scene: the contract with yourself. Honour system: the app never moves money.
  sign: {
    title: 'Договор с собой',
    sub: 'Деньги остаются у тебя: приложение их никуда не переводит. Всё держится на честном слове.',
    weeks: 'Срок',
    weeksOption: (n) => `${n} недель`,
    start: 'Начало',
    startHint: 'Обычно с ближайшего понедельника.',
    stake: 'Сколько денег на кону, в евро',
    stakeHint: 'От 5 €. Пропуск сжигает часть, остальное достаётся награде.',
    setAside: 'Деньги отложены',
    setAsideHint: 'Отложи эту сумму отдельно: в конверт или на другой счёт.',
    antiGoal: 'Кому уйдут сгоревшие деньги',
    antiGoalHint: 'То, что тебе совсем не нравится.',
    reward: 'На что пойдут сохранённые деньги',
    rewardHint: 'Награда в конце срока.',
    centrepiece: 'Что будет в центре оазиса',
    centrepieces: { pet: 'Питомец', jar: 'Банка', lock: 'Замок' },
    signature: 'Подпись',
    signatureHint: 'Напиши своё имя.',
    perMiss: (amount) => `Пропуск стоит ${amount}`,
    submit: 'Подписать',
    back: 'Назад к плану',
    saveFailed: 'Не удалось сохранить на этом телефоне. Попробуй ещё раз.',
    stamped: 'Договор в силе. Первый шаг уже есть.',
    errors: {
      limit: 'Сейчас у тебя пять привычек, больше не помещается. Новый договор можно начать, когда закончится один из текущих.',
      start_past: 'Начало не может быть в прошлом. Выбери сегодня или день позже.',
      start_too_far: 'Начать можно не позже чем через две недели.',
      start_invalid: 'Выбери день начала.',
      weeks_range: 'Выбери срок: 6, 7 или 8 недель.',
      stake_invalid: 'Напиши сумму цифрами, например 60 или 60,50.',
      stake_range: 'Сумма может быть от 5 € до 100 000 €.',
      setaside_required: 'Отметь «Деньги отложены», когда сумма уже лежит отдельно.',
      antigoal_required: 'Напиши, кому уйдут сгоревшие деньги.',
      reward_required: 'Напиши, на что пойдут сохранённые деньги.',
      signature_required: 'Поставь подпись: напиши своё имя.',
      too_long: (field) => (field === 'signature' ? 'Подпись длинновата, пусть будет не больше 60 знаков.' : 'Слишком длинно, пусть будет не больше 120 знаков.'),
    },
  },
};

// A buildContract code ('stake_range', 'too_long:signature') -> the line to show; unknown codes get the general line.
export function signErrorText(code) {
  const [kind, arg] = String(code).split(':');
  const line = TEXTS.sign.errors[kind];
  if (typeof line === 'function') return line(arg);
  return line ?? TEXTS.errors.other;
}

// stepError code ('vague:больше', 'plan_required:tired') -> the line to show.
export function errorText(code) {
  const [kind, arg] = String(code).split(':');
  const line = TEXTS.errors[kind];
  if (typeof line === 'function') return line(arg);
  return line ?? TEXTS.errors.other;
}
