# Voice message transcription

Adds a **Transcribe voice message** action to messages that carry an audio file. The
recognised text appears under the voice message for the person who asked, and for
nobody else: it is never posted, never stored, and the author of the voice message is
not told.

## Model

Every room here is end-to-end encrypted, so the server never has the audio in the
clear. The flow is therefore split:

1. The client downloads the voice message and decrypts it in memory, exactly as the
   forward action does for files.
2. The client sends the decrypted audio to this workspace's own endpoint,
   `transcription.transcribe`. The server forwards it to the configured speech-to-text
   provider with the workspace's key, returns the text, and keeps nothing. The provider
   key never reaches a browser.
3. The client keeps the text in memory, keyed by message, and renders it under the
   voice message with a "visible only to you" label and a dismiss button. A reload
   drops it; asking again fetches it again. A message with several audio files yields
   one text, one paragraph per file.

## Who can use it

- The workspace switch `Transcription_Enabled` (Administration → Settings →
  Transcription) must be on.
- The user needs the `transcribe-voice-messages` permission, granted to `admin` and
  `user` by default and editable under Administration → Permissions.
- The user must be subscribed to the room.

## Provider settings

The same settings group holds the provider (OpenAI, Groq, or a custom
OpenAI-compatible endpoint such as a self-hosted Whisper server), its base URL for
the custom case, the API key (stored as a secret setting), the model name and an
optional language hint. Any service exposing `POST /audio/transcriptions` in the
OpenAI shape works. The workspace's `SSRF_Allowlist` applies to the custom URL.

## Formats

Providers decode flac, m4a, mp3, mp4, ogg, wav and webm. The web client records mp3,
but the mobile apps send raw AAC (ADTS), which none of them accept. The server sniffs
the container from the first bytes and, for anything outside that list, rewrites the
audio as mono 16 kHz WAV with ffmpeg before forwarding it. `Transcription_FFmpeg_Path`
points at the binary; without ffmpeg such messages fail with
`error-transcription-ffmpeg-missing`. The provider always receives a plain ASCII
file name, since some reject non-ASCII ones.

## Where it lives

- `apps/meteor/client/lib/transcription/` decrypts, requests and keeps the text;
  `MessageTranscription.tsx` under `client/components/message/content/` renders it.
- `apps/meteor/client/components/message/toolbar/useTranscribeVoiceMessageAction.ts`
  is the menu action.
- `apps/meteor/server/api/v1/transcription.ts` and
  `apps/meteor/server/lib/transcription/transcribeAudio.ts` proxy to the provider.
- `apps/meteor/server/settings/transcription.ts` registers the settings group.
