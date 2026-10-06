import type { IMessage } from '@rocket.chat/core-typings';
import { Messages } from '@rocket.chat/models';
import {
	ajv,
	validateBadRequestErrorResponse,
	validateForbiddenErrorResponse,
	validateUnauthorizedErrorResponse,
} from '@rocket.chat/rest-typings';

import { canAccessRoomIdAsync } from '../../lib/authorization/canAccessRoom';
import type { ExtractRoutesFromAPI } from '../ApiClass';
import { API } from '../api';

type FoundMessage = Pick<IMessage, '_id' | 'ts'>;

const findMessageByDateEndpoints = API.v1.get(
	'chat.findMessageByDate',
	{
		authRequired: true,
		query: ajv.compile<{ roomId: string; date: string }>({
			type: 'object',
			properties: {
				roomId: { type: 'string', minLength: 1 },
				date: { type: 'string', minLength: 1, description: 'ISO 8601 instant; the first visible message at or after it is returned.' },
			},
			required: ['roomId', 'date'],
			additionalProperties: false,
		}),
		response: {
			200: ajv.compile<{ message: FoundMessage | null }>({
				type: 'object',
				properties: {
					message: {
						type: 'object',
						nullable: true,
						properties: {
							_id: { type: 'string' },
							ts: { type: 'string' },
						},
						required: ['_id', 'ts'],
					},
					success: { type: 'boolean', enum: [true] },
				},
				required: ['message', 'success'],
				additionalProperties: false,
			}),
			400: validateBadRequestErrorResponse,
			401: validateUnauthorizedErrorResponse,
			403: validateForbiddenErrorResponse,
		},
	},
	async function action() {
		const { roomId, date } = this.queryParams;
		const since = new Date(date);

		if (Number.isNaN(since.getTime())) {
			return API.v1.failure('The "date" query parameter must be a valid date.');
		}

		if (!(await canAccessRoomIdAsync(roomId, this.userId))) {
			return API.v1.forbidden();
		}

		// The model query is strict (`$gt`), so step back one millisecond to include the instant itself.
		const [message] = await Messages.findVisibleByRoomIdAfterTimestamp<FoundMessage>(roomId, new Date(since.getTime() - 1), false, {
			sort: { ts: 1 },
			limit: 1,
			projection: { _id: 1, ts: 1 },
		}).toArray();

		return API.v1.success({ message: message ?? null });
	},
);

export type ChatFindMessageByDateEndpoints = ExtractRoutesFromAPI<typeof findMessageByDateEndpoints>;

declare module '@rocket.chat/rest-typings' {
	// eslint-disable-next-line @typescript-eslint/naming-convention, @typescript-eslint/no-empty-interface
	interface Endpoints extends ChatFindMessageByDateEndpoints {}
}
