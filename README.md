# DF Downloader

DF Downloader is an application designed to download the latest Digital Foundry videos when they are available. This will only work in any useful manner if you are a Patreon subscriber.

_NOTE - This is a personal project that I developed for my own use and has been consistently working for me for some time. I thought I'd put it out there as I found it so useful. I don't get much time to actually work on it but try to keep it updated if it breaks or doesn't work quite as expected._

# Features

- Downloads new Digital Foundry videos when available
- Tags downloaded media with title, synopsis, date and tags (as genre tags)
- Has a download queue to limit the number of simultaneous downloads
- If a download fails, it will attempt to continue from the point it failed (e.g. if 50% through will continue from 50%)
- Can send pushbullet notifications when various events occur
- Stores download history in a very simple "DB" using lowdb (so basically it just writes to a JSON file) so it doesn't keep redownloading the same content on restart.
- Ability to automatically generate subtitles for videos using Deepgram (experimental).
- Has a web UI (WIP) to see available content, monitor downloads and configure

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

# Next steps

- Reintroduce notifications config for pushbullet
- Use the filter schema to add include and exclude config + forms to the automatic download config section
- Make UI work from paths that aren't / (try refreshing on, say, /downloads)
- CORS
- Lock some config fields if running in a container

# Notes on behaviour

On first run, this will scan the entire DF archive and build up a DB of all available content. On future runs, it will check every archive page at the beginning to see if it's missing anything. The first run can take quite a while - it does fetch multiple pages simultaenously but the last thing I want is for this tool to hammer the DF site unnecessarily. Maybe I've been a little over-cautious in this regard.

Either way, currently the size of the DB after first run is upward of 3.5MB.

If you want to limit the impact of this, set MAX_ARCHIVE_DEPTH

It will also scan your destination dir for existing downloaded content. This behaviour can be disabled with SCAN_EXISTING_FILES=false

## Installation

### Local

All steps are in the Dockerfile (TODO: Update this with actual help)

### In a Docker container

If you have docker installed, you can run

```
docker build . -t  concretellama/df-downloader-node
```

## Usage

### Running locally

TODO: Update this with actual help

### Running in docker

You can build this into a docker container and deploy it somewhere. Ensure you have volumes mapped for /db /config, /working_dir and /destination_dir and all environment variables setup.

If you have docker ready to go then you can easily run this by checking out the docker_run.sample.sh

```
docker run -d \
  --env WORK_DIR="//working_dir" \
  --env DESTINATION_DIR="//destination_dir" \
  --env CONFIG_DIR="//config" \
  --env DB_DIR="//db" \
  --env PUBLIC_ADDRESS=http://127.0.0.1:44556 \
  -v C:/Users/concretellama/Downloads:/working_dir \
  -v C:/Users/concretellama/Videos:/destination_dir \
  -v C:/Users/concretellama/df-downloader/config:/config \
  -v C:/Users/concretellama/df-downloader/db:/db \
  -p 44556:44556 \
  docker.io/concretellama/df-downloader-node
```

I've also supplied a bash script to build and deploy the container to a supplied registry. I have this setup to go to a private registry on my local network.

Usage:

```
./update_container.sh "concretellama/df-downloader-node" "127.0.0.1:5000"
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

## Configuration

This is partly configured with env vars:

See dev.env.sample for a list of configurable options

The rest is configured in CONFIG_DIR/config.yaml (see config.yaml.sample). You can also configure with the Web UI.

## Environment variables

### CONFIG_DIR

**REQUIRED**

Location of the config.yaml

### DB_DIR

**REQUIRED**

Location of the db.json
