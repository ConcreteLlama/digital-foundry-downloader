docker run -d \
  --env PUBLIC_ADDRESS=http://localhost:44556 \
  -v C:/Users/concretellama/Downloads:/working_dir \
  -v C:/Users/concretellama/Videos:/destination_dir \
  -v C:/Users/concretellama/df-downloader/config:/config \
  -v C:/Users/concretellama/df-downloader/db:/db \
  -p 44556:44556 \
  concretellama/df-downloader-node:latest