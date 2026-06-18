import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

// `@ffmpeg-installer/ffmpeg` ships a static ffmpeg binary across platforms.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg') as {
  path: string;
};

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegInstaller.path, args, { stdio: 'pipe' });
    let stderr = '';
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with ${code}: ${stderr}`));
    });
  });
}

/**
 * Extract one frame (taken from around the 2-second mark to skip black
 * intros) and the audio track from the given video bytes. Returns both
 * as Buffers along with a tmp dir cleanup callback.
 */
export async function extractFrameAndAudio(
  videoBytes: Buffer,
  videoExt = 'mp4',
): Promise<{ frame: Buffer; audio: Buffer; audioMime: string }> {
  const work = await mkdtemp(path.join(tmpdir(), 'companybrain-'));
  const inPath = path.join(work, `in.${videoExt}`);
  const framePath = path.join(work, 'frame.jpg');
  const audioPath = path.join(work, 'audio.mp3');
  try {
    await writeFile(inPath, videoBytes);
    await runFfmpeg([
      '-y',
      '-ss', '00:00:02',
      '-i', inPath,
      '-frames:v', '1',
      '-q:v', '2',
      framePath,
    ]);
    await runFfmpeg([
      '-y',
      '-i', inPath,
      '-vn',
      '-acodec', 'libmp3lame',
      '-q:a', '2',
      audioPath,
    ]);
    const frame = await readFile(framePath);
    const audio = await readFile(audioPath);
    return { frame, audio, audioMime: 'audio/mpeg' };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
