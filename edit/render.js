#!/usr/bin/env node
/*
 * Render the Comet Edit to a 9:16 MP4 (720x1280, 60fps) with a synced beat track.
 *   node edit/render.js [out.mp4] [--fps 60] [--title "NAME"] [--sub "ROLE"] [--music track.mp3]
 * Needs: playwright (chromium) and ffmpeg on PATH.
 */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);
const flag = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const out = args[0] && !args[0].startsWith('--') ? args[0] : 'comet-edit.mp4';
const fps = +flag('--fps', 60);
const title = flag('--title', 'ADINATH PATADE');
const sub = flag('--sub', 'VIDEO EDITOR');
const music = flag('--music', null);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file://' + path.join(__dirname, 'index.html') + '?still=0');
  const { duration, bpm } = await page.evaluate(([title, sub]) => {
    window.edit.pause();
    const c = document.createElement('canvas'); c.width = 720; c.height = 1280;
    window.R = new CometEdit(c, { title, subtitle: sub });
    window.RC = c;
    return { duration: R.duration, bpm: R.o.bpm };
  }, [title, sub]);

  // Audio: your own track, or a synthesized kick-on-every-cut + pad.
  const beat = 60 / bpm;
  const audioIn = music
    ? ['-i', music]
    : ['-f', 'lavfi', '-i',
       `aevalsrc='0.8*sin(2*PI*(42+100*exp(-mod(t,${beat})*18))*mod(t,${beat}))*exp(-mod(t,${beat})*9)` +
       `+0.05*(sin(2*PI*220*t)+sin(2*PI*277.18*t)+sin(2*PI*329.63*t)+sin(2*PI*415.3*t))*(0.6+0.4*sin(2*PI*t/${beat * 4}))'` +
       `:s=48000:d=${duration}`];

  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    ...audioIn,
    '-map', '0:v', '-map', '1:a', '-t', String(duration),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium',
    '-c:a', 'aac', '-b:a', '192k', '-af', `afade=t=out:st=${duration - 0.6}:d=0.6`,
    '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });

  const frames = Math.round(duration * fps);
  for (let i = 0; i < frames; i++) {
    const b64 = await page.evaluate(t => { R.renderFrame(t); return RC.toDataURL('image/jpeg', 0.92).split(',')[1]; }, i / fps);
    if (!ff.stdin.write(Buffer.from(b64, 'base64'))) await new Promise(r => ff.stdin.once('drain', r));
    if (i % fps === 0) process.stdout.write(`\rframe ${i}/${frames}`);
  }
  ff.stdin.end();
  await new Promise((res, rej) => ff.on('close', c => (c ? rej(new Error('ffmpeg ' + c)) : res())));
  await browser.close();
  console.log(`\nwrote ${out}`);
})();
