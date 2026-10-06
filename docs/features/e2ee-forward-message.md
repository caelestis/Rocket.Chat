# Forwarding messages from end-to-end encrypted rooms

Rocket.Chat's stock forward action is disabled on encrypted messages because the
server never holds the room key: it cannot read the original to quote it into
another room. This fork lifts that restriction on the client, which is the only
party that has the plaintext.

## Model

The client that forwards has already decrypted the message into its local store.
It builds an attachment from that decrypted copy (author name, avatar, the text,
and the permalink of the original behind the author name) and sends it as a
brand-new message to each selected room through the same pre-send hook chain the
composer uses. That chain is what encrypts outgoing messages, so:

- a target room that is encrypted receives the quote encrypted with **its own**
  key, and the server only stores ciphertext;
- a target room that is not encrypted receives the quote in plaintext. The person
  forwarding chose to copy the text there, exactly as if they had pasted it.

Files travel by being uploaded again. Encrypted uploads are bound to the source
room's key and its access list, so the client downloads each file, decrypts it in
memory with the key carried by its attachment, and uploads a fresh copy into the
target room: encrypted with a new per-file key when that room encrypts files,
plain otherwise. The copies and the author card are then posted as one message
through the same multi-file confirm endpoint the composer uses
(`docs/features/grouped-file-uploads.md`). Voice messages, images, videos and
generic files all take this path. A decrypted message with neither text nor a
file keeps the action disabled.

The action also stays disabled until this client has finished decrypting the
message, and in rooms managed by ABAC, as upstream does.

The attachment is deliberately not a quote. The server rebuilds quote attachments
from permalinks found in the message text on every save and discards any quote it
was given, and a permalink to the original would only resolve to its ciphertext.
A plain attachment survives the save untouched and renders with the author and
text on every client.

Only the modal's send step changes for encrypted messages. Messages from
unencrypted rooms keep upstream behaviour: a permalink is posted and the server
expands it into a quote.

## Where it lives

- `apps/meteor/client/components/message/toolbar/items/actions/ForwardMessageAction.tsx`
  decides when the action is available.
- `apps/meteor/client/views/room/modals/ForwardMessageModal/` builds the author
  card and, for encrypted sources, sends it via `forwardDecryptedMessage`;
  `forwardDecryptedFiles.ts` downloads, decrypts and re-uploads the files.
