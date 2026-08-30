# DF Downloader

DF Downloader is a nodejs/react application designed to download the latest Digital Foundry videos when they are available. This will only work in any useful manner if you are a Patreon subscriber. If you are not a subscriber, this tool will still be able to get info about available content but it will not be able to download anything.

_NOTE - This is a personal project that I developed for my own use and has been consistently working for me for some time. I thought I'd put it out there as I found it so useful. I don't get much time to actually work on it but try to keep it updated if it breaks or doesn't work quite as expected. Also if you look through the code you may spot some weird, convoluted looking stuff. I sometimes use this to experiment with new ideas (such as playing around with Typescript types)_

If you just want to get up and running, check out the [Standalone (no docker)](#standalone-no-docker-instructions) instructions or go to the [concretellama/digital-foundry-downloader dockerhub page](https://hub.docker.com/repository/docker/concretellama/digital-foundry-downloader) to run in a container.

## Digital Foundry's 2025 relaunch

Digital Foundry left their old host and relaunched independently at `digitalfoundry.net` in 2025, with an entirely different site, CMS, and login mechanism. That broke this tool's scraper for a while (a manual "paste a Patreon post's HTML" import mode existed as a stopgap during that period). The new site's video archive relaunched properly in August 2026, and this tool was updated to match — automated scanning and downloading against the new site work end-to-end again, and the old Patreon-HTML-paste workaround has been retired now that it's no longer needed. If you're upgrading from a version that predates this, you'll need to grab a fresh login cookie (see below) and the app will do one full re-scan to reconcile its local database against the new site - that's automatic, not something you need to trigger.

# Features

- Has a web UI to see available content, manage downloads, configure etc.
- Can be configured to download new Digital Foundry videos automatically when available, with a media format priority list (e.g. 4K > 1080p > Video)
- Injects metadata into downloaded media (title, tags (as genre tags), description, published date and chapter info) — description and video duration are pulled from the video's YouTube page the first time you open it in the UI or download it, since the DF site itself doesn't expose either
- Has a download queue to limit the number of simultaneous downloads
- Can force start downloads outside of the limit, reorder downloads and pause/resume them
- If a download fails, it will attempt to continue from the point it failed (e.g. if 50% through will continue from 50%)
- File paths are configurable with templates to allow you to specify where the content is downloaded to based on metadata from the content (e.g. can put in YYYY/MM directories, or put all content tagged with "df direct" into a DF Direct dir)
- Can send pushbullet notifications when various events occur
- Stores content info and related download info to a file so it doesn't have to re-scan on restart
- Ability to automatically generate subtitles for videos, either locally with Whisper (no API key, no per-video cost, and because it transcribes the downloaded file itself the timings always match it) or via Deepgram or Google STT (Google STT is quite slow due to using streaming recognize). Model, thread count and a term-correction list for jargon the transcriber mishears are all configurable
  - Note: subtitles used to be extractable from YouTube's own captions. That no longer works - YouTube stopped serving captions to anything that isn't a browser, returning an empty response without a proof-of-origin token - so the option was removed in 2.7.0. Existing configurations are migrated automatically on startup
- Can analyse a video's content with Claude (needs your own Anthropic API key). Writes a summary and a separate verdict, and pulls the hard numbers into structured fields where the content supports it — per-platform resolutions/frame rates for a console face-off, the settings table for a PC review, a per-topic breakdown for a Q+A. Also suggests tags, which is the one part that works without a transcript. Costs a few pence a video and estimates a run's cost from a real token count before you commit to it
  - Where a figure was never actually stated it says so rather than guessing. Findings also carry the moment they were said, located by having the model quote the transcript verbatim and then finding that quote in the subtitles — so a jump either lands where the thing was said or isn't offered
- Finds Digital Foundry's own written article for a video where one exists, links it on the content, and reads it alongside the transcript when analysing (an article is written rather than transcribed, so its product names and figures are right where speech-to-text garbles them). A match is confirmed by checking the article embeds that exact video, not by titles looking similar. Newly published articles are also picked up periodically and attached on their own
- An Analysis section reads across everything analysed rather than one video at a time — console comparisons side by side and filterable by platform, plus an index of what was covered per game
- A Backfill tool (under Tools) applies subtitles, analysis or article matching across content you already have, as one background job you can watch and cancel, with a button that selects everything still missing whichever you picked
- Plays downloaded files in the app, with their subtitles and a single time-ordered list of the chapters in the file and the moments the analysis found. Serves byte ranges, so a multi-gigabyte video starts immediately and seeking is instant rather than transferring the whole file first
  - Whether a file plays is down to your machine, not the file: h.264 plays anywhere, HEVC needs a decoder from your OS. Where that's missing the player says so and points you at the file rather than showing a black rectangle
- Writes a log file, with a Logs page in the UI to read it back and follow it live
- A small status indicator in the UI's nav bar shows whether the tool is currently waiting on Digital Foundry (queued/rate-limited) or mid-archive-scan — click it for a breakdown

# DF Login Cookie

I haven't implemented Patreon login directly, so you'll have to use your browser: log in to digitalfoundry.net, then use your browser's dev tools to grab your **`autologin`** cookie. It's a "remember me"-style token that, in testing, doesn't rotate or expire on reuse — logging in again elsewhere doesn't appear to invalidate it the way the old site's session cookie did.

To get this in Chrome, for example: `⋮` (top right) → More Tools → Developer Tools → Application tab → Storage → Cookies → `https://www.digitalfoundry.net` → copy the value of the **`autologin`** cookie.

Paste it into Settings → Digital Foundry → Autologin Cookie in the web UI, and hit "Test Session ID" to confirm it's valid before saving. If you don't have one configured (or it's invalid), the app will prompt you for one on startup and won't attempt to scan the site until it has a working cookie.

# Limitations

- Can't log in using your Patreon credentials directly - you have to get the cookie from your browser as above.
- There is no way to multi select videos to download or trigger a download for all previous videos, and there never will be.
- No casting to a TV from the app. The browser's own cast option is deliberately switched off, because it hands the receiver a URL it isn't authorised to fetch and only ever produces a logo on screen. Point a media server at the same destination directory and cast from that — it also transcodes for devices that can't decode HEVC, which most 4K downloads use
- Content whose data hasn't yet been confirmed against the current site (e.g. very old entries carried over from before the 2025/2026 relaunch that the tool hasn't been able to relocate) can't be downloaded until you use "Refresh Metadata" on that item — this is deliberate, since old cached download links are very likely dead.

# Notes on behaviour

On first run, this will scan the entire DF archive and build up a DB of all available content. On future runs, it does a lighter check for new/updated content on a relaxed timer rather than re-walking the whole archive. Requests to digitalfoundry.net are deliberately rate-limited and paced (a handful of seconds apart) — Digital Foundry is a small team, not a large CDN-subsidized operation, and this tool tries hard not to hammer their infrastructure. A one-off action you trigger yourself (like clicking to download something) skips ahead of any queued background work rather than waiting behind it.

Either way, the size of the "DB" after first run is a few MB of JSON.

If you want to limit the impact of a full scan, there are settings to cap how many archive pages get walked and how far back auto-download will reach.

It will also scan your destination dir for existing downloaded content. This behaviour can be disabled in the UI.

## Code Structure

This is split into 3 packages, linked via npm workspaces:

### df-downloader-common

Includes all models (zod schemas) shared between the UI and the backend service, along with various utility functions.

### df-downloader-ui

A react web UI to interface with df-downloader-service to view available content, monitor downloads and configure the service.

### df-downloader-service

The backend service that does most of the actual work - scanning the DF site for new content, managing content, and downloading it.
The service is also able to host the web UI.

## Standalone (no Docker) instructions

### Prerequisites

- Node.js 24 (current LTS)

If you don't have nodejs, I recommend using [nvm](https://github.com/nvm-sh/nvm) to install it, but you can just go to the [nodejs website](https://nodejs.org/en/) and download the latest LTS.

### Setup

In the root directory of this project run:

`npm install`

then

`npm run build`

### Configuration

TL;DR - If you're using the web UI, you don't need to do anything and you can skip this.

See the config.sample.yaml file for all config options, but generally you can configure most options in the Web UI. Manually editing the config file is mostly useful for configuring the REST API and logging.

You can find a sample config in df-downloader-service/config_samples/config.sample.yaml. This will automatically be copied to df-downloader-service/config/config.yaml on first run. You'll notice it's all commented out - there is no mandatory config.

Note that when you update config with the web ui, any comments will be lost.

### Running

In the root directory of this project, run:

`npm run start`

The service will start. You can access the web UI at `http://127.0.0.1:44556` (unless you've changed the config, in which case... go to the address that's appropriate to your config).

## Docker instructions

Note: If you're just planning on running this rather than developing it, please go to the [concretellama/digital-foundry-downloader dockerhub page](https://hub.docker.com/repository/docker/concretellama/digital-foundry-downloader)

### Setup (Devs)

If you have docker installed, you can run

```
docker build . -t  concretellama/digital-foundry-downloader
```

### Confiuguration

You can build this into a docker container and deploy it somewhere. Ensure you have volumes mapped for /db /config, /working_dir and /destination_dir and all environment variables setup.

> **_NOTE:_**  /working_dir and /destination_dir mappings should not map to the same directory on the host machine, and one should not map to a subdirectory of the other. This can cause issues and I haven't had the time to investigate why.

If you have docker ready to go then you can easily run this by checking out the docker_run.sample.sh

```
docker run -d \
  --env PUBLIC_ADDRESS=http://localhost:44556 \
  -v C:/Users/concretellama/Downloads:/working_dir \
  -v C:/Users/concretellama/Videos:/destination_dir \
  -v C:/Users/concretellama/df-downloader/config:/config \
  -v C:/Users/concretellama/df-downloader/db:/db \
  -p 44556:44556 \
  concretellama/digital-foundry-downloader:latest
```

I've also supplied a bash script to build and deploy the container to a supplied registry. I used to have this setup to go to a private registry on my local network but now just use dockerhub.

Usage:

```
./update_container.sh "concretellama/digital-foundry-downloader" "127.0.0.1:5000"
```

If you run this in a container on a server and you're using an insecure local registry, don't forget to add your local registry to the list of insecure registries in your docker daemon config json (/etc/docker/daemon.json).

```
{
   "insecure-registries": [
     "<server_ip>:5000"
   ]
}
```

In the case of Unraid, that file will not persist on restart.

### Upgrading an existing install

If you're updating from an install that predates the 2026-08 relaunch support, pull the latest image and force-update your container (Docker tags are mutable — pulling `:latest` again doesn't automatically refresh an already-running container on its own). You'll be prompted in the UI to paste a fresh `autologin` cookie (see above), and the app will do one automatic full re-scan to reconcile its existing database against the new site — your existing downloads, tags, and settings are preserved.

## Environment variables

### PUBLIC_ADDRESS

This tells the backend service what the public address is for CORS purposes - this should match the address you use to access the web UI in your browser.

## Support/Donations

This is just a fun personal project I built for myself and decided to share with fellow DF fans. If you want to donate, instead of sending me coffee money why not take those dollars and [subscribe to the Digital Foundry Patreon](https://www.patreon.com/digitalfoundry) (or use it to upgrade to a higher tier)?

They're the ones doing all the heavy lifting with incredible tech analysis, and frankly, they deserve your support way more than I do! Plus, without their amazing content, this tool would be pretty pointless anyway!
