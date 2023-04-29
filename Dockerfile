# TODO: Rewrite this Dockerfile to reflect the new project structure

from node:18

# Create app directory
WORKDIR /usr/src/app

ENV CONFIG_DIR=/config
ENV DB_DIR=/db

RUN npm i yalc@1.0.0-pre.53 -g

COPY df-downloader-common/src ./df-downloader-common/src
COPY df-downloader-common/package.json ./df-downloader-common/package.json
COPY df-downloader-common/package-lock.json ./df-downloader-common/package-lock.json
COPY df-downloader-common/tsconfig.json ./df-downloader-common/tsconfig.json

RUN cd df-downloader-common && npm install
RUN cd df-downloader-common && npm run build

COPY df-downloader-ui/public ./df-downloader-ui/public
COPY df-downloader-ui/src ./df-downloader-ui/src
COPY df-downloader-ui/package.json ./df-downloader-ui/package.json
COPY df-downloader-ui/package-lock.json ./df-downloader-ui/package-lock.json
COPY df-downloader-ui/tsconfig.json ./df-downloader-ui/tsconfig.json

RUN cd df-downloader-ui && yalc add df-downloader-common && npm install
RUN cd df-downloader-ui && npm run build

COPY df-downloader-service/src ./df-downloader-service/src
COPY df-downloader-service/package.json ./df-downloader-service/package.json
COPY df-downloader-service/package-lock.json ./df-downloader-service/package-lock.json
COPY df-downloader-service/tsconfig.json ./df-downloader-service/tsconfig.json
COPY df-downloader-service/config_samples/config.docker.yaml ./df-downloader-service/config_samples/config.sample.yaml

RUN cd df-downloader-service && yalc add df-downloader-common && npm install
RUN cd df-downloader-service && npm run build
RUN cd df-downloader-service && npm run get-ui

RUN mkdir -p /config
RUN mkdir -p /working_dir
RUN mkdir -p /destination_dir
RUN mkdir -p /db

CMD [ "node", "df-downloader-service/dist/index.js" ]