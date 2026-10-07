# Searching encrypted rooms

Upstream disables message search in end-to-end encrypted rooms: the server stores
only ciphertext and the room key never leaves the clients. This fork searches such
rooms in the browser instead.

## Model

The search tab of an encrypted private group or direct message offers to load the
room's history. The client then pages through `groups.messages` or `im.messages`,
newest first, decrypts each page with the room key it already holds and keeps the
plaintext in an in-memory index per room. Searching runs over that index merged with
whatever the open room already holds decrypted, so messages that arrive while the
tab is open are found without reloading. Results are rendered by the same list and
highlighting as the server-backed search, and jumping to a result works as usual.

Design choices worth keeping:

- The index lives in memory only and is dropped on reload, with "Forget", or by itself
  30 minutes after loading ends (`ENCRYPTED_SEARCH_TTL_MS`). Writing decrypted history
  to disk, or keeping it around indefinitely, would undo what the encryption is for.
- Loading is explicit, shows progress and can be stopped; a stopped index is still
  searchable for what it got.
- Messages this client cannot decrypt, typically ones encrypted with a key from
  before the viewer joined, stay in the index as they are, so their author and date
  still match but their text does not.
- Global search is hidden for encrypted rooms; the index is per room by design.
- Nothing changes on the server. Page size is 100, the default `API_Upper_Count_Limit`;
  raising that setting makes the load take fewer requests.

## Where it lives

- `apps/meteor/client/lib/e2ee/search/` holds the store, the loader and the matcher.
- `apps/meteor/client/views/room/contextualBar/MessageSearchTab/` wires them in:
  `EncryptedRoomSearchStatus.tsx` in the form, `useEncryptedMessageSearch.ts` for the
  results, and a three-line switch in `MessageSearchTab.tsx`.
