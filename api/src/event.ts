// Event links: a name and one exact moment, as a link that opens in each viewer's own local time.
// The page is moon369.org/m/<moonmark>?e=<name>; this module builds that link, its share card,
// its calendar file and the embeddable countdown snippet.
import { toMoon, unixNsToIso, type MoonTime } from './moon.js';

const p2 = (n: number) => String(n).padStart(2, '0');

/** The /m/ path form of a moment: 1928.05.24-17.31.02.640327453 */
export const markPath = (t: MoonTime) =>
  `${t.year}.${p2(t.moon)}.${p2(t.day)}-${p2(t.hour)}.${p2(t.minute)}.${p2(t.second)}.${String(t.nanosecond).padStart(9, '0')}`;

/** Clean an event name: no control characters, single spaces, at most 80 characters. */
export function cleanEventName(x: unknown): string {
  if (typeof x !== 'string') return '';
  return x.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

const q = (s: string) => encodeURIComponent(s).replace(/%20/g, '+');
const icsStamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/[,;]/g, '\\$&').replace(/\n/g, '\\n');

/** Everything about one event link. Events are set to the second, so the calendar times are whole seconds. */
export function eventLinks(name: string, unixNs: bigint, minutes = 60) {
  const t = toMoon(unixNs), path = markPath(t);
  const ms = Math.round(Number(unixNs / 1_000_000n) / 1000) * 1000;
  const mark = `${t.year}.${p2(t.moon)}.${p2(t.day)} ${p2(t.hour)}:${p2(t.minute)}:${p2(t.second)}`;
  const url = `https://moon369.org/m/${path}?e=${q(name)}`;
  return {
    name, moonmark: mark, moonmark_full: `${mark}.${String(t.nanosecond).padStart(9, '0')}`,
    utc: unixNsToIso(unixNs), unix_ms: ms,
    event_url: url,
    card_png: `https://api.moon369.org/v1/card.png?moonmark=${path}&event=${q(name)}&v=3`,
    ics_url: `https://api.moon369.org/v1/event.ics?moonmark=${path}&name=${q(name)}`,
    google_calendar_url: 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(name) +
      '&dates=' + icsStamp(ms) + '/' + icsStamp(ms + minutes * 60000) + '&details=' + encodeURIComponent(`Moonmark ${mark}\n${url}`),
    embed: `<div data-moon-countdown="${path}" data-name="${name.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}"></div>\n<script src="https://moon369.org/embed/countdown.js" async></script>`,
  };
}

/** An iCalendar file for one event. */
export function eventIcs(name: string, unixNs: bigint, minutes = 60): string {
  const e = eventLinks(name, unixNs, minutes);
  let h = 7; for (const c of name) h = (h * 31 + c.charCodeAt(0)) | 0;
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Moon//moon369.org//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    `UID:${e.moonmark.replace(/[^0-9]/g, '')}-${Math.abs(h)}@moon369.org`, `DTSTAMP:${icsStamp(Date.now())}`, `DTSTART:${icsStamp(e.unix_ms)}`, `DURATION:PT${minutes}M`,
    `SUMMARY:${icsText(name)}`, `DESCRIPTION:${icsText(`Moonmark ${e.moonmark}\n${e.event_url}`)}`, `URL:${e.event_url}`,
    'END:VEVENT', 'END:VCALENDAR'].join('\r\n') + '\r\n';
}
