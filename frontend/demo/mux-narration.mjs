/**
 * Lays the narration onto the recorded video.
 *
 * Each clip is placed at `atRawMs / speed`, not at a hand-written offset. The
 * encode compresses dead time by exactly `speed`, so dividing the raw timestamp
 * is what keeps a voice locked to its caption whatever the encode settled on.
 * Where a clip would run into the next one it is gently sped up rather than
 * allowed to overlap: two voices at once is unlistenable.
 */
import { execFile } from "node:child_process";
import { readFile, writeFile, rm } from "node:fs/promises";
import { promisify } from "node:util";

const run = promisify(execFile);
const OUT = "demo-out";
const NAR = "demo/narration";

const main = async () => {
  const { speed, cues } = JSON.parse(await readFile(`${OUT}/cues.json`, "utf8"));
  const durations = JSON.parse(await readFile(`${NAR}/durations.json`, "utf8"));

  const placed = cues.map((c, i) => {
    const at = Math.round(c.atRawMs / speed);
    const next = cues[i + 1] ? Math.round(cues[i + 1].atRawMs / speed) : Infinity;
    const room = next - at - 60;
    const spoken = durations[c.id] ?? 0;
    // Up to 12% compression to fit. Past that the voice starts to sound hurried,
    // so let it run long instead and accept a slight lag on the next line.
    const tempo = spoken > room ? Math.min(1.12, spoken / Math.max(room, 1)) : 1;
    return { ...c, at, tempo };
  });

  const inputs = [];
  const filters = [];
  placed.forEach((p, i) => {
    inputs.push("-i", `${NAR}/${p.id}.wav`);
    const chain = [`adelay=${p.at}|${p.at}`];
    if (p.tempo > 1.001) chain.unshift(`atempo=${p.tempo.toFixed(4)}`);
    filters.push(`[${i + 1}:a]${chain.join(",")}[a${i}]`);
  });
  const mixIn = placed.map((_, i) => `[a${i}]`).join("");
  const graph =
    `${filters.join(";")};${mixIn}amix=inputs=${placed.length}:normalize=0[mix];` +
    `[mix]alimiter=limit=0.95,aresample=44100[out]`;

  const script = `${OUT}/filter.txt`;
  await writeFile(script, graph);

  await run("ffmpeg", [
    "-y", "-loglevel", "error",
    "-i", `${OUT}/demo.mp4`, ...inputs,
    "-filter_complex_script", script,
    "-map", "0:v", "-map", "[out]",
    "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-shortest",
    `${OUT}/demo-narrated.mp4`,
  ]);
  await rm(script, { force: true });

  const { stdout } = await run("ffprobe", [
    "-v", "error", "-show_entries",
    "format=duration,size:stream=codec_name,width,height",
    "-of", "default=noprint_wrappers=1", `${OUT}/demo-narrated.mp4`,
  ]);
  const stretched = placed.filter((p) => p.tempo > 1.001);
  console.log(`${OUT}/demo-narrated.mp4`);
  console.log(stdout.trim());
  if (stretched.length) {
    console.log(`\n${stretched.length} clip(s) compressed to fit:`,
                stretched.map((p) => `${p.id}@${p.tempo.toFixed(2)}x`).join(" "));
  }
};

main().catch((err) => { console.error(err); process.exit(1); });
