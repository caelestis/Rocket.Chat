export type TranscriptionEndpoints = {
	'/v1/transcription.transcribe': {
		POST: (params: { file: File }) => { text: string };
	};
};
