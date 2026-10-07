import type { IMessage, IRoom } from '@rocket.chat/core-typings';
import { useMemo } from 'react';

import { emptyIndex, useEncryptedSearchStore } from '../../../../../lib/e2ee/search/encryptedSearchStore';
import { searchDecryptedMessages } from '../../../../../lib/e2ee/search/searchDecryptedMessages';
import { Messages } from '../../../../../stores';

/**
 * Search over the decrypted index of an encrypted room, merged with what the open room
 * already holds decrypted in memory, so messages that arrived after the index was built
 * are found too. Mirrors the shape of the server-backed search query.
 */
export const useEncryptedMessageSearch = ({ room, searchText, limit }: { room: IRoom; searchText: string; limit: number }) => {
	const index = useEncryptedSearchStore((state) => state.byRoom[room._id] ?? emptyIndex);
	const live = Messages.use((state) => state.records);

	const data = useMemo(() => {
		if (!searchText.trim()) {
			return [];
		}
		const inRoom: IMessage[] = [];
		live.forEach((message) => {
			if (message.rid === room._id && message._hidden !== true) {
				inRoom.push(message);
			}
		});
		return searchDecryptedMessages([...index.messages, ...inRoom], searchText, limit);
	}, [index.messages, live, room._id, searchText, limit]);

	return {
		index,
		data,
		isSuccess: index.status === 'ready' || index.status === 'stopped' || (index.status === 'loading' && index.loaded > 0),
		isPending: index.status === 'loading' && index.loaded === 0 && !!searchText,
	};
};
