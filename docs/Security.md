# Security & Privacy Architecture

Security is not an afterthought in Send2Me; it is the foundational pillar of the application. Because Send2Me operates purely peer-to-peer, you are in absolute control of your data.

## End-to-End Encryption

All data transmitted over the network is strictly end-to-end encrypted. Send2Me utilizes the highly robust [Noise Protocol Framework](http://noiseprotocol.org/), implemented via the underlying Iroh networking stack.
- **No Interception:** Your Internet Service Provider (ISP), network administrators, and even Send2Me developers cannot read your data.
- **Perfect Forward Secrecy:** Session keys are ephemeral. Even if a long-term key is compromised in the future, past traffic cannot be decrypted.

## Secure Pairing (Man-in-the-Middle Prevention)

When two devices connect for the first time, they must be cryptographically "bonded".
- Send2Me uses a visually verified, temporary 4-digit pairing code.
- This code is required to complete the initial cryptographic handshake.
- This mechanism completely prevents Man-in-the-Middle (MITM) attacks, ensuring that you are securely bonded *only* to the device you intend to connect with.

## Absolute Data Ownership

- **No Telemetry:** Send2Me does not ping home. There are no tracking scripts, analytics, or silent data collections.
- **No Cloud Middlemen:** Your files are transferred directly between your devices. Send2Me operates as a dumb, secure pipe. Your data never rests on a server in a data center.

## Local Storage Security

Send2Me stores local connection history and pairing identities in a secure, local SQLite database (`.local/database.sqlite`). This database never leaves your device and is strictly bound to your operating system's local user profile permissions.
