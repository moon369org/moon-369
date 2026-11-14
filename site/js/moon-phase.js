/*
 * True moon phase for any instant, from the Moon's real position.
 *
 * Moon's months follow the mean lunation (that is the standard), but the real
 * moon speeds up and slows down along its elliptical orbit, so the sky can run
 * up to about 14 hours ahead of or behind the mean. Everything that *shows* a
 * phase uses this function so the icon matches the moon outside.
 *
 * Method: elongation of the Moon from the Sun with the principal periodic
 * terms (Meeus, Astronomical Algorithms, ch. 47-49). Quarter-phase instants
 * land within about 15 minutes of published times.
 *
 *   MoonPhase.fraction(ms)      0 = new, 0.25 = first quarter, 0.5 = full, 0.75 = last quarter
 *   MoonPhase.illumination(ms)  0..1 fraction of the disc lit
 *   MoonPhase.name(fraction)    "Waxing crescent", ...
 *   MoonPhase.path(fraction, r) SVG path of the lit part for a disc of radius r
 */
(function (root) {
  const RAD = Math.PI / 180;
  const sin = (d) => Math.sin(d * RAD);
  const norm = (d) => ((d % 360) + 360) % 360;

  function elongation(ms) {
    const jd = ms / 86400000 + 2440587.5;
    const T = (jd - 2451545.0) / 36525;
    const D = norm(297.8501921 + 445267.1114034 * T - 0.0018819 * T * T + T * T * T / 545868);
    const M = norm(357.5291092 + 35999.0502909 * T - 0.0001536 * T * T);
    const Mp = norm(134.9633964 + 477198.8675055 * T + 0.0087414 * T * T + T * T * T / 69699);
    const F = norm(93.2720950 + 483202.0175233 * T - 0.0036539 * T * T);
    const E = 1 - 0.002516 * T - 0.0000074 * T * T;
    // Moon longitude perturbations minus the Sun's equation of center, in degrees.
    const moon =
      6.288774 * sin(Mp) + 1.274027 * sin(2 * D - Mp) + 0.658314 * sin(2 * D) +
      0.213618 * sin(2 * Mp) - 0.185116 * E * sin(M) - 0.114332 * sin(2 * F) +
      0.058793 * sin(2 * D - 2 * Mp) + 0.057066 * E * sin(2 * D - M - Mp) +
      0.053322 * sin(2 * D + Mp) + 0.045758 * E * sin(2 * D - M) -
      0.040923 * E * sin(M - Mp) - 0.034720 * sin(D) - 0.030383 * E * sin(M + Mp) +
      0.015327 * sin(2 * D - 2 * F) - 0.012528 * sin(Mp + 2 * F) + 0.010980 * sin(Mp - 2 * F) +
      0.010675 * sin(4 * D - Mp) + 0.010034 * sin(3 * Mp) + 0.008548 * sin(4 * D - 2 * Mp);
    const sun = (1.914602 - 0.004817 * T) * sin(M) + 0.019993 * sin(2 * M) + 0.000289 * sin(3 * M);
    return norm(D + moon - sun);
  }

  const fraction = (ms) => elongation(ms) / 360;
  const cos = (d) => Math.cos(d * RAD);
  // Lit fraction from the true phase angle: Moon latitude and the Earth-Moon and
  // Earth-Sun distances (Meeus ch. 47-48). Matches PyEphem within 0.05 points.
  function illumination(ms) {
    const T = (ms / 86400000 + 2440587.5 - 2451545.0) / 36525;
    const D = norm(297.8501921 + 445267.1114034 * T - 0.0018819 * T * T + T * T * T / 545868);
    const M = norm(357.5291092 + 35999.0502909 * T - 0.0001536 * T * T);
    const Mp = norm(134.9633964 + 477198.8675055 * T + 0.0087414 * T * T + T * T * T / 69699);
    const F = norm(93.2720950 + 483202.0175233 * T - 0.0036539 * T * T);
    const E = 1 - 0.002516 * T - 0.0000074 * T * T;
    const beta = 5.128122 * sin(F) + 0.280602 * sin(Mp + F) + 0.277693 * sin(Mp - F) + 0.173237 * sin(2 * D - F) +
      0.055413 * sin(2 * D - Mp + F) + 0.046271 * sin(2 * D - Mp - F) + 0.032573 * sin(2 * D + F) + 0.017198 * sin(2 * Mp + F);
    const dist = 385000.56 - 20905.355 * cos(Mp) - 3699.111 * cos(2 * D - Mp) - 2955.968 * cos(2 * D) - 569.925 * cos(2 * Mp) +
      48.888 * E * cos(M) - 3.149 * cos(2 * F) + 246.158 * cos(2 * D - 2 * Mp) - 152.138 * E * cos(2 * D - M - Mp) -
      170.733 * cos(2 * D + Mp) - 204.586 * E * cos(2 * D - M) - 129.620 * E * cos(M - Mp) + 108.743 * cos(D) + 104.755 * E * cos(M + Mp);
    const R = 149597870.7 * (1.000140 - 0.016708 * cos(M) - 0.000141 * cos(2 * M));
    const psi = Math.acos(Math.max(-1, Math.min(1, cos(beta) * cos(elongation(ms)))));
    const i = Math.atan2(R * Math.sin(psi), dist - R * Math.cos(psi));
    return (1 + Math.cos(i)) / 2;
  }
  const NAMES = ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];
  const name = (f) => NAMES[Math.floor((f * 8 + 0.5) % 8)];
  function path(f, r = 10) {
    const k = Math.cos(2 * Math.PI * f), waxing = f < 0.5;
    const outer = waxing ? 1 : 0, inner = (waxing === (k > 0)) ? 0 : 1, rx = Math.abs(k) * r;
    return 'M0,-' + r + ' A' + r + ',' + r + ' 0 0 ' + outer + ' 0,' + r + ' A' + rx.toFixed(3) + ',' + r + ' 0 0 ' + inner + ' 0,-' + r + 'Z';
  }

  const api = { elongation, fraction, illumination, name, path };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MoonPhase = api;
})(typeof window !== 'undefined' ? window : globalThis);
