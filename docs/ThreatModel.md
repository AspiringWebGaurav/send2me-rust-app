# Send2Me Threat Model & Risk Assessment

This document outlines the enterprise threat model for Send2Me, utilizing the STRIDE methodology. It serves as a guide for security researchers and enterprise architects adopting the software.

## System Boundaries
Send2Me operates purely peer-to-peer. The trust boundaries are:
1. **The Local OS** (Trust Level: High, assuming standard user permissions)
2. **The Iroh P2P Network / Internet** (Trust Level: Zero, extremely hostile)

---

## 1. Spoofing
**Threat:** An attacker on the local network attempts to spoof the identity of a trusted device to intercept files.
**Mitigation:** 
- Devices are cryptographically bonded using Ed25519 keypairs. 
- The initial handshake requires a temporary, visually verified 4-digit pairing code. 
- Subsequent connections rely on the persistent public key verified through the Noise protocol. Spoofing an IP address or hostname will fail the cryptographic handshake.

## 2. Tampering
**Threat:** An attacker intercepts the network traffic and modifies a file chunk in transit (e.g., injecting malware into a synchronized folder).
**Mitigation:** 
- The underlying Noise protocol guarantees AEAD (Authenticated Encryption with Associated Data). Any tampered chunk will fail cryptographic authentication and the connection will be instantly severed by the Rust engine before the file chunk is written to disk.

## 3. Repudiation
**Threat:** A user claims they did not send a file.
**Mitigation:** 
- Send2Me maintains a local SQLite connection history logging the timestamp, remote Device ID, and cryptographic hash of the transfer. Because transfers are signed, repudiation is cryptographically impossible if the private key was not compromised.

## 4. Information Disclosure
**Threat:** Sensitive files (e.g., financial records) are sent across a public WiFi network and captured by a packet sniffer.
**Mitigation:** 
- 100% of data is End-to-End Encrypted (E2EE). The packet sniffer will only capture opaque, randomized ciphertexts.

## 5. Denial of Service (DoS)
**Threat:** A malicious node spams the Send2Me port with fake connection requests, causing memory exhaustion (OOM) or CPU spikes.
**Mitigation:** 
- The network layer drops unauthenticated packets at the socket level. Send2Me implements rate-limiting on failed pairing attempts (max 5 failures before a 15-minute lockout).

## 6. Elevation of Privilege
**Threat:** An attacker uses a path-traversal payload (e.g., `../../../../Windows/System32/file.dll`) in a malicious file transfer to overwrite OS files.
**Mitigation:** 
- The Rust backend sanitizes all incoming file paths.
- Files are saved in a strictly bounded `Downloads/Send2Me/` directory or the designated sync folder. Path resolution forcibly strips absolute paths and parent directories (`..`).
- Send2Me does not require, and should not be run with, Administrator/root privileges.
