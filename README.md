# DF Downloader

DF Downloader is an application designed to download the latest Digital Foundry videos when they are available. This will only work in any useful manner if you are a Patreon subscriber.

_NOTE - This is a personal project that I developed for my own use and has been consistently working for me for some time. I thought I'd put it out there as I found it so useful. I don't get much time to actually work on it but try to keep it updated if it breaks or doesn't work quite as expected._

# Features

- Downloads new Digital Foundry videos when available
- Tags downloaded media with title, synopsis, date and tags (as genre tags)
- Has a download queue to limit the number of simultaneous downloads
- If a download fails, it will attempt to continue from the point it failed (e.g. if 50% through will continue from 50%)
- Can send pushbullet notifications when various events occur
- Has a really terrible web UI for adding videos manually and updating the sessionid cookie (won't persist on a restart), I just knocked something together so I can easily add videos that are either old or didn't show in the feed.
- Stores download history in a very simple "DB" using lowdb (so basically it just writes to a JSON file) so it doesn't keep redownloading the same content on restart.
- Ability to automatically generate subtitles for videos using Deepgram (experimental).

# Limitations

- Can't login using Patreon credentials - you have to go to the DF website in your browser and get the sessionid cookie - however this does seem to last indefinitely unless you log in from somewhere else.
- There are some unhandled promise rejections. If you run on a version of node that explodes when this happens without the appropriate flags set, this could be a problem. For the record I've been running this on node 14.

# Notes on behaviour

On first run, this will scan the entire DF archive and build up a DB of all available content. On future runs, it will check every archive page at the beginning to see if it's missing anything. The first run can take quite a while - it does fetch multiple pages simultaenously but the last thing I want is for this tool to hammer the DF site unnecessarily. Maybe I've been a little over-cautious in this regard.

Either way, currently the size of the DB after first run is upward of 3.5MB.

If you want to limit the impact of this, set MAX_ARCHIVE_DEPTH

It will also scan your destination dir for existing downloaded content. This behaviour can be disabled with SCAN_EXISTING_FILES=false

## Installation

### Local

Ensure you have npm installed. Then run

```
npm i
```

to install all modules then

```
npm run build
```

to build the TypeScript ready to run

### In a Docker container

If you have docker installed, you can run

```
docker build . -t  concretellama/df-downloader-node
```

## Usage

### Running locally

You can run it locally by setting all the config in dev.env then running:

`npm run dev`

### Running in docker

Alternatively you can build this into a docker container and deploy it somewhere. Ensure you have volumes mapped for /config, /working_dir and /destination_dir and all environment variables setup.

If you have docker ready to go then here's an example command to get you going (obviously replace all the paths with paths relevant to your setup):

```
docker run -d --env-file ./dev.env --env WORK_DIR=/working_dir --env DESTINATION_DIR=/destination_dir --env CONFIG_DIR=/config -v C:/Users/concretellama/Downloads:/working_dir -v C:/Users/concretellama/Videos:/destination_dir -v C:/Users/concretellama/df-downloader/config:/config docker.io/concretellama/df-downloader-node
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

This is configured using environment variables. The reason for this is that it is designed to run in a container.

See dev.env.sample for a list of configurable options

## Environment variables

### DF_SESSION_ID

**REQUIRED**

Your session ID cookie. I haven't implemented Patreon login, so you'll have to use your browser, login to digitalfoundry.net then use your browser's dev tools to grab your sessionid cookie. ~~Seems to expire after about 2 weeks.~~ This used to expire every 2 weeks but now seems to persist indefinitely as long as you don't log in anywhere else.

To get this in Chrome, for example:
... > More Tools > Developer Tools > Application > Cookies > https://www.digitalfoundry.net > sessionid

Note: It's the sessionid cookie not the session_id one. From what I've seem the sessionid cookie is always lowercase alphanumeric, no special chars.

### DESTINATION_DIR

**REQUIRED**

The path to move the downloaded and tagged media to once it's finished

### CONFIG_DIR

**REQUIRED**

Currently the only thing stored here is the DB json.

### MAX_SIMULTANEOUS_DOWNLOADS

**REQUIRED**

Total number of simultaneous downloads

### WORK_DIR

Default: work_dir

This is where content is downloaded to and metadata is added

### DOWNLOAD_DELAY

Default: 60000

How long to wait after detecting there's new content to download. This exists because I found that sometimes content was published but the download wasn't quite ready. May no longer be the case but what's a minute, eh? Time specified in milliseconds.

### HTTP_PORT

Default: 44556

The HTTP port for the terrible web UI and API

### HTTP_ENABLED

Default: true

Set this to false if you don't want to host a terrible and unsecured web UI.

### CONTENT_CHECK_INTERVAL

Default: 60000
Min: 30000

How frequently to check for new content. Time specified in milliseconds.

### LOG_LEVEL

Set the log level. Valid levels (although not all are used) are:

- ERROR
- WARN
- INFO
- VERBOSE
- DEBUG
- SILLY

### MEDIA_TYPE_PRIORITIES

DEFAULT: HEVC,h.264 (4K),h.264 (1080p),h.264,MP3

Sets media type priorities. It'll always download _something_ if it's available but this is the priority (from highest to lowest). In the below example, HEVC is the most preferred media type.

```
MEDIA_TYPE_PRIORITIES=HEVC,h.264
```

### MAX_ARCHIVE_DEPTH

DEFAULT: Infinity

Sets the maximum depth to go through the DF archive pages when scanning for content

### SCAN_FOR_EXISTING_FILES

DEFAULT: true

Sets whether or not to scan your filesystem for existing files + update the db. If your destination is a network drive and you're
experiencing a slow startup it's probably worth setting this to false.

### MAX_CONNECTIONS_PER_DOWNLOAD

DEFAULT: 1

Set maximum number of simultaneous connections per download. This is a bit experimental at this stage so.. here there be dragons and all that.
If your download speeds are slower than expected, try this out. Once I've run this for a while without issues I'll update the default

### PUSHBULLET_API_KEY

If you use pushbullet you can have the downloader send you notifications

### PUSHBULLET_SUBSCRIBED_NOTIFICATIONS

Which events to send to pushbullet. Valid options are:

- DOWNLOAD_COMPLETE
- DOWNLOAD_FAILED
- DOWNLOAD_STARTING
- NEW_CONTENT_DETECTED
- DOWNLOAD_QUEUED

# DEEPGRAM_API_KEY

Set this if you want to automatically generate subtitles for downloaded videos using Deepgram. Note that this feature is kinda new and experimental.

Also you may get some weird results.

# REST API

Currently there's a very basic REST API that's not really properly utilised as I haven't had the time to develop a web frontend for this. However if you're interested:

_Note: These are all liable to change_

## GET /queryContent

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

## GET /tags

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
