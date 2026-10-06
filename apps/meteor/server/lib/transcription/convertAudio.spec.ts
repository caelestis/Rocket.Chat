import { expect } from 'chai';
import { beforeEach, describe, it } from 'mocha';
import proxyquire from 'proxyquire';
import sinon from 'sinon';

const execFile = sinon.stub();
const unlink = sinon.stub();
const settingsGet = sinon.stub();

const { convertToWav, ffmpegArguments, isProviderExtension } = proxyquire.noCallThru().load('./convertAudio', {
	'child_process': { execFile },
	'fs': { default: { promises: { unlink } }, promises: { unlink } },
	'../../settings': { settings: { get: settingsGet } },
});

describe('convertAudio', () => {
	beforeEach(() => {
		execFile.reset();
		execFile.callsFake((_bin: string, _args: string[], _opts: unknown, cb: (err: Error | null, out?: unknown) => void) =>
			cb(null, { stdout: '', stderr: '' }),
		);
		unlink.reset();
		unlink.resolves();
		settingsGet.reset();
		settingsGet.returns('/usr/bin/ffmpeg');
	});

	it('knows which containers the provider decodes by itself', () => {
		expect(isProviderExtension('mp3')).to.be.true;
		expect(isProviderExtension('m4a')).to.be.true;
		expect(isProviderExtension('aac')).to.be.false;
		expect(isProviderExtension(undefined)).to.be.false;
	});

	it('asks ffmpeg for mono 16 kHz wav next to the input', () => {
		const args = ffmpegArguments('/tmp/in.aac', '/tmp/in.aac.wav');

		expect(args).to.include.members(['-i', '/tmp/in.aac', '-f', 'wav', '/tmp/in.aac.wav', '-ac', '1', '-ar', '16000']);
	});

	it('runs the configured binary and resolves with the wav path', async () => {
		const out = await convertToWav('/tmp/voice.aac');

		expect(out).to.equal('/tmp/voice.aac.wav');
		const [bin, args] = execFile.firstCall.args;
		expect(bin).to.equal('/usr/bin/ffmpeg');
		expect(args).to.deep.equal(ffmpegArguments('/tmp/voice.aac', '/tmp/voice.aac.wav'));
	});

	it('names the missing binary and cleans up when ffmpeg is not installed', async () => {
		execFile.callsFake((_bin: string, _args: string[], _opts: unknown, cb: (err: Error | null) => void) =>
			cb(Object.assign(new Error('spawn'), { code: 'ENOENT' })),
		);

		await convertToWav('/tmp/voice.aac').then(
			() => expect.fail('should reject'),
			(err: Error) => expect(err.message).to.equal('error-transcription-ffmpeg-missing'),
		);
		expect(unlink.calledWith('/tmp/voice.aac.wav')).to.be.true;
	});

	it('surfaces ffmpeg output when the conversion itself fails', async () => {
		execFile.callsFake((_bin: string, _args: string[], _opts: unknown, cb: (err: Error | null) => void) =>
			cb(Object.assign(new Error('exit 1'), { stderr: 'Invalid data found' })),
		);

		await convertToWav('/tmp/voice.aac').then(
			() => expect.fail('should reject'),
			(err: Error) => expect(err.message).to.include('Invalid data found'),
		);
	});
});
