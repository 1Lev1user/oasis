// Query string -> { scene, time, demo }, e.g. '?scene=oasis&time=night&demo=1'. Unknown values give null or false.
export function readParams(search) {
  const q = new URLSearchParams(search);
  const time = q.get('time');
  return {
    scene: q.get('scene') || null,
    time: time === 'day' || time === 'night' ? time : null,
    demo: q.get('demo') === '1',
  };
}
