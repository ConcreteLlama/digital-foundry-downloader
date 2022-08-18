IMAGE_NAME=$1
DOCKER_REGISTRY=$2

if [[ $IMAGE_NAME == "" ]]; then
   echo "Must supply image name as first arg"
   exit 1
fi

if [[ $DOCKER_REGISTRY == "" ]]; then
   echo "Must supply docker registry as second arg"
   exit 1
fi

echo "Updating ${IMAGE_NAME} on ${DOCKER_REGISTRY}"

IMAGE_REMOTE_NAME="${DOCKER_REGISTRY}/${IMAGE_NAME}"
IMAGE_ID=`docker images -q ${IMAGE_NAME}`
echo "Current image id is ${IMAGE_ID}"
docker build . -t ${IMAGE_NAME}
IMAGE_ID=`docker images -q ${IMAGE_NAME}`
echo "New image id is ${IMAGE_ID}"
docker tag ${IMAGE_ID} ${IMAGE_REMOTE_NAME}
docker push ${IMAGE_REMOTE_NAME}