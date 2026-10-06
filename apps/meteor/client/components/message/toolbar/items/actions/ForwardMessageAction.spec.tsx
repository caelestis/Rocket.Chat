import { mockAppRoot } from '@rocket.chat/mock-providers';
import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';

import ForwardMessageAction from './ForwardMessageAction';
import FakeRoomProvider from '../../../../../../tests/mocks/client/FakeRoomProvider';
import { createFakeRoom } from '../../../../../../tests/mocks/data';

// Mock the getPermaLink function
jest.mock('../../../../../lib/getPermaLink', () => ({
	getPermaLink: jest.fn(() => Promise.resolve(null)),
}));

jest.mock('../../../../../views/room/modals/ForwardMessageModal', () => ({
	getPermaLink: jest.fn(() => null),
}));

const appRoot = mockAppRoot()
	.withTranslations('en', 'core', {
		Forward_message: 'Forward message',
		Action_not_available_encrypted_content: 'Action not available for encrypted content',
	})
	.build();

const createMockMessage = (overrides: any = {}) => ({
	_id: 'message-id',
	rid: 'room-id',
	msg: 'Test message',
	ts: new Date(),
	u: { _id: 'user-id', username: 'testuser' },
	...overrides,
});

describe('ForwardMessageAction', () => {
	it('should render the forward action for normal messages', () => {
		const message = createMockMessage();
		const room = createFakeRoom();

		render(
			<FakeRoomProvider roomOverrides={room}>
				<ForwardMessageAction message={message} room={room} />
			</FakeRoomProvider>,
			{ wrapper: appRoot },
		);

		expect(screen.getByRole('button', { name: 'Forward message' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Forward message' })).not.toBeDisabled();
	});

	it('should be disabled while an encrypted message is still pending decryption', () => {
		const message = createMockMessage({
			t: 'e2e',
			e2e: 'pending',
		});
		const room = createFakeRoom();

		render(
			<FakeRoomProvider roomOverrides={room}>
				<ForwardMessageAction message={message} room={room} />
			</FakeRoomProvider>,
			{ wrapper: appRoot },
		);

		const button = screen.getByRole('button', { name: 'Action not available for encrypted content' });
		expect(button).toBeDisabled();
	});

	it('should be enabled once an encrypted message is decrypted and has text', () => {
		const message = createMockMessage({
			t: 'e2e',
			e2e: 'done',
			msg: 'decrypted text',
		});
		const room = createFakeRoom();

		render(
			<FakeRoomProvider roomOverrides={room}>
				<ForwardMessageAction message={message} room={room} />
			</FakeRoomProvider>,
			{ wrapper: appRoot },
		);

		expect(screen.getByRole('button', { name: 'Forward message' })).not.toBeDisabled();
	});

	it('should be enabled for a decrypted message that only carries files', () => {
		const message = createMockMessage({
			t: 'e2e',
			e2e: 'done',
			msg: '',
			attachments: [{ type: 'file', title: 'file.png', title_link: '/file-upload/1/file.png' }],
		});
		const room = createFakeRoom();

		render(
			<FakeRoomProvider roomOverrides={room}>
				<ForwardMessageAction message={message} room={room} />
			</FakeRoomProvider>,
			{ wrapper: appRoot },
		);

		expect(screen.getByRole('button', { name: 'Forward message' })).not.toBeDisabled();
	});

	it('should stay disabled for a decrypted message with neither text nor files', () => {
		const message = createMockMessage({
			t: 'e2e',
			e2e: 'done',
			msg: '',
			attachments: [],
		});
		const room = createFakeRoom();

		render(
			<FakeRoomProvider roomOverrides={room}>
				<ForwardMessageAction message={message} room={room} />
			</FakeRoomProvider>,
			{ wrapper: appRoot },
		);

		expect(screen.getByRole('button', { name: 'Action not available for encrypted content' })).toBeDisabled();
	});

	it('should be disabled for ABAC rooms', () => {
		const message = createMockMessage();
		const room = createFakeRoom({
			// @ts-expect-error - abacAttributes is not yet implemented in IRoom type
			abacAttributes: { someAttribute: 'value' },
		});

		render(
			<FakeRoomProvider roomOverrides={room}>
				<ForwardMessageAction message={message} room={room} />
			</FakeRoomProvider>,
			{ wrapper: appRoot },
		);

		const button = screen.getByRole('button', { name: 'Not_available_for_ABAC_enabled_rooms' });
		expect(button).toBeDisabled();
	});

	it('should be disabled for both encrypted messages and ABAC rooms', () => {
		const message = createMockMessage({
			t: 'e2e',
			e2e: 'pending',
		});
		const room = createFakeRoom({
			// @ts-expect-error - abacAttributes is not yet implemented in IRoom type
			abacAttributes: { someAttribute: 'value' },
		});

		render(
			<FakeRoomProvider roomOverrides={room}>
				<ForwardMessageAction message={message} room={room} />
			</FakeRoomProvider>,
			{ wrapper: appRoot },
		);

		const button = screen.getByRole('button', { name: 'Action not available for encrypted content' });
		expect(button).toBeDisabled();
	});

	it('should have no accessibility violations for normal messages', async () => {
		const message = createMockMessage();
		const room = createFakeRoom();

		const { container } = render(
			<FakeRoomProvider roomOverrides={room}>
				<ForwardMessageAction message={message} room={room} />
			</FakeRoomProvider>,
			{ wrapper: appRoot },
		);
		const results = await axe(container);
		expect(results).toHaveNoViolations();
	});

	it('should have no accessibility violations for encrypted messages', async () => {
		const message = createMockMessage({
			t: 'e2e',
			e2e: 'pending',
		});
		const room = createFakeRoom();

		const { container } = render(
			<FakeRoomProvider roomOverrides={room}>
				<ForwardMessageAction message={message} room={room} />
			</FakeRoomProvider>,
			{ wrapper: appRoot },
		);
		const results = await axe(container);
		expect(results).toHaveNoViolations();
	});

	it('should have no accessibility violations for ABAC rooms', async () => {
		const message = createMockMessage();
		const room = createFakeRoom({
			// @ts-expect-error - abacAttributes is not yet implemented in IRoom type
			abacAttributes: { someAttribute: 'value' },
		});

		const { container } = render(
			<FakeRoomProvider roomOverrides={room}>
				<ForwardMessageAction message={message} room={room} />
			</FakeRoomProvider>,
			{ wrapper: appRoot },
		);
		const results = await axe(container);
		expect(results).toHaveNoViolations();
	});
});
