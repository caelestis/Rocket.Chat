import { expect } from 'chai';
import { beforeEach, describe, it } from 'mocha';
import proxyquire from 'proxyquire';
import sinon from 'sinon';

const settingsGet = sinon.stub();
const serverFetch = sinon.stub();

const { transcribeAudio, encodeMultipart, getTranscriptionBaseUrl, providerFileName, sniffAudioExtension } = proxyquire
	.noCallThru()
	.load('./transcribeAudio', {
		'@rocket.chat/server-fetch': { serverFetch },
		'../../settings': { settings: { get: settingsGet } },
		'../logger/system': { SystemLogger: { warn: sinon.stub() } },
	});

const settingsByDefault: Record<string, unknown> = {
	Transcription_Provider: 'openai',
	Transcription_Base_URL: 'http://whisper.local:8000/v1/',
	Transcription_API_Key: 'sk-test',
	Transcription_Model: 'whisper-1',
	Transcription_Language: '',
	SSRF_Allowlist: '',
};

const withSettings = (overrides: Record<string, unknown>) =>
	settingsGet.callsFake((key: string) => (key in overrides ? overrides[key] : settingsByDefault[key]));

const okResponse = (payload: unknown) => ({ ok: true, status: 200, text: async () => JSON.stringify(payload) });

describe('transcribeAudio', () => {
	beforeEach(() => {
		settingsGet.reset();
		withSettings({});
		serverFetch.reset();
		serverFetch.resolves(okResponse({ text: 'hello' }));
	});

	describe('getTranscriptionBaseUrl', () => {
		it('uses the preset for a known provider and the custom URL otherwise, without a trailing slash', () => {
			expect(getTranscriptionBaseUrl()).to.equal('https://api.openai.com/v1');

			withSettings({ Transcription_Provider: 'groq' });
			expect(getTranscriptionBaseUrl()).to.equal('https://api.groq.com/openai/v1');

			withSettings({ Transcription_Provider: 'custom' });
			expect(getTranscriptionBaseUrl()).to.equal('http://whisper.local:8000/v1');
		});
	});

	describe('providerFileName', () => {
		it('derives an ASCII name with the extension the provider expects', () => {
			expect(providerFileName('Аудиозапись.mp3', 'audio/mpeg')).to.equal('audio.mp3');
			expect(providerFileName('voice', 'audio/ogg')).to.equal('audio.ogg');
			expect(providerFileName('clip.WEBM', 'application/octet-stream')).to.equal('audio.webm');
			expect(providerFileName('noext', 'application/octet-stream')).to.equal('audio.mp3');
		});
	});

	describe('sniffAudioExtension', () => {
		it('recognises the common containers by their first bytes', () => {
			expect(sniffAudioExtension(Buffer.from('ID3\x04\x00'))).to.equal('mp3');
			expect(sniffAudioExtension(Buffer.from([0xff, 0xfb, 0x90, 0x00]))).to.equal('mp3');
			expect(sniffAudioExtension(Buffer.from([0xff, 0xf9, 0x50, 0xa0]))).to.equal('aac');
			expect(sniffAudioExtension(Buffer.from([0xff, 0xf1, 0x50, 0x80]))).to.equal('aac');
			expect(sniffAudioExtension(Buffer.from('OggS\x00'))).to.equal('ogg');
			expect(sniffAudioExtension(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x00]))).to.equal('webm');
			expect(sniffAudioExtension(Buffer.from('RIFF\x00\x00\x00\x00WAVEfmt '))).to.equal('wav');
			expect(sniffAudioExtension(Buffer.from('fLaC'))).to.equal('flac');
			expect(sniffAudioExtension(Buffer.from('\x00\x00\x00\x18ftypM4A '))).to.equal('m4a');
			expect(sniffAudioExtension(Buffer.from('random bytes'))).to.equal(undefined);
		});

		it('wins over the declared type when naming the file for the provider', () => {
			expect(providerFileName('voice.mp3', 'audio/mpeg', Buffer.from('OggS\x00'))).to.equal('audio.ogg');
		});
	});

	describe('encodeMultipart', () => {
		it('encodes text fields and the file as one multipart body', () => {
			const { body, contentType } = encodeMultipart([
				{ name: 'model', value: 'whisper-1' },
				{ name: 'file', filename: 'voice.mp3', type: 'audio/mpeg', data: Buffer.from('AUDIO') },
			]);
			const boundary = contentType.replace('multipart/form-data; boundary=', '');
			const text = body.toString();

			expect(text).to.include(`--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-1\r\n`);
			expect(text).to.include(
				`Content-Disposition: form-data; name="file"; filename="voice.mp3"\r\nContent-Type: audio/mpeg\r\n\r\nAUDIO\r\n`,
			);
			expect(text.endsWith(`--${boundary}--\r\n`)).to.be.true;
		});
	});

	it('posts the audio to the provider with the key and model and returns the recognised text', async () => {
		const text = await transcribeAudio({ data: Buffer.from('AUDIO'), filename: 'Аудиозапись.mp3', mimetype: 'audio/mpeg' });

		expect(text).to.equal('hello');
		expect(serverFetch.calledOnce).to.be.true;
		const [url, options] = serverFetch.firstCall.args;
		expect(url).to.equal('https://api.openai.com/v1/audio/transcriptions');
		expect(options.method).to.equal('POST');
		expect(options.headers.Authorization).to.equal('Bearer sk-test');
		expect(options.headers['Content-Type']).to.match(/^multipart\/form-data; boundary=/);
		expect(options.ignoreSsrfValidation).to.equal(false);

		const body = options.body.toString();
		expect(body).to.include('name="model"\r\n\r\nwhisper-1');
		expect(body).to.include('name="response_format"\r\n\r\njson');
		expect(body).to.not.include('name="language"');
		expect(body).to.include('filename="audio.mp3"');
		expect(body).to.not.include('Аудиозапись');
		expect(body).to.include('AUDIO');
	});

	it('passes the language hint and omits the key when none is configured', async () => {
		withSettings({ Transcription_Language: 'ru', Transcription_API_Key: '' });

		await transcribeAudio({ data: Buffer.from('x'), filename: 'v.ogg', mimetype: 'audio/ogg' });

		const [, options] = serverFetch.firstCall.args;
		expect(options.headers).to.not.have.property('Authorization');
		expect(options.body.toString()).to.include('name="language"\r\n\r\nru');
	});

	it('fails loudly when the provider errors, answers without text, or no model is set', async () => {
		serverFetch.resolves({ ok: false, status: 401, text: async () => '{"error":"bad key"}' });
		await transcribeAudio({ data: Buffer.from('x'), filename: 'v.ogg', mimetype: 'audio/ogg' }).then(
			() => expect.fail('should reject'),
			(err: Error) => expect(err.message).to.include('401'),
		);

		serverFetch.resolves(okResponse({ nope: 1 }));
		await transcribeAudio({ data: Buffer.from('x'), filename: 'v.ogg', mimetype: 'audio/ogg' }).then(
			() => expect.fail('should reject'),
			(err: Error) => expect(err.message).to.include('unexpected response'),
		);

		withSettings({ Transcription_Model: '' });
		await transcribeAudio({ data: Buffer.from('x'), filename: 'v.ogg', mimetype: 'audio/ogg' }).then(
			() => expect.fail('should reject'),
			(err: Error) => expect(err.message).to.equal('error-transcription-not-configured'),
		);
	});
});
