import type { IRoom } from '@rocket.chat/core-typings';

import { sdk } from './SDKClient';
import { setMessageJumpQueryStringParameter } from './utils/setMessageJumpQueryStringParameter';

/**
 * Scrolls the open room to the first message sent at or after the given instant, through
 * the same jump the permalink `?msg=` uses. Resolves false when the room has nothing after it.
 */
export const jumpToDate = async (rid: IRoom['_id'], date: Date): Promise<boolean> => {
	const { message } = await sdk.rest.get('/v1/chat.findMessageByDate', { roomId: rid, date: date.toISOString() });

	if (!message) {
		return false;
	}

	await setMessageJumpQueryStringParameter(message._id);
	return true;
};
