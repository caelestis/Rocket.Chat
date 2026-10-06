import type { IMessage, IUpload, FileProp, MessageAttachment } from '@rocket.chat/core-typings';
import { Rooms, Users } from '@rocket.chat/models';
import { Match, check } from 'meteor/check';
import { Meteor } from 'meteor/meteor';

import { parseFileIntoMessageAttachments } from './sendFileMessage';
import { executeSendMessage } from './sendMessage';
import { canAccessRoomAsync } from '../../lib/authorization/canAccessRoom';
import { callbacks } from '../../lib/callbacks';

/**
 * Posts one message carrying every given upload, in the order received.
 * The first file also fills the legacy `file` field so older readers still find one.
 */
export const sendFilesMessage = async (
	userId: string,
	{
		roomId,
		files,
		msgData,
	}: {
		roomId: string;
		files: Partial<IUpload>[];
		msgData?: Record<string, any>;
	},
): Promise<IMessage | false> => {
	const user = await Users.findOneById(userId, { projection: { services: 0 } });

	if (!user) {
		throw new Meteor.Error('error-invalid-user', 'Invalid user', {
			method: 'sendFilesMessage',
		} as any);
	}

	if (!files.length) {
		throw new Meteor.Error('error-invalid-file', 'Invalid file', {
			method: 'sendFilesMessage',
		});
	}

	const room = await Rooms.findOneById(roomId);
	if (!room) {
		return false;
	}

	if (user.type !== 'app' && !(await canAccessRoomAsync(room, user))) {
		return false;
	}

	check(
		msgData,
		Match.Maybe({
			msg: Match.Optional(String),
			tmid: Match.Optional(String),
			t: Match.Optional(String),
			attachments: Match.Optional([Match.Any]),
			content: Match.Optional(
				Match.ObjectIncluding({
					algorithm: String,
					ciphertext: String,
				}),
			),
		}),
	);

	const messageFiles: FileProp[] = [];
	const attachments: MessageAttachment[] = [];

	// Sequential on purpose: each image upload also writes a thumbnail, and the storage
	// backend is not guaranteed to cope with several of those in flight for one user.
	for (const file of files) {
		const parsed = await parseFileIntoMessageAttachments(file, roomId, user);
		messageFiles.push(...parsed.files);
		attachments.push(...parsed.attachments);
	}

	const data = {
		rid: roomId,
		ts: new Date(),
		...(msgData as Partial<IMessage>),
		msg: msgData?.msg ?? '',
		groupable: false,
		file: messageFiles[0],
		files: messageFiles,
		attachments: [...(Array.isArray(msgData?.attachments) ? msgData.attachments : []), ...attachments],
	};

	const msg = await executeSendMessage(userId, data);

	callbacks.runAsync('afterFileUpload', { user, room, message: msg });

	return msg;
};
