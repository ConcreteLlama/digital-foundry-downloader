FROM --platform=linux/amd64 node:20

# Create app directory
WORKDIR /usr/src/app

ENV CONFIG_DIR=/config
ENV DB_DIR=/db
ENV CONTAINER_ENV=docker

RUN npm i yalc@1.0.0-pre.53 -g

COPY df-downloader-common ./df-downloader-common

RUN cd df-downloader-common && npm ci && npm run build && npx rimraf node_modules

COPY df-downloader-ui ./df-downloader-ui

RUN cd df-downloader-ui && yalc add df-downloader-common && npm ci && npm run build && npx rimraf node_modules

COPY df-downloader-service ./df-downloader-service

RUN cd df-downloader-service && yalc add df-downloader-common && npm ci
RUN cd df-downloader-service && npm run build
RUN cd df-downloader-service && npm run get-ui

RUN mkdir -p /config
RUN mkdir -p /working_dir
RUN mkdir -p /destination_dir
RUN mkdir -p /db

CMD [ "node", "df-downloader-service/dist/index.js" ]