# Subnet Lab

A subnetting calculator and trainer for people studying for Network+, Security+, CCNA, etc.

- **Calculator**: enter `192.168.10.77/27` or `192.168.10.77 255.255.255.224` and get the network, broadcast, host range, masks, class, and address type. It also shows **step-by-step working** (magic number method) and a colour-coded binary view.
- **Practice**: random questions across 10 types (network/broadcast, first/last host, host counts, CIDR ↔ mask, sizing a subnet, counting subnets, same-subnet checks) at three difficulty levels. Every answer comes with an explanation. Tracks streaks and shows your weakest question types.
- **Cheat sheet**: CIDR table, mask octet values, and special ranges.

Plain HTML/CSS/JS in `public/`, with no build step and no dependencies. Everything runs in the browser.

## Run locally

Open `public/index.html` directly, or serve it with `npx serve public`.

## Deploy to Firebase Hosting

```sh
npm install -g firebase-tools
firebase login
firebase deploy --only hosting --project <your-project-id>
```
