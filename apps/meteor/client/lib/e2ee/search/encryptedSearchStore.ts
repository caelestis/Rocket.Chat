import type { IMessage, IRoom } from '@rocket.chat/core-typings';
import { create } from 'zustand';

export type EncryptedSearchStatus = 'idle' | 'loading' | 'ready' | 'stopped' | 'error';

export type EncryptedSearchIndex = {
	status: EncryptedSearchStatus;
	/** Decrypted messages, newest first. */
	messages: IMessage[];
	loaded: number;
	total?: number;
	error?: string;
	/** When the decrypted history is dropped from memory; set once loading ends. */
	expiresAt?: number;
};

export const ENCRYPTED_SEARCH_TTL_MS = 30 * 60 * 1000;

const expiryTimers = new Map<IRoom['_id'], ReturnType<typeof setTimeout>>();

const cancelExpiry = (rid: IRoom['_id']) => {
	const timer = expiryTimers.get(rid);
	if (timer) {
		clearTimeout(timer);
		expiryTimers.delete(rid);
	}
};

type EncryptedSearchState = {
	byRoom: Record<IRoom['_id'], EncryptedSearchIndex>;
	begin: (rid: IRoom['_id']) => void;
	append: (rid: IRoom['_id'], messages: IMessage[], total: number) => void;
	finish: (rid: IRoom['_id'], status: Exclude<EncryptedSearchStatus, 'loading' | 'idle'>, error?: string) => void;
	reset: (rid: IRoom['_id']) => void;
};

export const emptyIndex: EncryptedSearchIndex = { status: 'idle', messages: [], loaded: 0 };

/**
 * Decrypted history of encrypted rooms, kept in memory only so the plaintext never
 * touches disk; a reload starts over. Built on demand from the search tab.
 */
export const useEncryptedSearchStore = create<EncryptedSearchState>((set, get) => ({
	byRoom: {},
	begin: (rid) => {
		cancelExpiry(rid);
		set((state) => ({ byRoom: { ...state.byRoom, [rid]: { ...emptyIndex, status: 'loading' } } }));
	},
	append: (rid, messages, total) =>
		set((state) => {
			const current = state.byRoom[rid] ?? emptyIndex;
			const known = new Set(current.messages.map((message) => message._id));
			const fresh = messages.filter((message) => !known.has(message._id));
			return {
				byRoom: {
					...state.byRoom,
					[rid]: { ...current, messages: [...current.messages, ...fresh], loaded: current.loaded + messages.length, total },
				},
			};
		}),
	finish: (rid, status, error) => {
		// The plaintext is kept only briefly: whatever the outcome, it is gone after the TTL.
		cancelExpiry(rid);
		expiryTimers.set(
			rid,
			setTimeout(() => get().reset(rid), ENCRYPTED_SEARCH_TTL_MS),
		);
		set((state) => ({
			byRoom: {
				...state.byRoom,
				[rid]: { ...(state.byRoom[rid] ?? emptyIndex), status, error, expiresAt: Date.now() + ENCRYPTED_SEARCH_TTL_MS },
			},
		}));
	},
	reset: (rid) => {
		cancelExpiry(rid);
		set((state) => {
			const { [rid]: _dropped, ...byRoom } = state.byRoom;
			return { byRoom };
		});
	},
}));
