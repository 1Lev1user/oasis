// Display formatting shared by screens.

// 6000 -> '60,00 €'; thousands are separated by a narrow no-break space (U+202F).
export function money(cents) {
  const euros = String(Math.floor(cents / 100)).replace(/\B(?=(\d{3})+$)/g, ' ');
  return `${euros},${String(cents % 100).padStart(2, '0')} €`;
}
