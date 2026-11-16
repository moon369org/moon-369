/* Moon look-alike hashes for video and audio, computed in the browser. Files never leave the device.

   Video ("v:" + 16 hex): nine frames from 10% to 90% of the clip, drawn into a 3 × 3 mosaic, then the same
   64-bit difference hash Moon uses for images. Survives re-encoding, resizing and recompression.
   Audio ("a:" + 16 hex): the clip's middle 80% split into nine slices, the energy in eight frequency bands
   per slice, and one bit per band and step saying whether that band got louder. Survives re-encoding,
   lower bitrates and volume changes.
   Both kinds are only ever compared with their own kind. A trimmed or re-cut copy will not match. MIT. */
(function (root) {
  if (root.MoonMediaHash) return;

  // The image hash: drawn on black, averaged over exact 9 × 8 blocks, one bit per block vs its right neighbour.
  function dhashCanvas(cv) {
    var W = cv.width, H = cv.height, d = cv.getContext('2d').getImageData(0, 0, W, H).data, g = new Float64Array(72), n = new Float64Array(72);
    for (var y = 0; y < H; y++) { var cy = Math.min(7, Math.floor(y * 8 / H)); for (var x = 0; x < W; x++) {
      var c = cy * 9 + Math.min(8, Math.floor(x * 9 / W)), i = (y * W + x) * 4; g[c] += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; n[c]++; } }
    var bits = '';
    for (var r = 0; r < 8; r++) for (var k = 0; k < 8; k++) bits += g[r * 9 + k] / n[r * 9 + k] > g[r * 9 + k + 1] / n[r * 9 + k + 1] ? '1' : '0';
    return hex(bits);
  }
  function hex(bits) { var out = ''; for (var q = 0; q < 64; q += 4) out += parseInt(bits.slice(q, q + 4), 2).toString(16); return out; }

  function video(file) {
    return new Promise(function (ok, no) {
      var v = document.createElement('video'), url = URL.createObjectURL(file), done = false;
      var fail = function () { if (!done) { done = true; URL.revokeObjectURL(url); no(new Error('video')); } };
      v.muted = true; v.preload = 'auto'; v.playsInline = true; v.crossOrigin = 'anonymous';
      v.onerror = fail; setTimeout(fail, 30000);
      v.onloadedmetadata = function () {
        var dur = v.duration;
        if (!isFinite(dur) || dur <= 0 || !v.videoWidth) return fail();
        var cv = document.createElement('canvas'); cv.width = 480; cv.height = 270;
        var x = cv.getContext('2d', { willReadFrequently: true }); x.fillStyle = '#000'; x.fillRect(0, 0, 480, 270);
        x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
        var k = 0;
        var next = function () {
          if (k === 9) { done = true; URL.revokeObjectURL(url); return ok('v:' + dhashCanvas(cv)); }
          var t = dur * (0.1 + 0.8 * k / 8);
          v.onseeked = function () { x.drawImage(v, (k % 3) * 160, Math.floor(k / 3) * 90, 160, 90); k++; next(); };
          v.currentTime = Math.min(t, Math.max(0, dur - 0.05));
        };
        next();
      };
      v.src = url;
    });
  }

  // In-place radix-2 FFT on (re, im).
  function fft(re, im) {
    var n = re.length, i, j = 0, k, len, t;
    for (i = 1; i < n; i++) { var bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (len = 2; len <= n; len <<= 1) {
      var ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (i = 0; i < n; i += len) { var cr = 1, ci = 0;
        for (k = 0; k < len / 2; k++) {
          var ar = re[i + k], ai = im[i + k], br = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, bi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
          re[i + k] = ar + br; im[i + k] = ai + bi; re[i + k + len / 2] = ar - br; im[i + k + len / 2] = ai - bi;
          var nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; } }
    }
  }

  function audio(file) {
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return Promise.reject(new Error('audio'));
    return file.arrayBuffer().then(function (buf) {
      var ctx = new AC();
      return new Promise(function (ok, no) { ctx.decodeAudioData(buf, ok, no); }).then(function (ab) { try { ctx.close(); } catch (e) {} return ab; });
    }).then(function (ab) {
      var sr = ab.sampleRate, len = ab.length, ch = ab.numberOfChannels, mono = new Float32Array(len);
      for (var c = 0; c < ch; c++) { var d = ab.getChannelData(c); for (var i = 0; i < len; i++) mono[i] += d[i] / ch; }
      var N = 2048, start = Math.floor(len * 0.1), span = Math.floor(len * 0.8);
      if (span < N * 9) throw new Error('short');
      // Eight bands, log-spaced from 150 Hz to 6 kHz (capped below Nyquist).
      var lo = 150, hi = Math.min(6000, sr / 2 * 0.9), edges = [];
      for (var b = 0; b <= 8; b++) edges.push(Math.round(lo * Math.pow(hi / lo, b / 8) * N / sr));
      var hann = new Float32Array(N); for (i = 0; i < N; i++) hann[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
      var E = [];
      for (var w = 0; w < 9; w++) {
        var e = new Float64Array(8), s0 = start + Math.floor(span * w / 9), sl = Math.floor(span / 9), frames = Math.min(8, Math.max(1, Math.floor(sl / N)));
        for (var f = 0; f < frames; f++) {
          var off = s0 + Math.floor((sl - N) * (frames === 1 ? 0.5 : f / (frames - 1)));
          var re = new Float64Array(N), im = new Float64Array(N);
          for (i = 0; i < N; i++) re[i] = mono[off + i] * hann[i];
          fft(re, im);
          for (b = 0; b < 8; b++) for (var q = edges[b]; q < Math.max(edges[b] + 1, edges[b + 1]); q++) e[b] += re[q] * re[q] + im[q] * im[q];
        }
        E.push(e);
      }
      var bits = '';
      for (w = 0; w < 8; w++) for (b = 0; b < 8; b++) bits += E[w + 1][b] > E[w][b] ? '1' : '0';
      return 'a:' + hex(bits);
    });
  }

  function kind(file) { return /^video\//.test(file.type) ? 'video' : /^audio\//.test(file.type) ? 'audio' : null; }
  function hash(file) {
    var k = kind(file);
    return (k === 'video' ? video(file) : k === 'audio' ? audio(file) : Promise.resolve(null)).catch(function () { return null; });
  }
  root.MoonMediaHash = { kind: kind, hash: hash, video: video, audio: audio };
})(typeof window !== 'undefined' ? window : globalThis);
