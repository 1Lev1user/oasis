// Time of day from the device clock. Pure, no Phaser.
// night 22:00-05:59, dusk 19:00-21:59 and 06:00-07:59, day otherwise; forced 'day' or 'night' (from ?time=) wins.
export function timeOfDay(date, forced = null) {
  if (forced === 'day' || forced === 'night') return forced;
  const h = date.getHours();
  if (h >= 22 || h < 6) return 'night';
  if (h >= 19 || h < 8) return 'dusk';
  return 'day';
}
