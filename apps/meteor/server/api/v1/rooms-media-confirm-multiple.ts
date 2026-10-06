import type { IMessage } from '@rocket.chat/core-typings';
import { Messages, Uploads } from '@rocket.chat/models';
import {
	ajv,
	isRoomsMediaConfirmMultipleProps,
	validateBadRequestErrorResponse,
	validateForbiddenErrorResponse,
	validateUnauthorizedErrorResponse,
} from '@rocket.chat/rest-typings';
import { Meteor } from 'meteor/meteor';

import { canAccessRoomIdAsync } from '../../lib/authorization/canAccessRoom';
import { applyAirGappedRestrictionsValidation } from '../../lib/cloud/license/airGappedRestrictionsWrapper';
import { sendFilesMessage } from '../../meteor-methods/messages/sendFilesMessage';
import { settings } from '../../settings';
import { API } from '../api';

const mediaConfirmMultipleResponseSchema = ajv.compile<{ message: IMessage | null }>({
	type: 'object',
	properties: {
		message: {
			type: 'object',
			nullable: true,
		},
		success: {
			type: 'boolean',
			enum: [true],
		},
	},
	required: ['message', 'success'],
	additionalProperties: false,
});

API.v1.post(
	'rooms.mediaConfirmMultiple',
	{
		authRequired: true,
		body: isRoomsMediaConfirmMultipleProps,
		response: {
			200: mediaConfirmMultipleResponseSchema,
			400: validateBadRequestErrorResponse,
			401: validateUnauthorizedErrorResponse,
			403: validateForbiddenErrorResponse,
		},
	},
	async function action() {
		const { rid, files: filesToConfirm, ...msgData } = this.bodyParams;

		if (!(await canAccessRoomIdAsync(rid, this.userId))) {
			return API.v1.forbidden();
		}

		const maxDescriptionLength = settings.get<number>('Message_MaxAllowedSize');

		const files = await Promise.all(
			filesToConfirm.map(async ({ fileId, fileName, description, fileContent }) => {
				const file = await Uploads.findOneByIdAndUserIdAndRoomId(fileId, this.userId, rid);

				if (!file) {
					throw new Meteor.Error('invalid-file');
				}

				if ((description?.length ?? 0) > maxDescriptionLength) {
					throw new Meteor.Error('error-message-size-exceeded');
				}

				file.description = description;

				if (fileName) {
					file.name = fileName;
				}

				if (fileContent) {
					file.content = fileContent;
				}

				return file;
			}),
		);

		await applyAirGappedRestrictionsValidation(() => sendFilesMessage(this.userId, { roomId: rid, files, msgData }));

		await Promise.all(files.map((file) => Uploads.confirmTemporaryFile(file._id, this.userId)));

		const message = await Messages.getMessageByFileIdAndUsername(files[0]._id, this.userId);

		return API.v1.success({ message });
	},
);
