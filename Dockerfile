# whisper.cpp powers the "whisper" subtitles service - local speech-to-text,
# so subtitles need no API key, cost nothing per use, and are timed against
# the downloaded file itself. Built in its own stage so cmake and the build
# tree don't end up in the shipped image; only the single static binary is
# copied across.
#
# Pinned deliberately rather than tracking master: this is a fast-moving
# project and an unpinned build would change under us between images. Bump
# it intentionally.
FROM --platform=linux/amd64 node:24 AS whisper-builder
ARG WHISPER_CPP_REF=b4938
RUN apt-get update \
    && apt-get install -y --no-install-recommends cmake \
    && rm -rf /var/lib/apt/lists/*
# BUILD_SHARED_LIBS=OFF so the result is one self-contained binary - the
# alternative is tracking libggml/libwhisper .so files across the stage
# boundary for no benefit.
#
# GGML_NATIVE=OFF is load-bearing. It defaults ON, which compiles with
# -march=native - for whatever CPU happens to run `docker build`. The result
# is an image that runs only on machines at least as capable as the one that
# built it, failing as SIGILL (illegal instruction) the moment whisper
# reaches an instruction the host doesn't implement. That is a miserable
# failure to diagnose: the signal kills the process outright so the tool
# never gets to explain itself, and it depends on the build machine rather
# than on anything visible in the image.
#
# The explicit feature list targets Haswell (2013). AVX2/FMA/F16C are
# supported by anything plausibly running this, including Intel's N-series -
# Alder Lake-N has AVX2 but NOT AVX-512, which is exactly the gap that bit
# us. Set explicitly rather than left to ggml's defaults so a version bump
# can't quietly widen the baseline. Anyone wanting a build tuned to their own
# machine can point the Whisper "binary path" setting at one.
RUN git clone --depth 1 --branch ${WHISPER_CPP_REF} https://github.com/ggml-org/whisper.cpp.git /tmp/whisper.cpp \
    && cmake -S /tmp/whisper.cpp -B /tmp/whisper.cpp/build \
        -DCMAKE_BUILD_TYPE=Release \
        -DBUILD_SHARED_LIBS=OFF \
        -DWHISPER_BUILD_TESTS=OFF \
        -DWHISPER_BUILD_SERVER=OFF \
        -DGGML_NATIVE=OFF \
        -DGGML_AVX=ON \
        -DGGML_AVX2=ON \
        -DGGML_FMA=ON \
        -DGGML_F16C=ON \
        -DGGML_AVX512=OFF \
    && cmake --build /tmp/whisper.cpp/build --config Release -j "$(nproc)" --target whisper-cli

FROM --platform=linux/amd64 node:24

# Create app directory
WORKDIR /usr/src/app

COPY --from=whisper-builder /tmp/whisper.cpp/build/bin/whisper-cli /usr/local/bin/whisper-cli
# Picked up by WhisperSubtitleGenerator when no explicit binaryPath is set.
ENV WHISPER_BINARY=/usr/local/bin/whisper-cli

ENV CONFIG_DIR=/config
ENV DB_DIR=/db
ENV CONTAINER_ENV=docker
# Skip husky's git-hook install - there's no .git dir in the build context.
ENV HUSKY=0

ARG GIT_BRANCH=unknown

ENV GIT_BRANCH=${GIT_BRANCH}

# Install dependencies for all three workspaces in one pass. Copying just the
# package.json files first means this layer stays cached across source-only
# changes.
COPY package.json package-lock.json ./
COPY df-downloader-common/package.json ./df-downloader-common/package.json
COPY df-downloader-service/package.json ./df-downloader-service/package.json
# df-downloader-service's postinstall (strip-ffprobe-binaries.cjs) needs its
# scripts/ dir present at npm ci time.
COPY df-downloader-service/scripts ./df-downloader-service/scripts
COPY df-downloader-ui/package.json ./df-downloader-ui/package.json
RUN npm ci

COPY df-downloader-common ./df-downloader-common
COPY df-downloader-ui ./df-downloader-ui
COPY df-downloader-service ./df-downloader-service

# Builds df-downloader-common, then df-downloader-ui, then df-downloader-service,
# then copies the built UI into the service's public dir - see root package.json.
RUN npm run build

RUN npm prune --omit=dev

RUN mkdir -p /config
RUN mkdir -p /working_dir
RUN mkdir -p /destination_dir
RUN mkdir -p /db

CMD [ "node", "df-downloader-service/dist/index.js" ]
