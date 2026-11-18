// Renders every scene frame by frame in headless Chromium and pipes the frames into ffmpeg.
// usage: node render.js job.json
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

(async () => {
  const job = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const fps = job.fps || 24;
  const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', job.out_video],
    { stdio: ['pipe', 'inherit', 'inherit'] });
  const ffDone = new Promise(r => ff.on('close', r));

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto('file://' + path.resolve(job.template));
  if (job.snap_dir) fs.mkdirSync(job.snap_dir, { recursive: true });

  let frame = 0, t0 = 0;
  for (let i = 0; i < job.scenes.length; i++) {
    const sc = job.scenes[i];
    await page.evaluate(s => window.setup(s), sc);
    // frames are placed on the global clock so audio and video never drift
    const end = Math.round((t0 + sc.dur) * fps);
    const mid = Math.round((t0 + sc.dur * 0.6) * fps);
    for (; frame < end; frame++) {
      const t = frame / fps - t0;
      await page.evaluate(x => window.seek(x), t);
      const buf = await page.screenshot({ type: 'jpeg', quality: 92 });
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
      if (job.snap_dir && frame === mid) fs.writeFileSync(path.join(job.snap_dir, `scene${String(i).padStart(2, '0')}.jpg`), buf);
    }
    t0 += sc.dur;
    process.stdout.write(`  rendered scene ${i + 1}/${job.scenes.length}\n`);
  }
  ff.stdin.end();
  await ffDone;
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
