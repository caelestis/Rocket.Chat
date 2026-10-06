# Forwarding messages from end-to-end encrypted rooms

Rocket.Chat's stock forward action is disabled on encrypted messages because the
server never holds the room key: it cannot read the original to quote it into
another room. This fork lifts that restriction on the client, which is the only
party that has the plaintext.

## Model

The client that forwards has already decrypted the message into its local store.
It builds a quote from that decrypted copy (author name, avatar, permalink of the
original and the text) and sends it as a brand-new message to each selected room
through the same pre-send hook chain the composer uses. That chain is what
encrypts outgoing messages, so:

- a target room that is encrypted receives the quote encrypted with **its own**
  key, and the server only stores ciphertext;
- a target room that is not encrypted receives the quote in plaintext. The person
  forwarding chose to copy the text there, exactly as if they had pasted it.

Files attached to the original are not forwarded. Encrypted uploads are bound to
the source room's key and its access list, so the quote carries only text. When a
decrypted message has no text at all the action stays disabled.

The action also stays disabled until this client has finished decrypting the
message, and in rooms managed by ABAC, as upstream does.

Only the modal's send step changes for encrypted messages. Messages from
unencrypted rooms keep upstream behaviour: a permalink is posted and the server
expands it into a quote.

## Where it lives

- `apps/meteor/client/components/message/toolbar/items/actions/ForwardMessageAction.tsx`
  decides when the action is available.
- `apps/meteor/client/views/room/modals/ForwardMessageModal/` builds the quote
  and, for encrypted sources, sends it via `forwardDecryptedMessage`.
