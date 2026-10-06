import { execFile } from 'child_process';
import fs from 'fs';
import { promisify } from 'util';

import { settings } from '../../settings';

const execFileAsync = promisify(execFile);

/** Containers the OpenAI-shaped `audio/transcriptions` endpoint decodes on its own. */
export const PROVIDER_EXTENSIONS = new Set(['flac', 'm4a', 'mp3', 'mp4', 'mpeg', 'mpga', 'oga', 'ogg', 'wav', 'webm']);

export const isProviderExtension = (extension: string | undefined): boolean => !!extension && PROVIDER_EXTENSIONS.has(extension);

export const ffmpegArguments = (input: string, output: string): string[] => [
	'-y',
	'-hide_banner',
	'-loglevel',
	'error',
	'-i',
	input,
	'-vn',
	'-ac',
	'1',
	'-ar',
	'16000',
	'-f',
	'wav',
	output,
];

/**
 * Rewrites an audio file the provider cannot decode (mobile voice messages arrive as raw AAC)
 * into mono 16 kHz WAV next to it, using the ffmpeg binary from the settings.
 * Resolves with the converted file's path; the caller removes it.
 */
export const convertToWav = async (inputPath: string): Promise<string> => {
	const ffmpeg = settings.get<string>('Transcription_FFmpeg_Path') || 'ffmpeg';
	const outputPath = `${inputPath}.wav`;

	try {
		await execFileAsync(ffmpeg, ffmpegArguments(inputPath, outputPath), { timeout: 120_000, maxBuffer: 1024 * 1024 });
	} catch (error: any) {
		await fs.promises.unlink(outputPath).catch(() => undefined);

		if (error?.code === 'ENOENT') {
			throw new Error('error-transcription-ffmpeg-missing');
		}

		throw new Error(`error-transcription-convert: ${String(error?.stderr || error?.message || error).slice(0, 200)}`);
	}

	return outputPath;
};
