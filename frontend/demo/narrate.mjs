/**
 * Narration, generated before anything is recorded.
 *
 * Audio first, always. The recorder sizes every caption window to
 * max(written, spoken + 450ms), which it can only do if the clips already
 * exist and have been measured. Guessing a caption length and hoping the voice
 * fits desynchronises the whole video the moment one line runs long.
 *
 *   node demo/narrate.mjs              macOS say, default voice
 *   node demo/narrate.mjs --voice Daniel
 *   node demo/narrate.mjs --eleven     ElevenLabs, needs ELEVENLABS_API_KEY
 */
import { execFile } from "node:child_process";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { promisify } from "node:util";

import { BEATS } from "./script.mjs";

const run = promisify(execFile);
const DIR = "demo/narration";
const args = process.argv.slice(2);
const useEleven = args.includes("--eleven");
const voice = args[args.indexOf("--voice") + 1] ?? "Daniel";
const ELEVEN_VOICE = process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM";

async function duration(file) {
  const { stdout } = await run("ffprobe", [
    "-v", "error", "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1", file,
  ]);
  return Math.round(parseFloat(stdout.trim()) * 1000);
}

async function sayClip(text, out) {
  // `say` writes AIFF; everything downstream wants a uniform WAV.
  const aiff = `${out}.aiff`;
  // No --data-format: this build of `say` rejects explicit format strings with
  // "Opening output file failed: fmt?". Its default AIFF is fine, and ffmpeg
  // normalises it on the next line anyway.
  await run("say", ["-v", voice, "-o", aiff, text]);
  await run("ffmpeg", ["-y", "-loglevel", "error", "-i", aiff,
                       "-ar", "44100", "-ac", "1", out]);
  await rm(aiff, { force: true });
}

async function elevenClip(text, out) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY is not set");
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE}`,
    { method: "POST",
      headers: { "xi-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        text, model_id: "eleven_turbo_v2_5",
        voice_settings: { stability: 0.45, similarity_boost: 0.75 },
      }) });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
  const mp3 = `${out}.mp3`;
  await writeFile(mp3, Buffer.from(await res.arrayBuffer()));
  await run("ffmpeg", ["-y", "-loglevel", "error", "-i", mp3,
                       "-ar", "44100", "-ac", "1", out]);
  await rm(mp3, { force: true });
}

const main = async () => {
  await mkdir(DIR, { recursive: true });
  const durations = {};
  let total = 0;

  for (const beat of BEATS) {
    const out = `${DIR}/${beat.id}.wav`;
    if (useEleven) await elevenClip(beat.text, out);
    else await sayClip(beat.text, out);
    durations[beat.id] = await duration(out);
    total += durations[beat.id];
    process.stdout.write(
      `  ${beat.id}  ${String(durations[beat.id]).padStart(5)}ms  ${beat.text.slice(0, 58)}\n`);
  }

  await writeFile(`${DIR}/durations.json`, JSON.stringify(durations, null, 2));
  console.log(`\n${BEATS.length} clips, ${(total / 1000).toFixed(1)}s of speech.`);
  console.log(`Written to ${DIR}/durations.json`);
};

main().catch((err) => { console.error(err); process.exit(1); });
