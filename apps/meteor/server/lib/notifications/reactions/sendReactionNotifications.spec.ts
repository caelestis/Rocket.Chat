import { expect } from 'chai';
import { beforeEach, describe, it } from 'mocha';
import proxyquire from 'proxyquire';
import sinon from 'sinon';

const settingsGet = sinon.stub();
const findOneById = sinon.stub();
const findOneByRoomIdAndUserId = sinon.stub();
const scheduleItem = sinon.stub();
const getPushData = sinon.stub();
const notifyDesktopUser = sinon.stub();

const { sendReactionNotifications } = proxyquire.noCallThru().load('./sendReactionNotifications', {
	'@rocket.chat/models': {
		Users: { findOneById },
		Subscriptions: { findOneByRoomIdAndUserId },
	},
	'../../../settings': { settings: { get: settingsGet } },
	'../../i18n': { i18n: { t: (key: string, { reaction }: { reaction: string }) => `${key}|${reaction}` } },
	'../message/desktop': { notifyDesktopUser },
	'../message/mobile': { getPushData },
	'../queue/NotificationQueue': { Notification: { scheduleItem } },
	'../../../../app/emoji-native/lib/shortnameToUnicode': { shortnameToUnicode: (text: string) => (text === ':thumbsup:' ? '👍' : text) },
});

const author = { _id: 'author-id', username: 'author' };
const reactor = { _id: 'reactor-id', username: 'reactor', name: 'Re Actor' };
const room = { _id: 'room-id', t: 'p', name: 'secret' };
const message = { _id: 'message-id', rid: 'room-id', tmid: 'thread-id', msg: 'the original message text', u: author };
const encryptedMessage = {
	_id: 'message-id',
	rid: 'room-id',
	t: 'e2e',
	msg: '',
	content: { algorithm: 'rc.v2.aes-sha2', ciphertext: 'c' },
	u: author,
};

const settingsByDefault: Record<string, unknown> = {
	Notifications_On_Reactions: true,
	Push_enable: true,
	Troubleshoot_Disable_Notifications: false,
	Push_show_username_room: true,
	Push_show_message: true,
	Accounts_Default_User_Preferences_pushNotifications: 'all',
	Accounts_Default_User_Preferences_desktopNotifications: 'all',
	Language: 'en',
};

const onlineAuthor = { _id: author._id, active: true, username: 'author', language: 'pt', status: 'online', statusConnection: 'online' };

const withSettings = (overrides: Record<string, unknown>) =>
	settingsGet.callsFake((key: string) => (key in overrides ? overrides[key] : settingsByDefault[key]));

const react = () => sendReactionNotifications({ message, room, reactor, reaction: ':thumbsup:' });

