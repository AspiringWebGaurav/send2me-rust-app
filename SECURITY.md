# Security Policy

## Supported Versions
Send2Me actively maintains and provides security updates for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| v1.x.x  | :white_check_mark: |
| < v1.0  | :x:                |

## Reporting a Vulnerability

We take security extremely seriously. If you discover a security vulnerability within Send2Me (especially regarding the P2P networking stack, folder sync parity, or encryption weaknesses), please **DO NOT** open a public issue.

Instead, please send an email to `security@send2me.dev` (replace with your actual security email).

### What to expect
- We will acknowledge receipt of your vulnerability report within 48 hours.
- We will send you regular updates about our progress in verifying the vulnerability and developing a patch.
- We will provide public recognition for your responsible disclosure (if desired) in our subsequent release notes.

## Zero Trust Architecture
Send2Me is designed around a Zero Trust architecture. We assume that the network between two devices is completely hostile (e.g., a public coffee shop WiFi). Therefore, all cryptographic handshakes must be completed via the out-of-band Pairing Code before any file data is accepted into the Rust engine.
