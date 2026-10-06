import { callbacks } from '../../lib/callbacks';
import { SystemLogger } from '../../lib/logger/system';
import { sendReactionNotifications } from '../../lib/notifications/reactions/sendReactionNotifications';

callbacks.add(
	'afterSetReaction',
	async (message, { user, reaction, room }) => {
		try {
			await sendReactionNotifications({ message, room, reactor: user, reaction });
		} catch (err) {
			SystemLogger.error({ msg: 'Error sending reaction notifications', err });
		}
	},
	callbacks.priority.LOW,
	'send-push-notification-on-reaction',
);
