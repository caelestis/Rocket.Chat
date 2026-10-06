import type { IMessage } from '@rocket.chat/core-typings';
import { create } from 'zustand';

export type Transcription = { status: 'pending' } | { status: 'done'; text: string } | { status: 'error'; error: string };

type TranscriptionsState = {
	byMessage: Record<IMessage['_id'], Transcription>;
	set: (mid: IMessage['_id'], transcription: Transcription) => void;
	clear: (mid: IMessage['_id']) => void;
};

/**
 * Transcriptions this browser has asked for, by message. Kept in memory on purpose: the
 * text is private to whoever requested it and must survive neither a reload nor a sync.
 */
export const useTranscriptionsStore = create<TranscriptionsState>((set) => ({
	byMessage: {},
	set: (mid, transcription) => set((state) => ({ byMessage: { ...state.byMessage, [mid]: transcription } })),
	clear: (mid) =>
		set((state) => {
			const { [mid]: _dropped, ...byMessage } = state.byMessage;
			return { byMessage };
		}),
}));
