import type { IMessage } from '@rocket.chat/core-typings';

import { fetchDecryptedFiles, getFileAttachments } from './fetchDecryptedFiles';

jest.mock('../getURL', () => ({ getURL: (path: string) => path }));
jest.mock('../../../app/utils/lib/i18n', () => ({ t: (key: string) => key }));

// jsdom's Blob has no text(); FileReader is the portable way to read it back.
const readBlob = (blob: Blob): Promise<string> =>
	new Promise((resolve) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.readAsText(blob);
	});

const decryptSpy = jest.fn(async () => new TextEncoder().encode('decrypted bytes').buffer);

beforeEach(() => {
	jest.clearAllMocks();
	Object.defineProperty(globalThis, 'crypto', {
		configurable: true,
		value: { subtle: { importKey: jest.fn(async () => 'crypto-key'), decrypt: decryptSpy } },
	});
	global.fetch = jest.fn(async () => ({
		ok: true,
		headers: new Headers({ 'content-type': 'application/octet-stream' }),
		arrayBuffer: async () => new TextEncoder().encode('stored bytes').buffer,
	})) as unknown as typeof fetch;
});

describe('getFileAttachments', () => {
	it('keeps only file attachments that still point at a stored file', () => {
		const message = {
			attachments: [
				{ type: 'file', title: 'a.png', title_link: '/file-upload/1/a.png' },
				{ type: 'file', title: 'removed.png' },
				{ color: '#f00', text: 'not a file' },
			],
		} as unknown as IMessage;

		expect(getFileAttachments(message).map((attachment) => attachment.title)).toEqual(['a.png']);
	});
});

describe('fetchDecryptedFiles', () => {
	it('fetches the stored file behind the decrypting link and decrypts it with the attachment key', async () => {
		const message = {
			attachments: [
				{
					type: 'file',
					title: 'voice.mp3',
					title_link: '/file-decrypt/file-upload/abc/voice.mp3?key=secret',
					audio_url: '/file-decrypt/file-upload/abc/voice.mp3?key=secret',
					audio_type: 'audio/mpeg',
					encryption: { key: { kty: 'oct', k: 'k' }, iv: 'aXY=' },
				},
			],
		} as unknown as IMessage;

		const [file] = await fetchDecryptedFiles(message);

		expect(global.fetch).toHaveBeenCalledWith('/file-upload/abc/voice.mp3', { credentials: 'include' });
		expect(decryptSpy).toHaveBeenCalledWith(expect.objectContaining({ name: 'AES-CTR', length: 64 }), 'crypto-key', expect.anything());
		expect(file).toMatchObject({ name: 'voice.mp3', type: 'audio/mpeg' });
		expect(await readBlob(file.blob)).toBe('decrypted bytes');
	});

	it('keeps a plain upload as is and takes its caption from the attachment', async () => {
		const message = {
			attachments: [{ type: 'file', title: 'doc.pdf', title_link: '/file-upload/def/doc.pdf', description: 'the doc' }],
		} as unknown as IMessage;

		const [file] = await fetchDecryptedFiles(message);

		expect(decryptSpy).not.toHaveBeenCalled();
		expect(file).toMatchObject({ name: 'doc.pdf', type: 'application/octet-stream', description: 'the doc' });
		expect(await readBlob(file.blob)).toBe('stored bytes');
	});

	it('fetches only the attachments it is given', async () => {
		const message = {
			attachments: [
				{ type: 'file', title: 'a.txt', title_link: '/file-upload/1/a.txt' },
				{ type: 'file', title: 'b.txt', title_link: '/file-upload/2/b.txt' },
			],
		} as unknown as IMessage;

		const files = await fetchDecryptedFiles(message, [getFileAttachments(message)[1]]);

		expect(files.map((file) => file.name)).toEqual(['b.txt']);
	});
});
