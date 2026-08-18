FROM --platform=linux/amd64 node:24

# Create app directory
WORKDIR /usr/src/app

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
