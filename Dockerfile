from node:14

# Create app directory
WORKDIR /usr/src/app

RUN mkdir -p /config
RUN mkdir -p /working_dir
RUN mkdir -p /destination_dir

ENV WORK_DIR=/working_dir
ENV DESTINATION_DIR=/destination_dir
ENV CONFIG_DIR=/config

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./

RUN npm install

# Bundle app source
COPY src ./src
COPY public ./public
COPY tsconfig.json ./

RUN npm run build

CMD [ "node", "dist/index.js" ]