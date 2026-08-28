# Running a local Docker build for testing

How to build the image from a working tree and run it against throwaway data,
without touching the real deployment. Written down because the parts that go
wrong are not obvious: the port has to agree with itself in three places, and
the config file holds a credential that must never reach the repo.

## Build

```bash
docker build -t df-downloader:local .
```

Two to eight minutes depending on cache. The whisper.cpp stage is the slow
part and only rebuilds when `WHISPER_CPP_REF` or its build command changes -
see the comments in the `Dockerfile` for why it is built the way it is.

## Where things live

Put the host directories somewhere scratch - **not** in the repo. `config.yaml`
holds the Digital Foundry session cookie, and a stray `git add -A` committing
it would publish a live credential. A session scratchpad directory is ideal.

| Host                   | Container         | What it holds                                    |
| ---------------------- | ----------------- | ------------------------------------------------ |
| `<scratch>/config`     | `/config`         | `config.yaml`, `users.yaml`, `jwt-secret.yaml`   |
| `<scratch>/db`         | `/db`             | content, pipeline and status databases           |
| `<scratch>/dest`       | `/destination_dir`| finished downloads                               |
| `<scratch>/work`       | `/working_dir`    | in-progress downloads, extracted audio           |
| `<scratch>/models`     | `/models`         | Whisper models - optional, see below             |

`CONFIG_DIR` and `DB_DIR` are already set in the image; the other three are
whatever `config.yaml` points at, so they must match the container paths in
the table, not the host ones.

The models mount is worth having. Whisper fetches its model on first use
(148MB for `base.en`, 488MB for `small.en`) and defaults to
`/config/whisper-models`. Keeping models on their own mount means you can
throw the config directory away without re-downloading them.

## Run

```bash
docker run -d --name df-test \
  -p 44557:44557 \
  -v <scratch>/config:/config \
  -v <scratch>/db:/db \
  -v <scratch>/dest:/destination_dir \
  -v <scratch>/work:/working_dir \
  -v <scratch>/models:/models \
  df-downloader:local
```

Pick a port that does not collide with the real deployment (which uses
**44556**). The example uses 44557 for that reason.

## Configuring it

On first boot, `config.yaml` is copied from `config_samples/config.sample.yaml`
if it is not already there. Edit it and restart the container, or use the
settings UI once you can log in.

Things that actually catch people out:

- **The port must agree in four places**: `-p`, `restApi.http.port`,
  `restApi.publicAddress` and `restApi.allowOrigin`. Get one wrong and the UI
  loads but cannot reach the API, which looks like the app being broken rather
  than misconfigured.
- **`sessionId` is the DF `autologin` cookie.** Ask the user for it - it is a
  live credential, it cannot be derived, and it should never be echoed into a
  transcript or a commit. Without it the app boots and signs in as nobody,
  which is fine for testing anything that does not touch the site.
- **Two unrelated logins exist.** `users.yaml` is the app's own account,
  created through the UI on first visit. It is not the DF session. See
  `CLAUDE.md` - conflating them wastes a lot of time.
- **Turn automatic downloads off** (`automaticDownloads.enabled: false`) unless
  you are specifically testing them, or a fresh install will start pulling the
  archive.
- **Leave the request spacing conservative** (`requestSpacingMinMs` /
  `requestSpacingMaxMs`). It is a real site, and a test container hammering it
  is the user's account taking the consequences.

A known-good subtitles block for local testing, transcribing after the
download rather than blocking it:

```yaml
subtitles:
  servicePriorities:
    - whisper
  services:
    whisper:
      model: base.en
      threads: 8
      modelDir: /models
      language: en
  automaticGeneration: after_download
  output: auto
```

## After a code change

```bash
docker build -t df-downloader:local . && docker rm -f df-test && docker run -d ... # as above
```

Config and database survive, because they are on the host. Note that a
pipeline interrupted this way is resumed on the next start rather than
restarted, which is itself worth testing - see `docs/ROADMAP.md`.

## Checking it came up

```bash
docker logs -f df-test
```

To confirm Whisper works on this machine - it prints the CPU backend it chose,
then complains about the audio file, which is the expected outcome:

```bash
docker exec df-test /usr/local/bin/whisper-cli -m /models/ggml-base.en.bin -f /dev/null
```

A `SIGILL` here means the binary does not match the CPU. That should be
impossible now (the image ships a variant per CPU generation) but it is the
first thing to check if Whisper dies with no error message.

## Cleaning up

```bash
docker rm -f df-test
```

The image and the host directories persist; remove them separately when done.
