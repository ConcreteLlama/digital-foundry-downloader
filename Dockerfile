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
    && apt-get install -y --no-install-recommends cmake libvulkan-dev glslc glslang-tools spirv-headers \
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
# The source tree and build directory are removed in the same RUN as they are
# created, so the layer holds ~16MB of artifacts rather than a full checkout
# and build tree. Nothing about the final image changes - only what gets
# cached, which is the difference between restoring this stage costing
# megabytes or hundreds of them.
# The costs are small and were measured, not assumed: ~13MB of image and
# about ten seconds of build time. Dispatch itself is one dlopen at startup,
# and choosing per host beats a fixed baseline - on a machine with AVX-512 it
# encoded ~20% faster than the same build capped at AVX2.
# Vulkan-Headers from source, because Debian bookworm ships 1.3.239 and the
# pinned ggml revisions use VK_EXT_layer_settings, which landed in 1.3.272.
# Building against the distro headers fails with "LayerSettingEXT is not a
# member of vk".
#
# Headers only, so this changes nothing about the resulting binary's glibc or
# runtime requirements - the loader itself is still Debian's libvulkan1, whose
# ABI is stable and forward-compatible. Pinned for the same reason as the ggml
# refs: an unpinned clone would drift under us between builds.
ARG VULKAN_HEADERS_REF=v1.4.309
RUN git clone --depth 1 --branch ${VULKAN_HEADERS_REF} https://github.com/KhronosGroup/Vulkan-Headers.git /tmp/vulkan-headers \
    && cmake -S /tmp/vulkan-headers -B /tmp/vulkan-headers/build -DCMAKE_INSTALL_PREFIX=/usr/local \
    && cmake --install /tmp/vulkan-headers/build \
    && rm -rf /tmp/vulkan-headers
