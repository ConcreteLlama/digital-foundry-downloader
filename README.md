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

# REST API

Currently there's a very basic REST API that's not really properly utilised as I haven't had the time to develop a web frontend for this. However if you're interested:

_Note: These are all liable to change_

## GET /api/content/query

Gets a list of content from the DB. Valid URL parameters are:

- limit: The maximum number of results
- page: The page number (takes you to item page\*limit)
- search: Search the titles for a given string. Case insensitive, partial match. e.g. "f irect" will get all DF Direct results
- status: A list of valid statuses (AVAILABLE, CONTENT_PAYWALLED or DOWNLOADED). Either separated by a comma or by supplying the status query parameter multiple
  times in the query string.
- tags: A list of content tags to match. Either separated by a comma or by supplying the status query parameter multiple times in the query string.

Returns JSON object with:

- params: The params used for the search
- resultsOnPage: Number of results on this page
- pageDuration: Total duration of content on this page
- totalResults: Total number of results that matched the query
- totalDuration: Total duration of all results that matched the query
- content: An array of all content that matched the query

## GET /api/content/tags

Returns a JSON object containing

- tags: An array of objects containing the tag name ("tag") and number of content items with that tag ("count")

## POST /downloadContent

Starts downloading content with a given contentName (specified in request body), e.g.

```
{
  "contentName": "free-download-gran-turismo-sport-hdr-sampler"
}
```

Note that the full URL to the DF page can also be supplied, this will be sanitized on the backend.

## POST /updateSessionId

Updates the in-memory DF session ID (this will not persist on restart it's just there for convenience)

```
{
  "sessionId": "<your session id here>"
}
```
