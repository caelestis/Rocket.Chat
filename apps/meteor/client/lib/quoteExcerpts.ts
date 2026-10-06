import type { IMessage } from '@rocket.chat/core-typings';
import { create } from 'zustand';

type QuoteExcerptsState = {
	byMessage: Record<IMessage['_id'], string>;
	set: (mid: IMessage['_id'], excerpt: string) => void;
	clear: (mid: IMessage['_id']) => void;
};

/** The part of each quoted message the author chose to quote, until the quote is sent or dismissed. */
export const useQuoteExcerpts = create<QuoteExcerptsState>((set) => ({
	byMessage: {},
	set: (mid, excerpt) => set((state) => ({ byMessage: { ...state.byMessage, [mid]: excerpt } })),
	clear: (mid) =>
		set((state) => {
			const { [mid]: _dropped, ...byMessage } = state.byMessage;
			return { byMessage };
		}),
}));

export const getQuoteExcerpt = (mid: IMessage['_id']): string | undefined => useQuoteExcerpts.getState().byMessage[mid];