RUN git clone --depth 1 --branch ${WHISPER_CPP_REF} https://github.com/ggml-org/whisper.cpp.git /tmp/whisper.cpp \
    && cmake -S /tmp/whisper.cpp -B /tmp/whisper.cpp/build \
        -DCMAKE_BUILD_TYPE=Release \
        -DBUILD_SHARED_LIBS=ON \
        -DWHISPER_BUILD_TESTS=OFF \
        -DWHISPER_BUILD_SERVER=OFF \
        -DGGML_NATIVE=OFF \
        -DGGML_BACKEND_DL=ON \
        -DGGML_CPU_ALL_VARIANTS=ON \
        -DGGML_VULKAN=ON \
        -DGGML_BACKEND_DIR=/usr/local/lib/whisper \
    && cmake --build /tmp/whisper.cpp/build --config Release -j "$(nproc)" --target whisper-cli \
    && mkdir -p /opt/whisper \
    && cp -a /tmp/whisper.cpp/build/bin/whisper-cli /tmp/whisper.cpp/build/bin/*.so* /opt/whisper/ \
    && rm -rf /tmp/whisper.cpp

# llama.cpp powers local AI content analysis - summaries, tags and the
# structured breakdown produced on this machine rather than through a paid API.
# Same upstream project and the same ggml build system as whisper.cpp above, so
# this stage is deliberately near-identical; see that one for why each flag is
# set, since the reasoning is the same.
#
# Pinned for the same reason, and bumped intentionally.
FROM --platform=linux/amd64 node:24 AS llama-builder
ARG LLAMA_CPP_REF=b10733
RUN apt-get update \
    && apt-get install -y --no-install-recommends cmake libcurl4-openssl-dev libvulkan-dev glslc glslang-tools spirv-headers \
    && rm -rf /var/lib/apt/lists/*
# The one meaningful difference from the whisper stage: RPATH instead of an
# ldconfig entry.
#
# Both projects build their own libggml with the same soname. Putting both
# directories on the global linker path would let whichever ldconfig happened
# to cache first satisfy *both* binaries, and the two are not built from the
# same ggml revision - so one of them would be resolving against a library it
# was never linked against. Baking the search path into llama-server instead
# means it always finds its own, and whisper-cli is left exactly as it was.
# Vulkan-Headers from source, because Debian bookworm ships 1.3.239 and the
# pinned ggml revisions use VK_EXT_layer_settings, which landed in 1.3.272.
# Building against the distro headers fails with "LayerSettingEXT is not a
# member of vk".
#
# Headers only, so this changes nothing about the resulting binary's glibc or
# runtime requirements - the loader itself is still Debian's libvulkan1, whose
# ABI is stable and forward-compatible. Pinned for the same reason as the ggml
# refs: an unpinned clone would drift under us between builds.
ARG VULKAN_HEADERS_REF=v1.4.309
RUN git clone --depth 1 --branch ${VULKAN_HEADERS_REF} https://github.com/KhronosGroup/Vulkan-Headers.git /tmp/vulkan-headers \
    && cmake -S /tmp/vulkan-headers -B /tmp/vulkan-headers/build -DCMAKE_INSTALL_PREFIX=/usr/local \
    && cmake --install /tmp/vulkan-headers/build \
    && rm -rf /tmp/vulkan-headers
RUN git clone --depth 1 --branch ${LLAMA_CPP_REF} https://github.com/ggml-org/llama.cpp.git /tmp/llama.cpp \
    && cmake -S /tmp/llama.cpp -B /tmp/llama.cpp/build \
        -DCMAKE_BUILD_TYPE=Release \
        -DBUILD_SHARED_LIBS=ON \
        -DLLAMA_BUILD_TESTS=OFF \
        -DLLAMA_BUILD_EXAMPLES=OFF \
        -DLLAMA_BUILD_SERVER=ON \
        -DLLAMA_CURL=OFF \
        -DGGML_NATIVE=OFF \
        -DGGML_BACKEND_DL=ON \
        -DGGML_CPU_ALL_VARIANTS=ON \
        -DGGML_VULKAN=ON \
        -DGGML_BACKEND_DIR=/usr/local/lib/llama \
        -DCMAKE_INSTALL_RPATH=/usr/local/lib/llama \
        -DCMAKE_BUILD_WITH_INSTALL_RPATH=ON \
    && cmake --build /tmp/llama.cpp/build --config Release -j "$(nproc)" --target llama-server \
    && mkdir -p /opt/llama \
    && cp -a /tmp/llama.cpp/build/bin/llama-server /tmp/llama.cpp/build/bin/*.so* /opt/llama/ \
    && rm -rf /tmp/llama.cpp

# The application build.
#
# Full node:24 here because this stage needs a toolchain; the shipped image
# below runs the built output and nothing else, so it gets the slim base.
FROM --platform=linux/amd64 node:24 AS app-builder

WORKDIR /usr/src/app

# Skip husky's git-hook install - there's no .git dir in the build context.
ENV HUSKY=0

# Needed at BUILD time, not just at runtime: df-downloader-common's
# make-version-src.js reads GIT_BRANCH and only falls back to inspecting .git,
# which is not in the build context - so without this the build fails with
# ENOENT on /usr/src/app/.git. Also declared in the shipped image below, where
# the app reports it at startup.
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

# Pruned here rather than in the shipped image, which is the entire point of
# this stage. Layers are additive: pruning after the install in the same image
# leaves the dev dependencies sitting in an earlier layer and ships them
# regardless - close to a gigabyte of build tooling that never runs.
RUN npm prune --omit=dev


# The shipped image. Slim rather than full node:24: nothing here compiles, and
# the difference between the two bases is about 1.3GB of toolchain.
FROM --platform=linux/amd64 node:24-slim

# Create app directory
WORKDIR /usr/src/app

# Runtime libraries for the two bundled binaries, plus GPU support.
#
# libgomp1 is the OpenMP runtime both whisper.cpp and llama.cpp link for CPU
# threading. The full node image carried it via buildpack-deps; the slim base
# does not, and without it both binaries die at startup with "error while
# loading shared libraries: libgomp.so.1" - before printing anything of their
# own, so it reads as the feature being broken rather than a missing package.
#
# GPU acceleration for both whisper.cpp and llama.cpp, via Vulkan.
#
# Vulkan rather than CUDA, ROCm or SYCL because one backend covers NVIDIA, AMD
# and Intel from a single image and needs no vendor runtime baked in. The
# alternatives are one vendor per image: CUDA alone would mean a separate tag,
# a multi-gigabyte runtime, and every user installing a container toolkit
# before the image would start at all.
#
# Safe on a machine with no GPU. GGML_BACKEND_DL means backends are dlopened at
# startup and the Vulkan one is skipped when it finds no usable device, so a
# CPU-only host behaves exactly as it did before - which is what makes shipping
# this in the default image reasonable rather than a separate fork of it.
#
# mesa-vulkan-drivers supplies the Intel (ANV) and AMD (RADV) drivers. NVIDIA
# is deliberately absent and cannot be added here: its Vulkan ICD is injected
# at runtime by the NVIDIA container toolkit, and only when the container is
# given the "graphics" driver capability - the default of "compute,utility"
# leaves Vulkan seeing no device at all on an otherwise working card.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 libvulkan1 mesa-vulkan-drivers \
    && rm -rf /var/lib/apt/lists/*

COPY --from=whisper-builder /opt/whisper/whisper-cli /usr/local/bin/whisper-cli
# The backend variants and the whisper/ggml shared libraries. GGML_BACKEND_DIR
# above compiles this path in, so the binary finds the variants wherever it is
# run from; ldconfig is what lets the dynamic linker resolve libwhisper and
# libggml themselves.
COPY --from=whisper-builder /opt/whisper/*.so* /usr/local/lib/whisper/
RUN echo /usr/local/lib/whisper > /etc/ld.so.conf.d/whisper.conf && ldconfig
# Picked up by WhisperSubtitleGenerator when no explicit binaryPath is set.
ENV WHISPER_BINARY=/usr/local/bin/whisper-cli

COPY --from=llama-builder /opt/llama/llama-server /usr/local/bin/llama-server
# Deliberately not added to /etc/ld.so.conf.d - llama-server carries an RPATH
# pointing here, so it resolves its own ggml without putting a second copy on
# the global path for whisper-cli to trip over. See the builder stage.
COPY --from=llama-builder /opt/llama/*.so* /usr/local/lib/llama/
# Picked up by the local analysis provider when no explicit binaryPath is set.
# The model itself is not shipped - it is several gigabytes and is downloaded
# on first use, the same as Whisper models.
ENV LLAMA_SERVER_BINARY=/usr/local/bin/llama-server

ENV CONFIG_DIR=/config
ENV DB_DIR=/db
ENV CONTAINER_ENV=docker
# Skip husky's git-hook install - there's no .git dir in the build context.
ARG GIT_BRANCH=unknown
ENV GIT_BRANCH=${GIT_BRANCH}

# The built application, with dev dependencies already pruned away above.
COPY --from=app-builder /usr/src/app /usr/src/app

RUN mkdir -p /config
RUN mkdir -p /working_dir
RUN mkdir -p /destination_dir
RUN mkdir -p /db

CMD [ "node", "df-downloader-service/dist/index.js" ]
