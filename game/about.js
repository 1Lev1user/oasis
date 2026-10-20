// The «Об игре» block (C-071): the author, the copyright and the licence links, as DOM for #hud. Shown at the end of the help and
// the settings screens. Every link opens in a new tab so the game stays where it is.
import { el } from './hud.js';
import { TEXTS } from './texts/about.js';

function link(text, href) {
  const a = el('a', 'about-link', text);
  a.setAttribute('href', href);
  a.setAttribute('target', '_blank');
  a.setAttribute('rel', 'noopener noreferrer');
  return a;
}

export function aboutBlock() {
  const credits = el('p', 'about-line');
  credits.append(...TEXTS.credits.map((p) => (p.href ? link(p.text, p.href) : p.text)));
  const links = el('p', 'about-line about-links');
  links.append(link(TEXTS.authorLink, TEXTS.authorUrl), link(TEXTS.licenseLink, TEXTS.licenseUrl));
  const block = el('section', 'about');
  block.append(el('h3', 'coach-title', TEXTS.title), el('p', 'about-line about-name', TEXTS.name), el('p', 'about-line', TEXTS.copyright), el('p', 'about-line', TEXTS.notice), links, credits);
  return block;
}
