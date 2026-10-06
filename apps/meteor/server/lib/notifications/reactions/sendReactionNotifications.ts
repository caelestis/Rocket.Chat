import type { IMessage, IRoom, ISubscription, IUser } from '@rocket.chat/core-typings';
import { Subscriptions, Users } from '@rocket.chat/models';

import { shortnameToUnicode } from '../../../../app/emoji-native/lib/shortnameToUnicode';
import { settings } from '../../../settings';
import { i18n } from '../../i18n';
import { notifyDesktopUser } from '../message/desktop';
import { getPushData } from '../message/mobile';
import { Notification } from '../queue/NotificationQueue';

const SNIPPET_LENGTH = 60;
const CATEGORY_MESSAGE_NOREPLY = 'MESSAGE_NOREPLY';

type Reactor = Pick<IUser, '_id' | 'username' | 'name'>;

type SendReactionNotificationsParams = {
	message: IMessage;
	room: IRoom;
	reactor: Reactor;
	reaction: string;
};

type Receiver = Pick<IUser, '_id' | 'active' | 'username' | 'name' | 'language' | 'status' | 'statusConnection'> & {
	settings?: { preferences?: { pushNotifications?: string; desktopNotifications?: string } };
};

type ReceiverSubscription = Pick<
	ISubscription,
	'mobilePushNotifications' | 'desktopNotifications' | 'disableNotifications' | 'audioNotificationValue'
>;

const snippetOf = (text: string): string => (text.length > SNIPPET_LENGTH ? `${text.slice(0, SNIPPET_LENGTH - 1)}…` : text);

const resolvePreference = (roomLevel: string | undefined, userLevel: string | undefined, defaultSetting: string): string =>
	roomLevel ?? userLevel ?? settings.get<string>(defaultSetting);

const wantsMobile = (subscription: ReceiverSubscription, receiver: Receiver): boolean =>
	resolvePreference(
		subscription.mobilePushNotifications,
		receiver.settings?.preferences?.pushNotifications,
		'Accounts_Default_User_Preferences_pushNotifications',
	) !== 'nothing';

const wantsDesktop = (subscription: ReceiverSubscription, receiver: Receiver): boolean => {
	if (receiver.statusConnection === 'offline' || receiver.status === 'busy') {
		return false;
	}

	return (
		resolvePreference(
			subscription.desktopNotifications,
			receiver.settings?.preferences?.desktopNotifications,
			'Accounts_Default_User_Preferences_desktopNotifications',
		) !== 'nothing'
	);
};

/**
 * Notifies the author of a message that someone else just reacted to it: a desktop
 * notification while they are connected and not busy, and a mobile push through the
 * regular queue. Both honour the author's room and account notification switches.
 */
export const sendReactionNotifications = async ({ message, room, reactor, reaction }: SendReactionNotificationsParams): Promise<void> => {
	if (
		settings.get<boolean>('Notifications_On_Reactions') !== true ||
		settings.get<boolean>('Troubleshoot_Disable_Notifications') === true
	) {
		return;
	}

	if (reactor._id === message.u._id) {
		return;
	}

	const receiver = await Users.findOneById<Receiver>(message.u._id, {
		projection: {
			'active': 1,
			'username': 1,
			'name': 1,
			'language': 1,
			'status': 1,
			'statusConnection': 1,
			'settings.preferences.pushNotifications': 1,
			'settings.preferences.desktopNotifications': 1,
		},
	});

	if (!receiver?.active) {
		return;
	}

	const subscription = await Subscriptions.findOneByRoomIdAndUserId<ReceiverSubscription>(room._id, receiver._id, {
		projection: { mobilePushNotifications: 1, desktopNotifications: 1, disableNotifications: 1, audioNotificationValue: 1 },
	});

	if (!subscription || subscription.disableNotifications) {
		return;
	}

	const lng = receiver.language || settings.get<string>('Language') || 'en';
	const showsSender = settings.get<boolean>('Push_show_username_room') === true;
	const emoji = shortnameToUnicode(reaction);
	const snippet = message.msg ? `: “${snippetOf(message.msg)}”` : '';

	const desktopText = `${i18n.t('Reacted_with__reaction__to_your_message', { lng, reaction: emoji })}${snippet}`;
	const pushText = `${i18n.t(showsSender ? 'Reacted_with__reaction__to_your_message' : 'Someone_reacted_with__reaction__to_your_message', { lng, reaction: emoji })}${
		settings.get<boolean>('Push_show_message') ? snippet : ''
	}`;

	// The shell names the reactor as sender and, for an encrypted message, carries the
	// ciphertext so the desktop client can quote the message it alone can decrypt.
	const messageShell = {
		_id: message._id,
		rid: message.rid,
		tmid: message.tmid,
		msg: '',
		u: reactor,
		...(message.t === 'e2e' && message.content && { t: message.t, content: message.content }),
	} as IMessage;

	if (wantsDesktop(subscription, receiver)) {
		await notifyDesktopUser({
			userId: receiver._id,
			user: reactor,
			message: messageShell,
			room,
			notificationMessage: desktopText,
			audioNotificationValue: subscription.audioNotificationValue,
			reaction: emoji,
		});
	}

	if (settings.get<boolean>('Push_enable') !== true || !wantsMobile(subscription, receiver)) {
		return;
	}

	const data = await getPushData({
		room,
		message,
		userId: receiver._id,
		receiver,
		senderUsername: reactor.username,
		senderName: reactor.name,
		notificationMessage: pushText,
		shouldOmitMessage: false,
	});

	// The message body must not travel in a reaction push, even for the app's own decryption.
	const { msg: _msg, content: _content, ...payload } = data.payload;

	await Notification.scheduleItem({
		user: receiver,
		uid: receiver._id,
		rid: room._id,
		mid: message._id,
		items: [
			{
				type: 'push',
				data: {
					...data,
					payload: { ...payload, sender: { _id: reactor._id, username: reactor.username ?? '', name: reactor.name } },
					message: pushText,
					category: CATEGORY_MESSAGE_NOREPLY,
					idOnly: false,
				},
			},
		],
	});
};
