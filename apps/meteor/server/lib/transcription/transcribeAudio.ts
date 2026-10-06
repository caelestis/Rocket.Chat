import { serverFetch } from '@rocket.chat/server-fetch';

import { settings } from '../../settings';
import { SystemLogger } from '../logger/system';

const PROVIDER_BASE_URLS: Record<string, string> = {
	openai: 'https://api.openai.com/v1',
	groq: 'https://api.groq.com/openai/v1',
};

type AudioInput = {
	data: Buffer;
	filename: string;
	mimetype: string;
};

type MultipartPart = { name: string; value: string } | { name: string; filename: string; type: string; data: Buffer };

const CRLF = '\r\n';

/** Encodes form fields the way an HTML form would, since node-fetch v2 has no FormData of its own. */
export const encodeMultipart = (parts: MultipartPart[]): { body: Buffer; contentType: string } => {
	const boundary = `----RocketChatTranscription${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;

	const chunks = parts.flatMap((part) => {
		const head = `--${boundary}${CRLF}Content-Disposition: form-data; name="${part.name}"`;

		if ('value' in part) {
			return [Buffer.from(`${head}${CRLF}${CRLF}${part.value}${CRLF}`)];
		}

		return [
			Buffer.from(`${head}; filename="${part.filename}"${CRLF}Content-Type: ${part.type || 'application/octet-stream'}${CRLF}${CRLF}`),
			part.data,
			Buffer.from(CRLF),
		];
	});

	chunks.push(Buffer.from(`--${boundary}--${CRLF}`));

	return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
};

const EXTENSION_BY_MIMETYPE: Record<string, string> = {
	'audio/mpeg': 'mp3',
	'audio/mp3': 'mp3',
	'audio/mp4': 'm4a',
	'audio/x-m4a': 'm4a',
	'audio/ogg': 'ogg',
	'audio/webm': 'webm',
	'audio/wav': 'wav',
	'audio/x-wav': 'wav',
	'audio/flac': 'flac',
	'video/mp4': 'mp4',
	'video/webm': 'webm',
};

/** The container found in the first bytes, which is what the provider actually decodes. */
export const sniffAudioExtension = (data: Buffer): string | undefined => {
	const head = data.subarray(0, 12);
	const ascii = head.toString('latin1');

	if (ascii.startsWith('ID3') || (head[0] === 0xff && (head[1] & 0xe6) === 0xe2)) {
		return 'mp3';
	}
	if (head[0] === 0xff && (head[1] & 0xf6) === 0xf0) {
		return 'aac';
	}
	if (ascii.startsWith('OggS')) {
		return 'ogg';
	}
	if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) {
		return 'webm';
	}
	if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WAVE') {
		return 'wav';
	}
	if (ascii.startsWith('fLaC')) {
		return 'flac';
	}
	if (ascii.slice(4, 8) === 'ftyp') {
		return 'm4a';
	}
	return undefined;
};

/**
 * The name the provider sees. Providers pick the decoder from the extension and some choke
 * on non-ASCII names, so the original name is reduced to a plain `audio.<ext>`.
 */
export const providerFileName = (filename: string, mimetype: string, data?: Buffer): string => {
	const fromName = /\.([a-z0-9]{2,4})$/i.exec(filename)?.[1]?.toLowerCase();
	const extension = (data && sniffAudioExtension(data)) ?? EXTENSION_BY_MIMETYPE[mimetype.toLowerCase()] ?? fromName ?? 'mp3';

	return `audio.${extension}`;
};

export const getTranscriptionBaseUrl = (): string => {
	const provider = settings.get<string>('Transcription_Provider');
	const url = PROVIDER_BASE_URLS[provider] ?? settings.get<string>('Transcription_Base_URL');

	return url.replace(/\/+$/, '');
};

/**
 * Sends an audio file to the configured OpenAI-compatible `audio/transcriptions` endpoint
 * and returns the recognised text. The audio is never stored here.
 */
export const transcribeAudio = async ({ data, filename, mimetype }: AudioInput): Promise<string> => {
	const apiKey = settings.get<string>('Transcription_API_Key');
	const model = settings.get<string>('Transcription_Model');
	const language = settings.get<string>('Transcription_Language');

	if (!model) {
		throw new Error('error-transcription-not-configured');
	}

	if (!sniffAudioExtension(data)) {
		SystemLogger.warn({
			msg: 'Transcription: audio container not recognised, sending as declared',
			filename,
			mimetype,
			size: data.length,
			head: data.subarray(0, 16).toString('hex'),
		});
	}

	const { body, contentType } = encodeMultipart([
		{ name: 'model', value: model },
		{ name: 'response_format', value: 'json' },
		...(language ? [{ name: 'language', value: language }] : []),
		{ name: 'file', filename: providerFileName(filename, mimetype, data), type: mimetype, data },
	]);

	const response = await serverFetch(`${getTranscriptionBaseUrl()}/audio/transcriptions`, {
		method: 'POST',
		headers: {
			'Content-Type': contentType,
			...(apiKey && { Authorization: `Bearer ${apiKey}` }),
		},
		body,
		ignoreSsrfValidation: false,
		allowList: settings.get<string>('SSRF_Allowlist'),
	});

	const text = await response.text();

	if (!response.ok) {
		throw new Error(`error-transcription-provider: ${response.status} ${text.slice(0, 200)}`);
	}

	const parsed = JSON.parse(text) as { text?: unknown };

	if (typeof parsed.text !== 'string') {
		throw new Error('error-transcription-provider: unexpected response');
	}

	return parsed.text;
};
