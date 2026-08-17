import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import ffmpegPath from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);
const ffprobePath = ffprobeStatic?.path || '';

function extensionFromMime(mimeType) {
  const value = String(mimeType || '').toLowerCase();
  if (value === 'video/mp4') return '.mp4';
  if (value === 'video/webm') return '.webm';
  if (value === 'video/quicktime') return '.mov';
  if (value === 'audio/mpeg') return '.mp3';
  if (value === 'audio/wav' || value === 'audio/x-wav') return '.wav';
  if (value === 'audio/mp4' || value === 'audio/x-m4a') return '.m4a';
  if (value === 'audio/ogg') return '.ogg';
  if (value === 'image/jpeg') return '.jpg';
  if (value === 'image/webp') return '.webp';
  if (value === 'image/gif') return '.gif';
  return '.png';
}

async function runFfprobe(filePath) {
  if (!ffprobePath) throw new Error('FFPROBE_NOT_AVAILABLE');
  const { stdout } = await execFileAsync(ffprobePath, [
    '-v', 'error',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    filePath
  ], { maxBuffer: 8 * 1024 * 1024, windowsHide: true });
  return JSON.parse(stdout || '{}');
}

function secondsToMilliseconds(value) {
  const seconds = Number(value || 0);
  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : 0;
}

function normalizeProbe(probe, mediaType) {
  const streams = Array.isArray(probe?.streams) ? probe.streams : [];
  const video = streams.find((stream) => stream.codec_type === 'video');
  const audio = streams.find((stream) => stream.codec_type === 'audio');
  const durationMs = secondsToMilliseconds(probe?.format?.duration || video?.duration || audio?.duration);
  return {
    width: mediaType === 'video' ? Number(video?.width || 0) : 0,
    height: mediaType === 'video' ? Number(video?.height || 0) : 0,
    durationMs,
    metadata: {
      formatName: probe?.format?.format_name || '',
      bitrate: Number(probe?.format?.bit_rate || 0),
      videoCodec: video?.codec_name || '',
      audioCodec: audio?.codec_name || '',
      frameRate: video?.avg_frame_rate || video?.r_frame_rate || '',
      sampleRate: Number(audio?.sample_rate || 0),
      channels: Number(audio?.channels || 0)
    }
  };
}

async function processImage(bytes) {
  const image = sharp(bytes, { animated: false, failOn: 'none' });
  const metadata = await image.metadata();
  const [thumbnail, preview] = await Promise.all([
    image.clone().rotate().resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toBuffer(),
    image.clone().rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 86 }).toBuffer()
  ]);
  return {
    width: Number(metadata.width || 0),
    height: Number(metadata.height || 0),
    durationMs: 0,
    metadata: {
      format: metadata.format || '',
      hasAlpha: Boolean(metadata.hasAlpha),
      orientation: Number(metadata.orientation || 0)
    },
    variants: [
      { type: 'thumbnail', bytes: thumbnail, mimeType: 'image/webp', extension: 'webp' },
      { type: 'preview', bytes: preview, mimeType: 'image/webp', extension: 'webp' }
    ]
  };
}

async function processVideo(bytes, mimeType) {
  if (!ffmpegPath) throw new Error('FFMPEG_NOT_AVAILABLE');
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pic365-video-'));
  const inputPath = path.join(tempRoot, `input${extensionFromMime(mimeType)}`);
  const previewPath = path.join(tempRoot, 'preview.mp4');
  const posterPath = path.join(tempRoot, 'poster.webp');
  try {
    await fs.writeFile(inputPath, bytes);
    const probe = await runFfprobe(inputPath);
    await execFileAsync(ffmpegPath, [
      '-y', '-i', inputPath,
      '-vf', "scale='min(1280,iw)':-2,pad=ceil(iw/2)*2:ceil(ih/2)*2",
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '25',
      '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart',
      previewPath
    ], { maxBuffer: 16 * 1024 * 1024, windowsHide: true });
    await execFileAsync(ffmpegPath, [
      '-y', '-ss', '0.1', '-i', inputPath,
      '-frames:v', '1',
      '-vf', 'scale=960:-2:force_original_aspect_ratio=decrease',
      posterPath
    ], { maxBuffer: 8 * 1024 * 1024, windowsHide: true });
    const [preview, poster] = await Promise.all([fs.readFile(previewPath), fs.readFile(posterPath)]);
    return {
      ...normalizeProbe(probe, 'video'),
      variants: [
        { type: 'preview', bytes: preview, mimeType: 'video/mp4', extension: 'mp4' },
        { type: 'poster', bytes: poster, mimeType: 'image/webp', extension: 'webp' },
        { type: 'thumbnail', bytes: poster, mimeType: 'image/webp', extension: 'webp' }
      ]
    };
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

function waveformFromPcm(bytes, points = 320) {
  if (!bytes?.length) return [];
  const samples = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
  const chunkSize = Math.max(1, Math.floor(samples.length / points));
  const waveform = [];
  for (let offset = 0; offset < samples.length; offset += chunkSize) {
    let peak = 0;
    const end = Math.min(samples.length, offset + chunkSize);
    for (let index = offset; index < end; index += 1) peak = Math.max(peak, Math.abs(samples[index]));
    waveform.push(Number((peak / 32768).toFixed(4)));
    if (waveform.length >= points) break;
  }
  return waveform;
}

async function processAudio(bytes, mimeType) {
  if (!ffmpegPath) throw new Error('FFMPEG_NOT_AVAILABLE');
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pic365-audio-'));
  const inputPath = path.join(tempRoot, `input${extensionFromMime(mimeType)}`);
  const previewPath = path.join(tempRoot, 'preview.mp3');
  const pcmPath = path.join(tempRoot, 'waveform.pcm');
  try {
    await fs.writeFile(inputPath, bytes);
    const probe = await runFfprobe(inputPath);
    await execFileAsync(ffmpegPath, [
      '-y', '-i', inputPath,
      '-vn', '-c:a', 'libmp3lame', '-b:a', '160k',
      previewPath
    ], { maxBuffer: 8 * 1024 * 1024, windowsHide: true });
    await execFileAsync(ffmpegPath, [
      '-y', '-i', inputPath,
      '-vn', '-ac', '1', '-ar', '8000', '-f', 's16le',
      pcmPath
    ], { maxBuffer: 8 * 1024 * 1024, windowsHide: true });
    const [preview, pcm] = await Promise.all([fs.readFile(previewPath), fs.readFile(pcmPath)]);
    const waveform = Buffer.from(JSON.stringify(waveformFromPcm(pcm)));
    return {
      ...normalizeProbe(probe, 'audio'),
      variants: [
        { type: 'preview', bytes: preview, mimeType: 'audio/mpeg', extension: 'mp3' },
        { type: 'waveform', bytes: waveform, mimeType: 'application/json', extension: 'json' }
      ]
    };
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

export async function processMediaAsset({ bytes, mimeType, mediaType }) {
  if (mediaType === 'image') return processImage(bytes);
  if (mediaType === 'video') return processVideo(bytes, mimeType);
  if (mediaType === 'audio') return processAudio(bytes, mimeType);
  throw new Error('UNSUPPORTED_MEDIA_TYPE');
}
