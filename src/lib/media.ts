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
 * intros) from the given video bytes, for use as the brain's cover image.
 *
 * NOTE: 旧実装はここで音声トラック(mp3)も抽出していたが、抽出先だった
 * D-ID の音声クローン連携が廃止されて以降は捨てられるだけだったため削除
 * した(アップロードごとの無駄な変換時間を削減)。Gemini TTS の音声
 * クローン(30秒サンプル)を実装する際は、目的を明確にした抽出処理を
 * 改めて追加すること。
 */
export async function extractCoverFrame(
  videoBytes: Buffer,
  videoExt = 'mp4',
): Promise<{ frame: Buffer }> {
  const work = await mkdtemp(path.join(tmpdir(), 'companybrain-'));
  const inPath = path.join(work, `in.${videoExt}`);
  const framePath = path.join(work, 'frame.jpg');
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
    const frame = await readFile(framePath);
    return { frame };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
