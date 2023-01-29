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

# Limitations

- Can't login using Patreon credentials - you have to go to the DF website in your browser and get the sessionid cookie - however this does seem to last indefinitely unless you log in from somewhere else.
- There are some unhandled promise rejections. If you run on a version of node that explodes when this happens without the appropriate flags set, this could be a problem. For the record I've been running this on node 14.

## Configuration

This is configured using environment variables. The reason for this is that it is designed to run in a container.

See dev.env.sample for a list of configurable options

## Environment variables

### DF_SESSION_ID

**REQUIRED**

Your session ID cookie. I haven't implemented Patreon login, so you'll have to use your browser, login to digitalfoundry.net then use your browser's dev tools to grab your sessionid cookie. ~~Seems to expire after about 2 weeks.~~

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

### IGNORE_OLD_CONTENT

If set to true (which is the default), on first run (if ${CONFIG_DIR}/ignorelist.txt doesn't exist) the downloader will populate the ignore list with all existing DF videos to ensure it only fetches future videos. I highly recommend leaving this set to true and if you want to download older videos, have the downloader generate the list, manually remove the ones you want to download, then restart the downloader

### PUSHBULLET_API_KEY

If you use pushbullet you can have the downloader send you notifications

### PUSHBULLET_SUBSCRIBED_NOTIFICATIONS

Which events to send to pushbullet. Valid options are:

- DOWNLOAD_COMPLETE
- DOWNLOAD_FAILED
- DOWNLOAD_STARTING
- NEW_CONTENT_DETECTED
- DOWNLOAD_QUEUED

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
