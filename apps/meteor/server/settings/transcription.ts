import { settingsRegistry } from '.';

export const createTranscriptionSettings = () =>
	settingsRegistry.addGroup('Transcription', async function () {
		await this.add('Transcription_Enabled', false, {
			type: 'boolean',
			public: true,
			i18nDescription: 'Transcription_Enabled_Description',
		});

		await this.add('Transcription_Provider', 'openai', {
			type: 'select',
			values: [
				{ key: 'openai', i18nLabel: 'Transcription_Provider_OpenAI' },
				{ key: 'groq', i18nLabel: 'Transcription_Provider_Groq' },
				{ key: 'custom', i18nLabel: 'Transcription_Provider_Custom' },
			],
			i18nDescription: 'Transcription_Provider_Description',
		});

		await this.add('Transcription_Base_URL', 'http://localhost:8000/v1', {
			type: 'string',
			i18nDescription: 'Transcription_Base_URL_Description',
			enableQuery: { _id: 'Transcription_Provider', value: 'custom' },
		});

		await this.add('Transcription_API_Key', '', {
			type: 'password',
			secret: true,
			i18nDescription: 'Transcription_API_Key_Description',
		});

		await this.add('Transcription_Model', 'whisper-1', {
			type: 'string',
			i18nDescription: 'Transcription_Model_Description',
		});

		await this.add('Transcription_FFmpeg_Path', 'ffmpeg', {
			type: 'string',
			i18nDescription: 'Transcription_FFmpeg_Path_Description',
		});

		await this.add('Transcription_Language', '', {
			type: 'string',
			i18nDescription: 'Transcription_Language_Description',
		});
	});
