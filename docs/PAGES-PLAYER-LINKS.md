# Durable player links for Wyrmforge V2

Share **https://pjotrcasteel.github.io/Wyrmforge-V2/play-hunt.html**
for the playable game, or **https://pjotrcasteel.github.io/Wyrmforge-V2/**
for the lab. Diagnostic query flags may be appended to the stable Hunt URL.

The deployment creates `builds/<SHA>/` for CI to verify the exact build.
GitHub Pages publishes a replacement artifact per deployment, so previous
SHA paths are **not permanent**. They must not be advertised as immutable
user links. The root `404.html` redirects only historical game/index SHA
paths to the stable entry, preserving diagnostic flags. Missing JS/assets
remain real 404s.

Release verification checks the current version, stable root/Hunt/module
graph, and fallback 404 with mobile and desktop HTTP user-agent requests;
a delayed second check catches some propagation races. This is HTTP
validation, not real-device Safari/Android UI testing.
