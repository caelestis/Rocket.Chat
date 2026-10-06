import type { IMessage } from '@rocket.chat/core-typings';

import { requestTranscription } from './requestTranscription';
import { getVoiceAttachments, transcribeVoiceMessage } from './transcribeVoiceMessage';
import { useTranscriptionsStore } from './transcriptionsStore';
import { fetchDecryptedFiles } from '../files/fetchDecryptedFiles';

jest.mock('../getURL', () => ({ getURL: (path: string) => path }));
jest.mock('../../../app/utils/lib/i18n', () => ({ t: (key: string) => key }));
jest.mock('./requestTranscription', () => ({ requestTranscription: jest.fn() }));
jest.mock('../files/fetchDecryptedFiles', () => {
	const actual = jest.requireActual('../files/fetchDecryptedFiles');
	return { ...actual, fetchDecryptedFiles: jest.fn() };
});

const mockedRequest = jest.mocked(requestTranscription);
const mockedFetch = jest.mocked(fetchDecryptedFiles);

const voice = {
	type: 'file',
	title: 'voice.mp3',
	title_link: '/file-upload/1/voice.mp3',
	audio_url: '/file-upload/1/voice.mp3',
	audio_type: 'audio/mpeg',
};
const image = { type: 'file', title: 'pic.png', title_link: '/file-upload/2/pic.png', image_url: '/file-upload/2/pic.png' };

const message = { _id: 'mid', rid: 'rid', attachments: [image, voice], u: { _id: 'u', username: 'author' } } as unknown as IMessage;

const stored = () => useTranscriptionsStore.getState().byMessage.mid;

beforeEach(() => {
	jest.clearAllMocks();
	useTranscriptionsStore.setState({ byMessage: {} });
	mockedFetch.mockResolvedValue([{ name: 'voice.mp3', type: 'audio/mpeg', blob: new Blob(['audio']) }]);
	mockedRequest.mockResolvedValue('  hello world  ');
});

describe('getVoiceAttachments', () => {
	it('keeps only audio file attachments', () => {
		expect(getVoiceAttachments(message).map((attachment) => attachment.title)).toEqual(['voice.mp3']);
	});
});

describe('transcribeVoiceMessage', () => {
	it('decrypts only the audio, sends it for transcription and keeps the text locally', async () => {
		await expect(transcribeVoiceMessage(message)).resolves.toBe('hello world');

		expect(mockedFetch).toHaveBeenCalledWith(message, [expect.objectContaining({ title: 'voice.mp3' })]);
		expect(mockedRequest).toHaveBeenCalledTimes(1);
		const [sent] = mockedRequest.mock.calls[0];
		expect(sent.name).toBe('voice.mp3');
		expect(sent.type).toBe('audio/mpeg');
		expect(stored()).toEqual({ status: 'done', text: 'hello world' });
	});

	it('marks the message pending while the provider works', async () => {
		let resolveRequest: (text: string) => void = () => undefined;
		mockedRequest.mockImplementation(
			() =>
				new Promise((resolve) => {
					resolveRequest = resolve;
				}),
		);

		const pending = transcribeVoiceMessage(message);
		await Promise.resolve();
		expect(stored()).toEqual({ status: 'pending' });

		resolveRequest('done');
		await pending;
		expect(stored()).toEqual({ status: 'done', text: 'done' });
	});

	it('joins several voice files into one text, one paragraph each', async () => {
		mockedFetch.mockResolvedValue([
			{ name: 'a.mp3', type: 'audio/mpeg', blob: new Blob(['a']) },
			{ name: 'b.mp3', type: 'audio/mpeg', blob: new Blob(['b']) },
		]);
		mockedRequest.mockResolvedValueOnce('first').mockResolvedValueOnce('second');

		await expect(transcribeVoiceMessage(message)).resolves.toBe('first\n\nsecond');
	});

	it('records the failure when the message has no audio or the provider heard nothing', async () => {
		await expect(transcribeVoiceMessage({ ...message, attachments: [image] } as unknown as IMessage)).rejects.toThrow(
			'Transcription_failed',
		);

		mockedRequest.mockResolvedValue('   ');
		await expect(transcribeVoiceMessage(message)).rejects.toThrow('Transcription_empty');
		expect(stored()).toEqual({ status: 'error', error: 'Transcription_empty' });
	});
});
