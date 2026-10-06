import { sdk } from './SDKClient';
import { jumpToDate } from './jumpToDate';
import { setMessageJumpQueryStringParameter } from './utils/setMessageJumpQueryStringParameter';

jest.mock('./SDKClient', () => ({ sdk: { rest: { get: jest.fn() } } }));
jest.mock('./utils/setMessageJumpQueryStringParameter', () => ({ setMessageJumpQueryStringParameter: jest.fn() }));

const mockedGet = jest.mocked(sdk.rest.get);
const mockedJump = jest.mocked(setMessageJumpQueryStringParameter);

beforeEach(() => {
	jest.clearAllMocks();
});

describe('jumpToDate', () => {
	it('asks the server for the first message on the day and jumps to it', async () => {
		mockedGet.mockResolvedValue({ message: { _id: 'mid', ts: '2026-03-01T09:00:00.000Z' } } as never);

		await expect(jumpToDate('rid', new Date('2026-03-01T00:00:00.000Z'))).resolves.toBe(true);

		expect(mockedGet).toHaveBeenCalledWith('/v1/chat.findMessageByDate', { roomId: 'rid', date: '2026-03-01T00:00:00.000Z' });
		expect(mockedJump).toHaveBeenCalledWith('mid');
	});

	it('reports when nothing was sent after that instant and leaves the view alone', async () => {
		mockedGet.mockResolvedValue({ message: null } as never);

		await expect(jumpToDate('rid', new Date('2030-01-01T00:00:00.000Z'))).resolves.toBe(false);

		expect(mockedJump).not.toHaveBeenCalled();
	});
});
