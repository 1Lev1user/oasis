// What the coach shows at a moment, as plain values. Pure, no Phaser, no DOM. Every rule comes from app/lib/quests.js.
import { momentFor, openQuests } from '../lib/quests.js';
import { addDays, weekday } from '../lib/dates.js';
import { TEXTS } from './texts/quests.js';

// The quest ids that count as done at `today`: everything done today, plus the weekly ids (learn, conditions: they carry the
// Monday and are open once a week) done earlier this week. Daily ids (prep, repeat) count only on the day they were done.
const WEEKLY = /^(learn|conditions):/;
export function doneThisWeek(game, today) {
  const monday = addDays(today, -weekday(today));
  return Object.entries(game?.quests ?? {})
    .filter(([day]) => day >= monday && day <= today)
    .flatMap(([day, ids]) => (day === today ? ids : ids.filter((id) => WEEKLY.test(id))));
}

// A preparation quest with the owner's point shows that point; a neutral one ('prep:any:k') shows the k-th neutral text.
const textOf = (q) => q.point?.text ?? (q.kind === 'prep' ? TEXTS.prep[Number(q.id.split(':')[2]) % TEXTS.prep.length] : TEXTS[q.kind]);

// { mainPoint, evePoints, missPoints, why, quests: [{ id, text, gems }] }; mainPoint and why are '' when there is none.
export function coachView(contract, game, today, hour) {
  const moment = momentFor(contract, today, hour);
  const texts = (points) => points.map((p) => p.text);
  return {
    mainPoint: moment.dayPoints.find((p) => p.main)?.text ?? '',
    evePoints: texts(moment.evePoints),
    missPoints: texts(moment.missPoints),
    why: moment.why,
    quests: openQuests(contract, today, hour, doneThisWeek(game, today)).map((q) => ({ id: q.id, text: textOf(q), gems: q.gems })),
  };
}
