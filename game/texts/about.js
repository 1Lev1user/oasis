// Every visible string of the «Об игре» block (C-071): the author, the copyright, the ban on copying and the licence links.
// Owner wording (2026-10-20): the author name is exactly 1Lev1user, the licence is «Все права защищены». The credits line is
// pieces so the licence names can be links (href: a file next to the game).
export const TEXTS = {
  title: 'Об игре',
  name: 'Оазис ящерицы',
  copyright: '© 2026 1Lev1user. Все права защищены.',
  notice: 'Копировать, изменять и выкладывать игру, её код, рисунки и тексты без письменного разрешения автора нельзя.',
  authorLink: 'Автор на GitHub',
  authorUrl: 'https://github.com/1Lev1user',
  credits: [
    { text: 'Движок Phaser (лицензия ' },
    { text: 'MIT', href: 'vendor/PHASER-LICENSE.txt' },
    { text: '), шрифты ' },
    { text: 'Handjet', href: 'vendor/fonts/OFL-Handjet.txt' },
    { text: ' и ' },
    { text: 'Nunito', href: 'vendor/fonts/OFL-Nunito.txt' },
    { text: ' (лицензия SIL OFL).' },
  ],
  licenseLink: 'Лицензия игры',
  licenseUrl: 'LICENSE.txt',
};