describe('sendReactionNotifications', () => {
	beforeEach(() => {
		settingsGet.reset();
		withSettings({});
		findOneById.reset();
		findOneById.resolves(onlineAuthor);
		findOneByRoomIdAndUserId.reset();
		findOneByRoomIdAndUserId.resolves({ mobilePushNotifications: 'all', desktopNotifications: 'all', audioNotificationValue: 'chime' });
		scheduleItem.reset();
		scheduleItem.resolves();
		notifyDesktopUser.reset();
		notifyDesktopUser.resolves();
		getPushData.reset();
		getPushData.resolves({
			payload: { sender: author, senderName: 'reactor', type: 'p', name: 'secret', msg: 'secret-msg', content: { ciphertext: 'x' } },
			roomName: '#secret',
			username: 'reactor',
			message: 'ignored',
			badge: 3,
			category: 'MESSAGE',
		});
	});

	describe('desktop', () => {
		it('notifies a connected author with the reactor as sender and the message quoted', async () => {
			await react();

			expect(notifyDesktopUser.calledOnce).to.be.true;
			const [params] = notifyDesktopUser.firstCall.args;
			expect(params.userId).to.equal(author._id);
			expect(params.user).to.deep.equal(reactor);
			expect(params.reaction).to.equal('👍');
			expect(params.notificationMessage).to.equal('Reacted_with__reaction__to_your_message|👍: “the original message text”');
			expect(params.audioNotificationValue).to.equal('chime');
			expect(params.message).to.deep.equal({ _id: 'message-id', rid: 'room-id', tmid: 'thread-id', msg: '', u: reactor });
		});

		// The server cannot quote an encrypted message; the client quotes it after decrypting the carried content.
		it('hands the ciphertext of an encrypted message to the desktop client without any text', async () => {
			await sendReactionNotifications({ message: encryptedMessage, room, reactor, reaction: ':thumbsup:' });

			const [params] = notifyDesktopUser.firstCall.args;
			expect(params.notificationMessage).to.equal('Reacted_with__reaction__to_your_message|👍');
			expect(params.message).to.deep.equal({
				_id: 'message-id',
				rid: 'room-id',
				tmid: undefined,
				msg: '',
				u: reactor,
				t: 'e2e',
				content: encryptedMessage.content,
			});
		});

		it('stays silent for an offline or busy author but still queues the push', async () => {
			findOneById.resolves({ ...onlineAuthor, statusConnection: 'offline' });
			await react();

			findOneById.resolves({ ...onlineAuthor, status: 'busy' });
			await react();

			expect(notifyDesktopUser.called).to.be.false;
			expect(scheduleItem.callCount).to.equal(2);
		});

		it('respects the room and account desktop switches', async () => {
			findOneByRoomIdAndUserId.resolves({ desktopNotifications: 'nothing' });
			await react();

			findOneByRoomIdAndUserId.resolves({});
			findOneById.resolves({ ...onlineAuthor, settings: { preferences: { desktopNotifications: 'nothing' } } });
			await react();

			findOneById.resolves(onlineAuthor);
			withSettings({ Accounts_Default_User_Preferences_desktopNotifications: 'nothing' });
			await react();

			expect(notifyDesktopUser.called).to.be.false;
		});

		it('is not gated by the mobile push switch', async () => {
			withSettings({ Push_enable: false });

			await react();

			expect(notifyDesktopUser.calledOnce).to.be.true;
			expect(scheduleItem.called).to.be.false;
		});
	});

	describe('mobile push', () => {
		it('queues a push naming the reactor, the emoji and a snippet of the message', async () => {
			await react();

			expect(scheduleItem.calledOnce).to.be.true;
			const [{ uid, rid, mid, items }] = scheduleItem.firstCall.args;
			expect({ uid, rid, mid }).to.deep.equal({ uid: author._id, rid: room._id, mid: message._id });
			expect(items).to.have.length(1);
			expect(items[0].type).to.equal('push');
			expect(items[0].data.message).to.equal('Reacted_with__reaction__to_your_message|👍: “the original message text”');
			expect(items[0].data.idOnly).to.equal(false);
			expect(items[0].data.category).to.equal('MESSAGE_NOREPLY');
			expect(items[0].data.payload.sender).to.deep.equal(reactor);
			expect(items[0].data.payload).to.not.have.property('msg');
			expect(items[0].data.payload).to.not.have.property('content');
			expect(items[0].data.badge).to.equal(3);
		});

		it('builds the push data as if the reactor had written in the room', async () => {
			await react();

			const [params] = getPushData.firstCall.args;
			expect(params.senderUsername).to.equal('reactor');
			expect(params.senderName).to.equal('Re Actor');
			expect(params.userId).to.equal(author._id);
			expect(params.shouldOmitMessage).to.equal(false);
		});

		it('leaves the message body out when pushes must not show message content', async () => {
			withSettings({ Push_show_message: false });

			await react();

			expect(scheduleItem.firstCall.args[0].items[0].data.message).to.equal('Reacted_with__reaction__to_your_message|👍');
		});

		it('does not name the reactor when pushes must hide usernames', async () => {
			withSettings({ Push_show_username_room: false });

			await react();

			expect(scheduleItem.firstCall.args[0].items[0].data.message).to.match(/^Someone_reacted_with__reaction__to_your_message/);
		});

		it('respects the room subscription and the account default that mute mobile pushes', async () => {
			findOneByRoomIdAndUserId.resolves({ mobilePushNotifications: 'nothing' });
			await react();

			findOneByRoomIdAndUserId.resolves({});
			findOneById.resolves({ ...onlineAuthor, settings: { preferences: { pushNotifications: 'nothing' } } });
			await react();

			expect(scheduleItem.called).to.be.false;
		});
	});

	it('ignores a user reacting to their own message', async () => {
		await sendReactionNotifications({ message, room, reactor: author, reaction: ':thumbsup:' });

		expect(findOneById.called).to.be.false;
		expect(notifyDesktopUser.called).to.be.false;
		expect(scheduleItem.called).to.be.false;
	});

	it('does nothing when the feature is switched off', async () => {
		withSettings({ Notifications_On_Reactions: false });

		await react();

		expect(notifyDesktopUser.called).to.be.false;
		expect(scheduleItem.called).to.be.false;
	});

	it('skips authors who left the room, muted it, or were deactivated', async () => {
		findOneByRoomIdAndUserId.resolves(null);
		await react();

		findOneByRoomIdAndUserId.resolves({ disableNotifications: true });
		await react();

		findOneByRoomIdAndUserId.resolves({ mobilePushNotifications: 'all' });
		findOneById.resolves({ ...onlineAuthor, active: false });
		await react();

		expect(notifyDesktopUser.called).to.be.false;
		expect(scheduleItem.called).to.be.false;
	});
});
