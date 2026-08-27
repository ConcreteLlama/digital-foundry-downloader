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
# Built as shared libraries with GGML_CPU_ALL_VARIANTS, which compiles one
# .so per CPU generation - x64, sse42, sandybridge, ivybridge, haswell,
# alderlake, zen4, icelake and so on, fourteen of them - and selects the best
# one the host actually supports at startup. This is what makes the image run
# anywhere rather than only on machines as capable as whichever one built it,
# including the Atom-class chips (Gemini Lake, Jasper Lake) common in NAS
# builds, which have no AVX at all and fall back to the sse42 variant.
#
# GGML_NATIVE=OFF is load-bearing, and was the original bug. It defaults ON,
# compiling with -march=native for whatever CPU happened to run
# `docker build`. The result died with SIGILL - an illegal instruction, which
# kills the process outright, so whisper never got to explain itself - on any
# host missing an instruction the build machine had. Built on a Ryzen 9
# 9950X3D that meant AVX-512, which an Intel N305 does not implement. Worse,
# the published image is built on ubuntu-latest, whose runner fleet mixes
# Intel and AMD, so what the image required varied per build with nothing in
# the repo to explain why.
#
# The costs are small and were measured, not assumed: ~13MB of image and
# about ten seconds of build time. Dispatch itself is one dlopen at startup,
# and choosing per host beats a fixed baseline - on a machine with AVX-512 it
# encoded ~20% faster than the same build capped at AVX2.
RUN git clone --depth 1 --branch ${WHISPER_CPP_REF} https://github.com/ggml-org/whisper.cpp.git /tmp/whisper.cpp \
    && cmake -S /tmp/whisper.cpp -B /tmp/whisper.cpp/build \
        -DCMAKE_BUILD_TYPE=Release \
        -DBUILD_SHARED_LIBS=ON \
        -DWHISPER_BUILD_TESTS=OFF \
        -DWHISPER_BUILD_SERVER=OFF \
        -DGGML_NATIVE=OFF \
        -DGGML_BACKEND_DL=ON \
        -DGGML_CPU_ALL_VARIANTS=ON \
        -DGGML_BACKEND_DIR=/usr/local/lib/whisper \
    && cmake --build /tmp/whisper.cpp/build --config Release -j "$(nproc)" --target whisper-cli

FROM --platform=linux/amd64 node:24

# Create app directory
WORKDIR /usr/src/app

COPY --from=whisper-builder /tmp/whisper.cpp/build/bin/whisper-cli /usr/local/bin/whisper-cli
# The backend variants and the whisper/ggml shared libraries. GGML_BACKEND_DIR
# above compiles this path in, so the binary finds the variants wherever it is
# run from; ldconfig is what lets the dynamic linker resolve libwhisper and
# libggml themselves.
COPY --from=whisper-builder /tmp/whisper.cpp/build/bin/*.so* /usr/local/lib/whisper/
RUN echo /usr/local/lib/whisper > /etc/ld.so.conf.d/whisper.conf && ldconfig
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
