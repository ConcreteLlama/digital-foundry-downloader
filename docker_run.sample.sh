docker run -d \
  --env WORK_DIR="//working_dir" \
  --env DESTINATION_DIR="//destination_dir" \
  --env CONFIG_DIR="//config" \
  --env DB_DIR="//db" \
  --env PUBLIC_ADDRESS=http://127.0.0.1:44556 \
  -v C:/Users/concretellama/Downloads:/working_dir \
  -v C:/Users/concretellama/Videos:/destination_dir \
  -v C:/Users/concretellama/df-downloader/config:/config \
  -v C:/Users/concretellama/df-downloader/db:/db \
  -p 44556:44556 \
  docker.io/concretellama/df-downloader-node