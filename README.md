# DF Downloader

DF Downloader is a nodejs/react application designed to download the latest Digital Foundry videos when they are available. This will only work in any useful manner if you are a Patreon subscriber. If you are not a subscriber,
this tool will still be able to get info about available content but it will not be able to download anything.

_NOTE - This is a personal project that I developed for my own use and has been consistently working for me for some time. I thought I'd put it out there as I found it so useful. I don't get much time to actually work on it but try to keep it updated if it breaks or doesn't work quite as expected. Also if you look through the code you may spot some weird, convoluted looking stuff. I sometimes use this to experiment with new ideas (such as playing around with Typescript types)_

If you just want to get up and running, check out the [Standalone (no docker)](#standalone-no-docker-instructions) instructions or go to the [concretellama/digital-foundry-downloader dockerhub page](https://hub.docker.com/repository/docker/concretellama/digital-foundry-downloader) to run in a container.

# Features

- Downloads new Digital Foundry videos when available
- Tags downloaded media with title, synopsis, date and tags (as genre tags)
- Has a download queue to limit the number of simultaneous downloads
- Can force start downloads outside of the limit, reorder downloads and pause/resume them
- If a download fails, it will attempt to continue from the point it failed (e.g. if 50% through will continue from 50%)
- Can send pushbullet notifications when various events occur
- Stores download history in a very simple "DB" using lowdb (so basically it just writes to a JSON file) so it doesn't keep redownloading the same content on restart.
- Ability to automatically generate subtitles for videos - either extracted from YouTube or generated with Deepgram or Google STT (Google STT implementation is quite slow due to using streaming recognize).
- Has a web UI to see available content, manage downloads, configure etc.

# DF Session ID

I haven't implemented Patreon login, so you'll have to use your browser, login to digitalfoundry.net then use your browser's dev tools to grab your sessionid cookie. This used to expire every 2 weeks but now seems to persist indefinitely as long as you don't log in anywhere else.

To get this in Chrome, for example: ... > More Tools > Developer Tools > Application > Cookies > https://www.digitalfoundry.net > sessionid

Note: It's the sessionid cookie not the session_id one. From what I've seem the sessionid cookie is always lowercase alphanumeric, no special chars.

It seems like if you login on another browser, it'll log the downloader out, but if you log back in on the original browser from which you got the session id cookie,
it'll log you back in.

# Limitations

- Can't login using Patreon credentials - you have to go to the DF website in your browser and get the sessionid cookie - however this does seem to last indefinitely unless you log in from somewhere else.
- WebUI is incomplete
- Can't currently control active downloads in download queue

# Notes on behaviour

On first run, this will scan the entire DF archive and build up a DB of all available content. On future runs, it will check every archive page at the beginning to see if it's missing anything. The first run can take quite a while - it does fetch multiple pages simultaenously but the last thing I want is for this tool to hammer the DF site unnecessarily. Maybe I've been a little over-cautious in this regard.

Either way, currently the size of the DB after first run is upward of 3.5MB.

If you want to limit the impact of this, set the max archive depth

It will also scan your destination dir for existing downloaded content. This behaviour can be disabled with SCAN_EXISTING_FILES=false

## Structure

This is split into 3 packages:

### df-downloader-common

Includes all models shared between the UI and the backend service

### df-downloader-ui

A react web UI to interface with df-downloader-service to view available content, monitor downloads and configure the service.

### df-downloader-service

The backend service that does most of the actual work - scanning the DF site for new content, managing content, and downloading it.
The service is also able to host the web UI.

## Standalone (no Docker) instructions

### Prerequisites

- node20

You'll need nodejs. I've been running this with node20. If you don't have nodejs, I recommend using [nvm](https://github.com/nvm-sh/nvm) to install nodejs but you can just go to the [nodejs website](https://nodejs.org/en/) and download the latest version.

### Setup

In the root directory of this project run:

`npm run build`

It'll do everything for you

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

> **_NOTE:_**  /working_dir and /destination_dir mappings should not map to the same directory on the host machine, and one should not map to a subdirectory as the other. This can cause issues and I haven't had the time to investigate why.

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

I've also supplied a bash script to build and deploy the container to a supplied registry. I have this setup to go to a private registry on my local network.

Usage:

```
./update_container.sh "concretellama/digital-foundry-downloader" "127.0.0.1:5000"
```

If like me you run this in a container on a server and you're using an insecure local registry, don't forget to add your local registry to the list of insecure registries in your docker daemon config json (/etc/docker/daemon.json).

```
{
   "insecure-registries": [
     "<server_ip>:5000"
   ]
}
```

In the case of Unraid, that file will not persist on restart.

## Environment variables

### PUBLIC_ADDRESS

This tells the backend service what the public address is for CORS purposes - this should match the address you use to access the web UI in your browser.
